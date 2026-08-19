import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  Injectable,
  NotFoundException,
  Param,
  Patch,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ConfigService } from '@nestjs/config';
import { TaskPriority } from '@prisma/client';
import { DatabaseService } from './database.service';
import { AuthGuard, AuthUser, CurrentUser } from './auth';
import { NotificationsService } from './notifications.module';

export class TaskDto {
  @IsString() @MaxLength(120) title!: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsDateString() deadline?: string;
  @IsOptional() @IsEnum(TaskPriority) priority?: TaskPriority;
  @IsOptional() @IsString() @MaxLength(60) category?: string;
}

export class UpdateTaskDto {
  @IsOptional() @IsString() @MaxLength(120) title?: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsDateString() deadline?: string;
  @IsOptional() @IsEnum(TaskPriority) priority?: TaskPriority;
  @IsOptional() @IsString() @MaxLength(60) category?: string;
  @IsOptional() @IsBoolean() completed?: boolean;
  @IsOptional() @IsDateString() snoozedUntil?: string;
}

@Injectable()
export class TasksService {
  constructor(
    private readonly db: DatabaseService,
    private readonly notifications: NotificationsService,
  ) {}

  list(userId: string) {
    return this.db.task.findMany({
      where: { userId },
      orderBy: [{ completed: 'asc' }, { deadline: 'asc' }, { createdAt: 'desc' }],
    });
  }

  create(userId: string, dto: TaskDto) {
    return this.db.task.create({
      data: {
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        deadline: dto.deadline ? new Date(dto.deadline) : null,
        priority: dto.priority ?? TaskPriority.medium,
        category: dto.category?.trim() || null,
        userId,
      },
    });
  }

  async update(userId: string, id: string, dto: UpdateTaskDto) {
    const task = await this.db.task.findFirst({ where: { id, userId } });
    if (!task) throw new NotFoundException('TASK_NOT_FOUND');
    const completedAt =
      dto.completed === true
        ? new Date()
        : dto.completed === false
          ? null
          : undefined;
    return this.db.task.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description.trim() || null }
          : {}),
        ...(dto.deadline !== undefined
          ? { deadline: new Date(dto.deadline) }
          : {}),
        ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
        ...(dto.category !== undefined
          ? { category: dto.category.trim() || null }
          : {}),
        ...(dto.completed !== undefined ? { completed: dto.completed } : {}),
        ...(dto.snoozedUntil !== undefined
          ? { snoozedUntil: new Date(dto.snoozedUntil) }
          : {}),
        ...(completedAt !== undefined ? { completedAt } : {}),
        ...(dto.completed === true
          ? {
              reminder7SentAt: task.reminder7SentAt ?? new Date(),
              reminder2SentAt: task.reminder2SentAt ?? new Date(),
            }
          : {}),
      },
    });
  }

  async remove(userId: string, id: string) {
    const task = await this.db.task.findFirst({ where: { id, userId } });
    if (!task) throw new NotFoundException('TASK_NOT_FOUND');
    return this.db.task.delete({ where: { id } });
  }

  async processReminders(now = new Date()) {
    const weekLimit = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const twoDayLimit = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
    const tasks = await this.db.task.findMany({
      where: { completed: false, deadline: { gt: now, lte: weekLimit } },
    });
    let sent = 0;
    for (const task of tasks) {
      const twoDay = task.deadline! <= twoDayLimit;
      const alreadySent = twoDay ? task.reminder2SentAt : task.reminder7SentAt;
      if (alreadySent || (task.snoozedUntil && task.snoozedUntil > now)) continue;
      if (twoDay) {
        await this.db.task.update({
          where: { id: task.id },
          data: { reminder2SentAt: now },
        });
      } else {
        await this.db.task.update({
          where: { id: task.id },
          data: { reminder7SentAt: now },
        });
      }
      const title = twoDay ? 'باقي يومين على المهمة' : 'اقترب موعد المهمة';
      const body =
        task.title +
        ' - الموعد ' +
        task.deadline!.toLocaleDateString('ar-IQ');
      const result = await this.notifications.send(task.userId, title, body);
      sent += result.sent;
    }
    return { checked: tasks.length, sent };
  }
}

@Controller('tasks')
@UseGuards(AuthGuard)
export class TasksController {
  constructor(private readonly tasks: TasksService) {}
  @Get() list(@CurrentUser() user: AuthUser) {
    return this.tasks.list(user.id);
  }
  @Post() create(@CurrentUser() user: AuthUser, @Body() dto: TaskDto) {
    return this.tasks.create(user.id, dto);
  }
  @Patch(':id') update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasks.update(user.id, id, dto);
  }
  @Delete(':id') remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tasks.remove(user.id, id);
  }
}

@Controller('jobs')
export class TaskReminderJobController {
  constructor(
    private readonly tasks: TasksService,
    private readonly config: ConfigService,
  ) {}

  @Post('task-reminders')
  run(@Headers('x-job-secret') secret?: string) {
    const expected = this.config.get<string>('TASK_REMINDER_JOB_SECRET');
    if (!expected) throw new UnauthorizedException('JOB_NOT_CONFIGURED');
    if (!secret || secret !== expected)
      throw new ForbiddenException('INVALID_JOB_SECRET');
    return this.tasks.processReminders();
  }
}
