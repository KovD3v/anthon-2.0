#!/bin/sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
export SEMGREP_SEND_METRICS=off SEMGREP_ENABLE_VERSION_CHECK=0
# Registry rules are fetched at scan time; findings and scan errors fail the check.
# Exclude Express-only rules (this app uses Next.js), generated runs and tests
# that caused partial parsing failures in the evaluation.
exec semgrep scan \
  --oss-only --metrics=off --disable-version-check --strict --error --timeout=30 --jobs=4 \
  --config p/typescript \
  --config p/react \
  --config p/secrets \
  --config p/github-actions \
  --exclude-rule javascript.express.security.audit.express-ssrf.express-ssrf \
  --exclude-rule javascript.express.security.audit.xss.direct-response-write.direct-response-write \
  --exclude-rule javascript.express.security.injection.raw-html-format.raw-html-format \
  --exclude .agents \
  --exclude .firecrawl \
  --exclude .maestro \
  --exclude 'brag-output*' \
  --exclude skills-lock.json \
  --exclude docs/benchmarks/runs \
  --exclude '*.test.ts' \
  --exclude '*.test.tsx' \
  "$@" .
