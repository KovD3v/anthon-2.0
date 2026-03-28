#!/usr/bin/env bash
# Runs Prisma migrations against the production Neon branch.
# Usage: PROD_DATABASE_URL=<url> PROD_DIRECT_DATABASE_URL=<url> ./scripts/migrate-prod.sh
set -euo pipefail

: "${PROD_DATABASE_URL:?PROD_DATABASE_URL is required}"
: "${PROD_DIRECT_DATABASE_URL:?PROD_DIRECT_DATABASE_URL is required}"

echo "Running migrations against production branch..."
DATABASE_URL="$PROD_DATABASE_URL" DIRECT_DATABASE_URL="$PROD_DIRECT_DATABASE_URL" \
  ./node_modules/.bin/prisma migrate deploy
echo "Done."
