ALTER TYPE "TransactionSource" ADD VALUE 'recurring';

ALTER TABLE "Category" ADD COLUMN "color" TEXT;

ALTER TABLE "Transaction"
  ADD COLUMN "recurringTransactionId" TEXT,
  ADD COLUMN "scheduledFor" TIMESTAMP(3);

CREATE TYPE "RecurringFrequency" AS ENUM ('daily', 'weekly', 'monthly', 'yearly');

CREATE TABLE "BudgetAlert" (
  "id" TEXT NOT NULL,
  "budgetId" TEXT NOT NULL,
  "threshold" INTEGER NOT NULL,
  "periodKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BudgetAlert_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RecurringTransaction" (
  "id" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "type" "TransactionType" NOT NULL,
  "description" TEXT NOT NULL,
  "frequency" "RecurringFrequency" NOT NULL,
  "dayOfMonth" INTEGER,
  "nextRunAt" TIMESTAMP(3) NOT NULL,
  "lastRunAt" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "userId" TEXT NOT NULL,
  "categoryId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RecurringTransaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Transaction_recurringTransactionId_scheduledFor_key" ON "Transaction"("recurringTransactionId", "scheduledFor");
CREATE UNIQUE INDEX "BudgetAlert_budgetId_threshold_periodKey_key" ON "BudgetAlert"("budgetId", "threshold", "periodKey");
CREATE INDEX "RecurringTransaction_userId_isActive_nextRunAt_idx" ON "RecurringTransaction"("userId", "isActive", "nextRunAt");
CREATE INDEX "RecurringTransaction_userId_idx" ON "RecurringTransaction"("userId");

ALTER TABLE "BudgetAlert" ADD CONSTRAINT "BudgetAlert_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecurringTransaction" ADD CONSTRAINT "RecurringTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecurringTransaction" ADD CONSTRAINT "RecurringTransaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_recurringTransactionId_fkey" FOREIGN KEY ("recurringTransactionId") REFERENCES "RecurringTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
