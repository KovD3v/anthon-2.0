#!/usr/bin/env bash
# Production migrations are owned by the Vercel production build. Preview and
# local builds stay artifact-only so they cannot mutate a shared database.
set -euo pipefail

if [[ "${VERCEL_ENV:-}" == "production" ]]; then
  : "${DIRECT_DATABASE_URL:?DIRECT_DATABASE_URL is required for Vercel production migrations}"
  ./node_modules/.bin/prisma migrate deploy
fi

exec bun run build
