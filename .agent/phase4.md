Implement the financial analytics layer.

Features:
1. Monthly spending summary.
2. Spending by category.
3. Income vs expenses.
4. Savings amount and savings rate.
5. Remaining category budgets.
6. Budget usage percentage.
7. Upcoming salary date calculation.
8. Safe-to-spend calculation.

Safe-to-spend should consider:
- available income/balance
- confirmed expenses
- reserved budgeted/expected obligations where applicable
- savings targets
- number of days until next expected salary

9. Monthly snapshots:
   - month
   - income
   - expenses
   - savings
   - top category
   - savings rate

Design the calculation logic as pure/testable domain functions where possible.

Money must remain integer-based.

Handle edge cases:
- no salary configured
- salary day already passed
- zero income
- no expenses
- multiple income records
- month boundaries
- leap years where relevant

Create API endpoints for dashboard/monthly analytics and safe-to-spend.

Add strong unit tests for all calculations.