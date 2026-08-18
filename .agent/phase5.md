Implement the Telegram Bot integration using the official Telegram Bot API and webhooks.

Architecture:
Telegram must NEVER directly manipulate the database.
Telegram module must call the existing transaction/business services.

Implement:
- TelegramAccount
- TelegramLinkToken
- TelegramUpdate models

Account linking:
1. Authenticated app user requests a Telegram linking token.
2. Generate a cryptographically secure short-lived one-time token.
3. User opens Telegram bot with /start <token>.
4. Verify token.
5. Link numeric Telegram user_id and chat_id to the application user.
6. Consume/delete the linking token.
7. Support unlinking.

Security:
- Never trust Telegram username as identity.
- Use Telegram numeric user_id.
- Validate Telegram webhook secret.
- Bot token only from backend environment variables.
- Make Telegram update_id unique.
- Implement idempotency so duplicate updates can never create duplicate expenses.
- Ensure callback buttons belong to the same user who created the pending transaction.

Expense flow:
User sends examples such as:
"25000 بنزين"
"25 الف بنزين"
"12000 غداء"
"5 آلاف قهوة"

Build a deterministic parser first, without AI.

Parse:
- amount
- description
- likely category

Create a PENDING transaction first.

Bot sends a confirmation message with inline buttons:
Confirm
Cancel

On Confirm:
- verify ownership
- change transaction to confirmed
- update derived financial state
- reply with recorded amount and useful remaining-budget/balance information

On Cancel:
- cancel the pending transaction.

Also gracefully handle:
- unknown/unlinked Telegram accounts
- malformed amounts
- missing descriptions
- ambiguous amounts
- duplicate updates
- expired callback attempts
- Telegram API failures

Add comprehensive tests, especially idempotency and ownership tests.