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
  Headers,
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
import { ConfigService } from "@nestjs/config";
import {
  TransactionSource,
  TransactionStatus,
  TransactionType,
  SavingsStatus,
  RecurringFrequency,
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
  @IsOptional() @IsString() color?: string;
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
export class RecurringDto {
  @IsInt() @Min(1) amount!: number;
  @IsEnum(TransactionType) type!: TransactionType;
  @IsString() description!: string;
  @IsEnum(RecurringFrequency) frequency!: RecurringFrequency;
  @IsDateString() nextRunAt!: string;
  @IsOptional() @IsInt() @Min(1) dayOfMonth?: number;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
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
  private async inferTelegramCategory(userId: string, description: string) {
    const rules: Array<[string, string[]]> = [
      ["طعام", ["food", "eat", "meal", "restaurant", "مطعم", "غداء", "عشاء", "فطور", "اكل", "أكل", "خبز"]],
      ["مواصلات", ["taxi", "uber", "careem", "fuel", "petrol", "بنزين", "تاكسي", "تكسي", "نقل", "سيارة"]],
      ["فواتير", ["bill", "electric", "internet", "phone", "كهرباء", "ماء", "انترنت", "إنترنت", "هاتف", "فاتورة"]],
      ["تسوق", ["shop", "shopping", "clothes", "شراء", "تسوق", "ملابس", "سوبرماركت", "market"]],
      ["ترفيه", ["game", "cinema", "movie", "entertainment", "لعبة", "العاب", "ألعاب", "سينما", "ترفيه"]],
      ["صحة", ["doctor", "medicine", "pharmacy", "طبيب", "دواء", "صيدلية", "مستشفى", "صحة"]],
    ];
    const text = description.toLowerCase();
    const match = rules.find(([, keywords]) => keywords.some((keyword) => text.includes(keyword)));
    if (!match) return undefined;
    const existing = await this.db.category.findFirst({ where: { userId, name: match[0] } });
    return (existing || await this.db.category.create({ data: { name: match[0], userId, isSystem: false } })).id;
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
    let categoryId = d.categoryId;
    if (d.source === "telegram" && d.type === "expense" && !categoryId) {
      categoryId = await this.inferTelegramCategory(userId, d.description);
    }
    if (d.source !== "telegram" && d.type === "expense" && !categoryId) {
      const fallback = await this.db.category.findFirst({
        where: { userId, name: "أخرى" },
      });
      const category =
        fallback ||
        (await this.db.category.create({
          data: { name: "أخرى", userId, isSystem: false },
        }));
      categoryId = category.id;
    }
    const transaction = await this.db.transaction.create({
      data: {
        amount: d.amount,
        type: d.type,
        description: d.description.trim(),
        userId,
        categoryId,
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
      await this.notifyBudgetAlerts(userId, transaction.transactionDate);
    }
    return transaction;
  }
  private async notifyBudgetAlerts(userId: string, date: Date) {
    const monthStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
    const monthEnd = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
    const [budgets, expenses] = await Promise.all([
      this.db.budget.findMany({ where: { userId, startDate: { lt: monthEnd }, endDate: { gte: monthStart } } }),
      this.db.transaction.findMany({ where: { userId, type: "expense", status: "confirmed", transactionDate: { gte: monthStart, lt: monthEnd } }, select: { amount: true, categoryId: true } }),
    ]);
    const periodKey = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    for (const budget of budgets) {
      const used = expenses.filter((x) => !budget.categoryId || x.categoryId === budget.categoryId).reduce((sum, x) => sum + x.amount, 0);
      for (const threshold of [80, 100]) {
        if (used * 100 < budget.amount * threshold) continue;
        try {
          await this.db.budgetAlert.create({ data: { budgetId: budget.id, threshold, periodKey } });
          await this.notifications.send(userId, threshold === 100 ? "تجاوزت الميزانية" : "اقتربت من الميزانية", `استخدمت ${Math.round((used / budget.amount) * 100)}% من ميزانيتك.`);
        } catch { /* one alert per threshold and month */ }
      }
    }
  }
  async updateTransaction(
    userId: string,
    id: string,
    d: Partial<TransactionDto>,
  ) {
    await this.own(userId, id);
    const transaction = await this.db.transaction.update({
      where: { id },
      data: {
        ...d,
        ...(d.transactionDate
          ? { transactionDate: new Date(d.transactionDate) }
          : {}),
      },
    });
    if (transaction.status === "confirmed") await this.notifyBudgetAlerts(userId, transaction.transactionDate);
    return transaction;
  }
  transaction(userId: string, id: string) {
    return this.db.transaction.findFirst({ where: { id, userId }, include: { category: true } }).then((item) => {
      if (!item) throw new Error("NOT_FOUND");
      return item;
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
    const defaults = ["طعام", "مواصلات", "فواتير", "تسوق", "ترفيه", "صحة", "أخرى"];
    return this.db.category.findMany({
      where: { OR: [{ isSystem: true }, { userId }] },
    }).then(async (categories) => {
      const existing = new Set(categories.filter((x) => x.userId === userId).map((x) => x.name));
      const missing = defaults.filter((name) => !existing.has(name));
      if (missing.length) {
        await this.db.category.createMany({
          data: missing.map((name) => ({ name, userId, isSystem: false })),
        });
        return this.db.category.findMany({
          where: { OR: [{ isSystem: true }, { userId }] },
        });
      }
      return categories;
    });
  }
  createCategory(userId: string, d: CategoryDto) {
    return this.db.category.create({ data: { ...d, userId, isSystem: false } });
  }
  async updateCategory(userId: string, id: string, d: Partial<CategoryDto>) {
    const item = await this.db.category.findFirst({ where: { id, userId } });
    if (!item) throw new Error("NOT_FOUND");
    return this.db.category.update({ where: { id }, data: d });
  }
  async deleteCategory(userId: string, id: string) {
    const item = await this.db.category.findFirst({ where: { id, userId } });
    if (!item) throw new Error("NOT_FOUND");
    return this.db.category.delete({ where: { id } });
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
  async updateBudget(userId: string, id: string, d: Partial<BudgetDto>) {
    const item = await this.db.budget.findFirst({ where: { id, userId } });
    if (!item) throw new Error("NOT_FOUND");
    return this.db.budget.update({ where: { id }, data: { ...d, ...(d.startDate ? { startDate: new Date(d.startDate) } : {}), ...(d.endDate ? { endDate: new Date(d.endDate) } : {}) }, include: { category: true } });
  }
  async deleteBudget(userId: string, id: string) {
    const item = await this.db.budget.findFirst({ where: { id, userId } });
    if (!item) throw new Error("NOT_FOUND");
    return this.db.budget.delete({ where: { id } });
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
  async updateSavings(userId: string, id: string, d: Partial<SavingsDto>) {
    const item = await this.db.savingsGoal.findFirst({ where: { id, userId } });
    if (!item) throw new Error("NOT_FOUND");
    return this.db.savingsGoal.update({ where: { id }, data: { ...d, ...(d.targetDate ? { targetDate: new Date(d.targetDate) } : {}) } });
  }
  async deleteSavings(userId: string, id: string) {
    const item = await this.db.savingsGoal.findFirst({ where: { id, userId } });
    if (!item) throw new Error("NOT_FOUND");
    return this.db.savingsGoal.delete({ where: { id } });
  }
  recurring(userId: string) { return this.db.recurringTransaction.findMany({ where: { userId }, include: { category: true }, orderBy: { nextRunAt: "asc" } }); }
  createRecurring(userId: string, d: RecurringDto) { return this.db.recurringTransaction.create({ data: { ...d, userId, nextRunAt: new Date(d.nextRunAt), isActive: d.isActive ?? true } , include: { category: true } }); }
  async updateRecurring(userId: string, id: string, d: Partial<RecurringDto>) { const item = await this.db.recurringTransaction.findFirst({ where: { id, userId } }); if (!item) throw new Error("NOT_FOUND"); return this.db.recurringTransaction.update({ where: { id }, data: { ...d, ...(d.nextRunAt ? { nextRunAt: new Date(d.nextRunAt) } : {}) }, include: { category: true } }); }
  async deleteRecurring(userId: string, id: string) { const item = await this.db.recurringTransaction.findFirst({ where: { id, userId } }); if (!item) throw new Error("NOT_FOUND"); return this.db.recurringTransaction.delete({ where: { id } }); }
  private nextRun(date: Date, frequency: RecurringFrequency, dayOfMonth?: number) { const next = new Date(date); if (frequency === RecurringFrequency.daily) next.setUTCDate(next.getUTCDate() + 1); if (frequency === RecurringFrequency.weekly) next.setUTCDate(next.getUTCDate() + 7); if (frequency === RecurringFrequency.monthly) { next.setUTCMonth(next.getUTCMonth() + 1); if (dayOfMonth) next.setUTCDate(Math.min(dayOfMonth, new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate())); } if (frequency === RecurringFrequency.yearly) next.setUTCFullYear(next.getUTCFullYear() + 1); return next; }
  async processRecurring(now = new Date()) { const due = await this.db.recurringTransaction.findMany({ where: { isActive: true, nextRunAt: { lte: now } }, take: 200 }); let created = 0; for (const item of due) { try { await this.db.transaction.create({ data: { amount: item.amount, type: item.type, description: item.description, source: "recurring", status: "confirmed", transactionDate: item.nextRunAt, scheduledFor: item.nextRunAt, recurringTransactionId: item.id, userId: item.userId, categoryId: item.categoryId } }); await this.db.recurringTransaction.update({ where: { id: item.id }, data: { lastRunAt: item.nextRunAt, nextRunAt: this.nextRun(item.nextRunAt, item.frequency, item.dayOfMonth ?? undefined) } }); await this.notifications.send(item.userId, "عملية متكررة جديدة", `${item.description} - ${item.amount.toLocaleString("en-US")} د.ع`); created++; } catch { /* unique scheduledFor makes retries idempotent */ } } return { processed: due.length, created }; }
}
@Controller()
@UseGuards(AuthGuard)
export class FinanceController {
  constructor(private readonly f: FinanceService) {}
  @Get("transactions") list(@CurrentUser() u: AuthUser, @Query() q: any) {
    return this.f.transactions(u.id, q);
  }
  @Get("transactions/:id") get(@CurrentUser() u: AuthUser, @Param("id") id: string) { return this.f.transaction(u.id, id); }
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
  @Patch("categories/:id") updateCat(@CurrentUser() u: AuthUser, @Param("id") id: string, @Body() d: Partial<CategoryDto>) { return this.f.updateCategory(u.id, id, d); }
  @Delete("categories/:id") deleteCat(@CurrentUser() u: AuthUser, @Param("id") id: string) { return this.f.deleteCategory(u.id, id); }
  @Get("budgets") buds(@CurrentUser() u: AuthUser) {
    return this.f.budgets(u.id);
  }
  @Post("budgets") bud(@CurrentUser() u: AuthUser, @Body() d: BudgetDto) {
    return this.f.createBudget(u.id, d);
  }
  @Patch("budgets/:id") updateBud(@CurrentUser() u: AuthUser, @Param("id") id: string, @Body() d: Partial<BudgetDto>) { return this.f.updateBudget(u.id, id, d); }
  @Delete("budgets/:id") deleteBud(@CurrentUser() u: AuthUser, @Param("id") id: string) { return this.f.deleteBudget(u.id, id); }
  @Get("savings-goals") goals(@CurrentUser() u: AuthUser) {
    return this.f.savings(u.id);
  }
  @Post("savings-goals") goal(
    @CurrentUser() u: AuthUser,
    @Body() d: SavingsDto,
  ) {
    return this.f.createSavings(u.id, d);
  }
  @Patch("savings-goals/:id") updateGoal(@CurrentUser() u: AuthUser, @Param("id") id: string, @Body() d: Partial<SavingsDto>) { return this.f.updateSavings(u.id, id, d); }
  @Delete("savings-goals/:id") deleteGoal(@CurrentUser() u: AuthUser, @Param("id") id: string) { return this.f.deleteSavings(u.id, id); }
  @Get("recurring-transactions") recurring(@CurrentUser() u: AuthUser) { return this.f.recurring(u.id); }
  @Post("recurring-transactions") createRecurring(@CurrentUser() u: AuthUser, @Body() d: RecurringDto) { return this.f.createRecurring(u.id, d); }
  @Patch("recurring-transactions/:id") updateRecurring(@CurrentUser() u: AuthUser, @Param("id") id: string, @Body() d: Partial<RecurringDto>) { return this.f.updateRecurring(u.id, id, d); }
  @Delete("recurring-transactions/:id") deleteRecurring(@CurrentUser() u: AuthUser, @Param("id") id: string) { return this.f.deleteRecurring(u.id, id); }
}

@Controller("internal/jobs")
export class RecurringJobController {
  constructor(private readonly f: FinanceService, private readonly config: ConfigService) {}
  @Post("recurring") run(@Headers("x-cron-secret") secret?: string, @Headers("authorization") authorization?: string) { const expected = this.config.get<string>("CRON_SECRET"); const supplied = secret || authorization?.replace(/^Bearer\s+/i, ""); if (!expected || supplied !== expected) throw new Error("INVALID_CRON_SECRET"); return this.f.processRecurring(); }
}
