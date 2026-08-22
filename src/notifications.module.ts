import {
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsIn, IsString } from 'class-validator';
import { ConfigService } from '@nestjs/config';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { DatabaseService } from './database.service';
import { AuthGuard, AuthUser, CurrentUser } from './auth';

export class DeviceDto {
  @IsString() token!: string;
  @IsIn(['ios', 'android']) platform!: string;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
  ) {}

  register(userId: string, device: DeviceDto) {
    return this.db.notificationDevice.upsert({
      where: { token: device.token },
      create: { ...device, userId },
      update: { userId, platform: device.platform },
    });
  }

  removeDevice(userId: string, token: string) {
    return this.db.notificationDevice.deleteMany({ where: { userId, token } });
  }

  list(userId: string) {
    return this.db.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async markRead(userId: string, id: string) {
    const result = await this.db.notification.updateMany({
      where: { id, userId },
      data: { readAt: new Date() },
    });
    if (!result.count) throw new NotFoundException('NOTIFICATION_NOT_FOUND');
    return this.db.notification.findFirstOrThrow({ where: { id, userId } });
  }

  async remove(userId: string, id: string) {
    const result = await this.db.notification.deleteMany({ where: { id, userId } });
    if (!result.count) throw new NotFoundException('NOTIFICATION_NOT_FOUND');
    return { deleted: true };
  }

  async send(userId: string, title: string, body: string) {
    try {
      const notification = await this.db.notification.create({
        data: { userId, title, body },
      });
      const devices = await this.db.notificationDevice.findMany({ where: { userId } });
      const projectId = this.config.get<string>('FIREBASE_PROJECT_ID');
      const clientEmail = this.config.get<string>('FIREBASE_CLIENT_EMAIL');
      const privateKey = this.config.get<string>('FIREBASE_PRIVATE_KEY');

      if (!devices.length || !projectId || !clientEmail || !privateKey)
        return { sent: 0, notificationId: notification.id };

      if (!getApps().length)
        initializeApp({
          credential: cert({
            projectId,
            clientEmail,
            privateKey: privateKey.replace(/\\n/g, '\n'),
          }),
          projectId,
        });

      const result = await getMessaging().sendEachForMulticast({
        tokens: devices.map(device => device.token),
        notification: { title, body },
        data: { notificationId: notification.id },
      });
      const invalid = devices
        .filter((_, index) => !result.responses[index].success)
        .map(device => device.token);
      if (invalid.length)
        await this.db.notificationDevice.deleteMany({ where: { token: { in: invalid } } });

      return {
        sent: result.successCount,
        failed: result.failureCount,
        notificationId: notification.id,
      };
    } catch {
      return { sent: 0 };
    }
  }
}

@Controller('notifications')
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.notifications.list(user.id);
  }

  @Post('devices')
  register(@CurrentUser() user: AuthUser, @Body() device: DeviceDto) {
    return this.notifications.register(user.id, device);
  }

  @Delete('devices')
  removeDevice(@CurrentUser() user: AuthUser, @Body() device: DeviceDto) {
    return this.notifications.removeDevice(user.id, device.token);
  }

  @Patch(':id/read')
  markRead(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.notifications.markRead(user.id, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.notifications.remove(user.id, id);
  }
}
