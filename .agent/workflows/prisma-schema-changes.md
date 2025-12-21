---
description: how to handle prisma schema changes
---

Whenever the Prisma schema (`prisma/schema.prisma`) is modified, follow these steps:

1.  **Validate Schema**: Ensure the changes are syntactically correct.
2.  **Generate Client**: Run `npx prisma generate` to update the generated Prisma Client.
// turbo
3.  **Sync Database**: Run `npx prisma db push` (for rapid development/testing) or `npx prisma migrate dev` (for production-ready migrations) to sync the database schema.
    - If data loss is acceptable in development, use `npx prisma db push --accept-data-loss`.
4.  **Verify**: Confirm the database is in sync and the application still runs correctly.
