Continue the existing project.

Implement the production-ready Users and Authentication modules.

Requirements:
- User model with UUID, name, email, passwordHash, currency, timestamps.
- Default currency IQD but keep currency configurable.
- Secure registration and login.
- Strong password hashing.
- JWT access authentication.
- Never return passwordHash from APIs.
- Create authenticated GET /me endpoint.
- Case-normalized unique emails.
- Proper validation DTOs.
- Authentication guard.
- Current-user decorator.
- Ownership/security helpers that later modules can reuse.
- Proper authentication error handling.
- Rate-limit sensitive authentication endpoints.
- Add tests for registration, login, invalid credentials, duplicate email, protected endpoints.
- Update Prisma migrations and README.

Do not build transactions or Telegram yet.

Run all tests, linting, typechecking and Prisma checks before finishing.
Report everything changed and any security decisions.