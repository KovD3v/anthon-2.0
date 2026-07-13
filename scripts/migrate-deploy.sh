#!/usr/bin/env bash
# The only supported production-like migration entrypoint. It is invoked by
# .github/workflows/migrate.yml after GitHub Environment protection and
# per-environment serialization have been applied.
set -euo pipefail

if [[ "${GITHUB_ACTIONS:-}" != "true" ]]; then
  echo "Refusing to run migrations outside the dedicated GitHub Actions workflow." >&2
  exit 1
fi

if [[ "${MIGRATION_DEPLOYMENT:-}" != "true" ]]; then
  echo "MIGRATION_DEPLOYMENT=true is required for the dedicated migration job." >&2
  exit 1
fi

case "${MIGRATION_ENVIRONMENT:-}" in
  preview | production) ;;
  *)
    echo "MIGRATION_ENVIRONMENT must be preview or production." >&2
    exit 1
    ;;
esac

: "${DIRECT_DATABASE_URL:?DIRECT_DATABASE_URL must come from the selected GitHub Environment}"

exec ./node_modules/.bin/prisma migrate deploy
