We are building a production-ready personal finance and expense tracking application.

Tech stack:
- Mobile: React Native (will be built later)
- Backend: NestJS + TypeScript
- ORM: Prisma
- Database: SQLite
- Telegram Bot API + Webhooks
- Firebase Cloud Messaging for push notifications

For this phase, work ONLY on the backend foundation.

Requirements:
1. Create a clean production-ready NestJS project with strict TypeScript.
2. Configure Prisma with SQLite.
3. Create a modular-monolith architecture.
4. Prepare these main areas without implementing their business features yet:
   - auth
   - users
   - transactions
   - incomes
   - categories
   - budgets
   - savings
   - analytics
   - telegram
   - notifications
5. Create shared/common layers for:
   - guards
   - decorators
   - filters
   - validation
   - errors
   - utils
6. Add centralized environment configuration and validation.
7. Add a .env.example but NEVER expose real secrets.
8. Add global DTO validation.
9. Add centralized exception handling.
10. Add safe structured logging with no sensitive-data logging.
11. Add a health endpoint.
12. Configure security basics such as Helmet and reasonable rate limiting.
13. Configure Prisma as a reusable global database service.
14. Configure linting, formatting, and production-safe scripts.
15. Add database files and secrets to .gitignore.
16. Write a clear README explaining local setup.

Important:
- Do not implement Telegram, financial features, React Native, or Firebase yet.
- Do not over-engineer.
- Do not introduce microservices, Redis, queues, Docker, or unnecessary dependencies.
- Use clean architecture principles but keep the project practical.
- Run lint, typecheck, tests, Prisma validation, and application startup checks when finished.
- Fix all issues you discover.
- At the end, report exactly what you created, architectural decisions, commands executed, tests performed, and any remaining concerns.