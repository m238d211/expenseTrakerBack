Continue the project and implement the core financial domain.

Implement:
- Income
- Transactions
- Categories
- Budgets
- Savings Goals

Transaction requirements:
- amount
- type: expense/income
- category
- description
- source: app/telegram
- status: pending/confirmed/cancelled
- transactionDate
- timestamps
- ownership by user

Income:
- amount
- type
- payDay
- recurring flag

Categories:
- built-in categories
- user-created categories
- icon identifier
- system/custom distinction

Budgets:
- category budget
- monthly period support
- amount
- start/end dates

Savings goals:
- target amount
- current amount
- target date
- status

Requirements:
- Use integer monetary values, never floating-point money.
- Enforce user ownership on every operation.
- Create proper REST endpoints.
- Add pagination/filtering for transactions.
- Support filtering by date, category, source and type.
- Validate all financial inputs.
- Prevent invalid negative or zero amounts where inappropriate.
- Implement services so Telegram and React Native can later reuse the SAME transaction business logic.
- Do not let controllers directly manipulate Prisma.
- Add comprehensive tests.
- Add migrations.

Do NOT implement analytics calculations or Telegram parsing yet.

Run all verification and report results.