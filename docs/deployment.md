# Deployment and Database Safety

Anthon is configured for Vercel, Neon/PostgreSQL, and Vercel Cron. This is a database/deployment safety reference for behavior encoded in the repository, not a step-by-step Vercel linking, promotion, or rollback runbook.

## Build and migration behavior

`bun run build` is database-read-only by design:

```text
prisma generate
  -> next build
```

Pending migrations are applied separately:

```bash
bun run db:migrate:deploy
```

The migration command targets `DIRECT_DATABASE_URL` when configured by Prisma, otherwise `DATABASE_URL`. Separating it from compilation prevents preview or local builds from changing a database merely because they have credentials.

Before any migration or deployment:

1. Confirm the deployment environment.
2. Confirm both database URLs point at that environment's database.
3. Confirm pgvector is installed.
4. Inspect pending migrations.
5. Apply migrations explicitly, then build and deploy the compatible application.

`bun run build` is safe to use as a non-migrating compile check. It can still evaluate application modules, contact build-time services, or fail on missing runtime configuration, but it does not invoke Prisma migrations.

## Recommended environment mapping

| Deployment | `DATABASE_URL` | `DIRECT_DATABASE_URL` |
| --- | --- | --- |
| Local | Development/local pooled URL | Development/local direct URL |
| Preview | Isolated preview pooled URL | Same preview branch, direct URL |
| Production | Production pooled URL | Production direct URL |

Use a separate disposable database for `TEST_DATABASE_URL`.

## Manual production migration

The repository includes a presence-checked wrapper that requires explicit production variable names:

```bash
PROD_DATABASE_URL='<pooled-url>' \
PROD_DIRECT_DATABASE_URL='<direct-url>' \
./scripts/migrate-prod.sh
```

The script only checks that both values are non-empty; it cannot prove that either host is production. Validate both URLs yourself. It changes production data structures, so review the migration SQL and take the normal backup/rollback precautions first.

## Integration-test behavior

`bun run test:integration` is also stateful. Its bootstrap:

1. Requires `TEST_DATABASE_URL`.
2. Refuses to continue when its host matches `DATABASE_URL`.
3. Creates the `vector` extension if needed.
4. Runs `prisma db push` against the test database.
5. Executes route integration tests serially.

Use a disposable database. The production-host guard is useful, but it cannot detect every environment-mapping mistake.

## Scheduled work

[`vercel.json`](../vercel.json) currently schedules only attachment cleanup:

```text
0 3 * * * -> GET /api/cron/cleanup-attachments
```

The endpoint requires `Authorization: Bearer $CRON_SECRET`; Vercel supplies that header for configured cron invocations when `CRON_SECRET` is set.

Memory consolidation, session archival, and profile analysis are published through `GET /api/cron/trigger`. No schedule for that route is tracked in this repository, so it must be triggered manually or by externally configured scheduling.

## Release checklist

1. Run `bun run lint`.
2. Run `bunx tsc --noEmit`.
3. Run `bun run test`.
4. Run integration tests only with a verified disposable `TEST_DATABASE_URL`.
5. Review `prisma/migrations` and deployment database scope.
6. Run `bun run db:migrate:deploy` against the intended database when migrations are pending.
7. Confirm required secrets from [Configuration](./configuration.md).
8. Deploy and verify the application. Public `/api/health` is a shallow process check; admins can use `/api/health?details=1` or the `/admin` panel for live PostgreSQL, OpenRouter, Clerk, and read-only Blob checks.

## CI status

No CI workflow is tracked under `.github/workflows` or another CI provider. The commands above are local/release expectations, not repository-enforced merge gates.
