import { Controller, Get, Injectable, UseGuards } from "@nestjs/common";
import { DatabaseService } from "./database.service";
import { AuthGuard, AuthUser, CurrentUser } from "./auth";
export function sum(values: number[]) {
  return values.reduce((a, b) => a + b, 0);
}
export function savingsRate(income: number, expenses: number) {
  return income > 0
    ? Math.round(((income - expenses) / income) * 10000) / 100
    : 0;
}
@Injectable()
export class AnalyticsService {
  constructor(private readonly db: DatabaseService) {}
  async monthly(userId: string, year: number, month: number) {
    const start = new Date(Date.UTC(year, month - 1, 1)),
      end = new Date(Date.UTC(year, month, 1));
    const [tx, incomes, budgets] = await Promise.all([
      this.db.transaction.findMany({
        where: {
          userId,
          status: "confirmed",
          transactionDate: { gte: start, lt: end },
        },
        include: { category: true },
      }),
      this.db.income.findMany({ where: { userId } }),
      this.db.budget.findMany({
        where: { userId, startDate: { lt: end }, endDate: { gte: start } },
        include: { category: true },
      }),
    ]);
    const expenses = tx.filter((x) => x.type === "expense"),
      income = [
        ...tx.filter((x) => x.type === "income").map((x) => x.amount),
        ...incomes.filter((x) => x.recurring).map((x) => x.amount),
      ];
    const byCategory = Object.entries(
      expenses.reduce<Record<string, number>>((a, x) => {
        const k = x.category?.name || "Uncategorized";
        a[k] = (a[k] || 0) + x.amount;
        return a;
      }, {}),
    );
    const top = byCategory.sort((a, b) => b[1] - a[1])[0];
    const totalIncome = sum(income),
      totalExpenses = sum(expenses.map((x) => x.amount));
    return {
      month: `${year}-${String(month).padStart(2, "0")}`,
      income: totalIncome,
      expenses: totalExpenses,
      savings: totalIncome - totalExpenses,
      savingsRate: savingsRate(totalIncome, totalExpenses),
      topCategory: top?.[0] || null,
      byCategory: Object.fromEntries(byCategory),
      budgets: budgets.map((b) => ({
        id: b.id,
        category: b.category?.name || null,
        amount: b.amount,
        used: sum(
          expenses
            .filter((x) => x.categoryId === b.categoryId)
            .map((x) => x.amount),
        ),
        usagePercentage: b.amount
          ? Math.round(
              (sum(
                expenses
                  .filter((x) => x.categoryId === b.categoryId)
                  .map((x) => x.amount),
              ) /
                b.amount) *
                10000,
            ) / 100
          : 0,
      })),
    };
  }
  async safe(userId: string) {
    const now = new Date(),
      m = await this.monthly(
        userId,
        now.getUTCFullYear(),
        now.getUTCMonth() + 1,
      );
    const salary = await this.db.income.findFirst({
      where: { userId, recurring: true },
      orderBy: { createdAt: "asc" },
    });
    const days = salary
      ? Math.max(1, (salary.payDay - now.getUTCDate() + 31) % 31)
      : 30;
    return {
      available: m.income - m.expenses,
      savings: m.savings,
      daysUntilSalary: salary ? days : null,
      safeToSpend: salary
        ? Math.max(0, Math.floor((m.income - m.expenses) / days))
        : Math.max(0, m.income - m.expenses),
    };
  }
}
@Controller("analytics")
@UseGuards(AuthGuard)
export class AnalyticsController {
  constructor(private readonly a: AnalyticsService) {}
  @Get("monthly") monthly(@CurrentUser() u: AuthUser) {
    const n = new Date();
    return this.a.monthly(u.id, n.getUTCFullYear(), n.getUTCMonth() + 1);
  }
  @Get("safe-to-spend") safe(@CurrentUser() u: AuthUser) {
    return this.a.safe(u.id);
  }
}
