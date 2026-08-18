import {
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from "class-validator";
import { DatabaseService } from "./database.service";
import { AuthGuard, AuthUser, CurrentUser } from "./auth";
import { NotificationsService } from "./notifications.module";
import {
  TransactionSource,
  TransactionStatus,
  TransactionType,
  SavingsStatus,
} from "@prisma/client";
export class TransactionDto {
  @IsInt() @Min(1) amount!: number;
  @IsEnum(TransactionType) type!: TransactionType;
  @IsString() description!: string;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsEnum(TransactionSource) source?: TransactionSource;
  @IsOptional() @IsEnum(TransactionStatus) status?: TransactionStatus;
  @IsOptional() @IsDateString() transactionDate?: string;
}
export class IncomeDto {
  @IsInt() @Min(1) amount!: number;
  @IsString() type!: string;
  @IsInt() @Min(1) payDay!: number;
  @IsOptional() @IsBoolean() recurring?: boolean;
}
export class CategoryDto {
  @IsString() name!: string;
  @IsOptional() @IsString() icon?: string;
}
export class BudgetDto {
  @IsInt() @Min(1) amount!: number;
  @IsDateString() startDate!: string;
  @IsDateString() endDate!: string;
  @IsOptional() @IsString() categoryId?: string;
}
export class SavingsDto {
  @IsString() name!: string;
  @IsInt() @Min(1) targetAmount!: number;
  @IsOptional() @IsInt() @Min(0) currentAmount?: number;
  @IsOptional() @IsDateString() targetDate?: string;
  @IsOptional() @IsEnum(SavingsStatus) status?: SavingsStatus;
}
@Injectable()
export class FinanceService {
  constructor(
    private readonly db: DatabaseService,
    private readonly notifications: NotificationsService,
  ) {}
  private async own(userId: string, id: string) {
    const x = await this.db.transaction.findFirst({ where: { id, userId } });
    if (!x) throw new Error("NOT_FOUND");
    return x;
  }
  transactions(
    userId: string,
    q: {
      page?: number;
      limit?: number;
      from?: string;
      to?: string;
      categoryId?: string;
      source?: TransactionSource;
      type?: TransactionType;
    },
  ) {
    const page = Math.max(1, q.page || 1),
      limit = Math.min(100, Math.max(1, q.limit || 20));
    const where = {
      userId,
      ...(q.categoryId ? { categoryId: q.categoryId } : {}),
      ...(q.source ? { source: q.source } : {}),
      ...(q.type ? { type: q.type } : {}),
      ...(q.from || q.to
        ? {
            transactionDate: {
              ...(q.from ? { gte: new Date(q.from) } : {}),
              ...(q.to ? { lte: new Date(q.to) } : {}),
            },
          }
        : {}),
    };
    return this.db.transaction
      .findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { transactionDate: "desc" },
        include: { category: true },
      })
      .then((data) => ({ data, page, limit }));
  }
  async createTransaction(userId: string, d: TransactionDto) {
    const transaction = await this.db.transaction.create({
      data: {
        amount: d.amount,
        type: d.type,
        description: d.description.trim(),
        userId,
        categoryId: d.categoryId,
        source: d.source || "app",
        status: d.status || "confirmed",
        transactionDate: d.transactionDate
          ? new Date(d.transactionDate)
          : new Date(),
      },
      include: { category: true },
    });
    if (transaction.status === "confirmed") {
      await this.notifications.send(
        userId,
        transaction.type === "income" ? "دخل جديد" : "مصروف جديد",
        `${transaction.description} - ${transaction.amount.toLocaleString("en-US")} د.ع`,
      );
    }
    return transaction;
  }
  async updateTransaction(
    userId: string,
    id: string,
    d: Partial<TransactionDto>,
  ) {
    await this.own(userId, id);
    return this.db.transaction.update({
      where: { id },
      data: {
        ...d,
        ...(d.transactionDate
          ? { transactionDate: new Date(d.transactionDate) }
          : {}),
      },
    });
  }
  async deleteTransaction(userId: string, id: string) {
    await this.own(userId, id);
    return this.db.transaction.delete({ where: { id } });
  }
  createIncome(userId: string, d: IncomeDto) {
    if (d.payDay > 31) throw new Error("INVALID_PAY_DAY");
    return this.db.income.create({ data: { ...d, userId } });
  }
  categories(userId: string) {
    return this.db.category.findMany({
      where: { OR: [{ isSystem: true }, { userId }] },
    });
  }
  createCategory(userId: string, d: CategoryDto) {
    return this.db.category.create({ data: { ...d, userId, isSystem: false } });
  }
  budgets(userId: string) {
    return this.db.budget.findMany({
      where: { userId },
      include: { category: true },
    });
  }
  createBudget(userId: string, d: BudgetDto) {
    if (new Date(d.endDate) <= new Date(d.startDate))
      throw new Error("INVALID_DATE_RANGE");
    return this.db.budget.create({
      data: {
        ...d,
        userId,
        startDate: new Date(d.startDate),
        endDate: new Date(d.endDate),
      },
    });
  }
  savings(userId: string) {
    return this.db.savingsGoal.findMany({ where: { userId } });
  }
  createSavings(userId: string, d: SavingsDto) {
    return this.db.savingsGoal.create({
      data: {
        ...d,
        userId,
        targetDate: d.targetDate ? new Date(d.targetDate) : undefined,
      },
    });
  }
}
@Controller()
@UseGuards(AuthGuard)
export class FinanceController {
  constructor(private readonly f: FinanceService) {}
  @Get("transactions") list(@CurrentUser() u: AuthUser, @Query() q: any) {
    return this.f.transactions(u.id, q);
  }
  @Post("transactions") create(
    @CurrentUser() u: AuthUser,
    @Body() d: TransactionDto,
  ) {
    return this.f.createTransaction(u.id, d);
  }
  @Patch("transactions/:id") update(
    @CurrentUser() u: AuthUser,
    @Param("id") id: string,
    @Body() d: Partial<TransactionDto>,
  ) {
    return this.f.updateTransaction(u.id, id, d);
  }
  @Delete("transactions/:id") del(
    @CurrentUser() u: AuthUser,
    @Param("id") id: string,
  ) {
    return this.f.deleteTransaction(u.id, id);
  }
  @Post("incomes") income(@CurrentUser() u: AuthUser, @Body() d: IncomeDto) {
    return this.f.createIncome(u.id, d);
  }
  @Get("categories") cats(@CurrentUser() u: AuthUser) {
    return this.f.categories(u.id);
  }
  @Post("categories") cat(@CurrentUser() u: AuthUser, @Body() d: CategoryDto) {
    return this.f.createCategory(u.id, d);
  }
  @Get("budgets") buds(@CurrentUser() u: AuthUser) {
    return this.f.budgets(u.id);
  }
  @Post("budgets") bud(@CurrentUser() u: AuthUser, @Body() d: BudgetDto) {
    return this.f.createBudget(u.id, d);
  }
  @Get("savings-goals") goals(@CurrentUser() u: AuthUser) {
    return this.f.savings(u.id);
  }
  @Post("savings-goals") goal(
    @CurrentUser() u: AuthUser,
    @Body() d: SavingsDto,
  ) {
    return this.f.createSavings(u.id, d);
  }
}
