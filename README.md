# Expense Tracker Backend

NestJS modular monolith with Prisma/SQLite. Financial amounts are integer minor units (for IQD, whole dinars), and all records are user-owned.

## Local setup

1. Copy `.env.example` to `.env` and set a long random `JWT_SECRET`.
2. Install dependencies with `npm install`.
3. Generate Prisma client and create the local database: `npx prisma generate` then `npx prisma migrate dev --name init`.
4. Run `npm run start:dev`.

Important environment secrets are backend-only. Telegram and Firebase integrations remain inactive until their credentials are configured. Telegram uses numeric user IDs and update-id idempotency; it never writes Prisma data outside the existing finance service.

## API routes

Authenticated routes require `Authorization: Bearer <accessToken>`.

| Method | Route | Auth | Purpose |
|---|---|---:|---|
| GET | `/health` | No | Check application and database health |
| POST | `/auth/register` | No | Register a user and return an access token |
| POST | `/auth/login` | No | Authenticate a user and return an access token |
| GET | `/auth/me` | Yes | Return the current user |
| GET | `/transactions` | Yes | List owned transactions with pagination and filters |
| POST | `/transactions` | Yes | Create a transaction |
| PATCH | `/transactions/:id` | Yes | Update an owned transaction |
| DELETE | `/transactions/:id` | Yes | Delete an owned transaction |
| POST | `/incomes` | Yes | Create an income record |
| GET | `/categories` | Yes | List system and owned categories |
| POST | `/categories` | Yes | Create a custom category |
| GET | `/budgets` | Yes | List owned budgets |
| POST | `/budgets` | Yes | Create a budget |
| GET | `/savings-goals` | Yes | List owned savings goals |
| POST | `/savings-goals` | Yes | Create a savings goal |
| GET | `/analytics/monthly` | Yes | Return the current month's financial summary |
| GET | `/analytics/safe-to-spend` | Yes | Return the safe-to-spend calculation |
| POST | `/telegram/link-token` | Yes | Create a short-lived Telegram linking token |
| POST | `/telegram/unlink` | Yes | Unlink the current user's Telegram account |
| POST | `/telegram/webhook` | No* | Receive Telegram webhook updates |
| POST | `/notifications/devices` | Yes | Register an FCM device token |
| DELETE | `/notifications/devices` | Yes | Remove an FCM device token |

The `GET /transactions` endpoint supports `page`, `limit`, `from`, `to`, `categoryId`, `source`, and `type` query parameters. Telegram webhook requests must include the configured `x-telegram-bot-api-secret-token` header when a webhook secret is configured.

## Verification

`npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and `npm run prisma:validate` are the expected checks.


$token = "8650636824:AAE2cj9uj9Uo0d6pV3UJ4heC9Ew8pfo1hoc"
$secret = "BXbXq47tP4F3ddv1S4kOZ8awDYsLykx0cPtyYgkcYPu"
$url = "https://tired-moons-hunt.loca.lt/telegram/webhook"

curl.exe -X POST "https://api.telegram.org/bot$token/setWebhook" `
  -d "url=$url" `
  -d "secret_token=$secret" `
  -d 'allowed_updates=["message","callback_query"]'