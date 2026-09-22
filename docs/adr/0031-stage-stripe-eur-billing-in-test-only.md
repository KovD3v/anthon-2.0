# Stage Stripe EUR billing in test only

Clerk remains the authentication and organization identity provider. Personal billing is being migrated to Stripe because the approved launch prices and discounts must be charged in EUR, not converted from USD by a customer's bank.

The first implementation is explicitly test-only. `BILLING_PROVIDER=stripe_test` requires Clerk and Stripe test credentials, a separate database endpoint, and localhost or a preview deployment. Production continues using Clerk Billing and must not enable this mode. No existing subscription is migrated or repriced.

The test catalog contains only Basic at EUR 19.99/month and Basic Plus at EUR 29.99/month. Pro and annual prices remain undecided and are not offered through the test checkout. The LANCIO5 promotion reduces the first invoice by EUR 5, applies only to these products, is restricted to first-time customers, and expires 30 days after test campaign creation. The live launch window must be selected separately.

Stripe-hosted Checkout and Customer Portal own payment collection, promotion eligibility, receipts, payment method changes and cancellation. Stripe prices are the commercial source of truth in this mode. This supersedes the Clerk-only pricing UI requirement in the August 7 pricing specification for the test mode only. The application plan catalog still owns quotas and coaching standards as required by ADR 0006.

Only verified test webhook events or authenticated server reconciliation update access. Redirect query parameters never grant access. Reconciliation reads current Stripe state to tolerate retries and out-of-order events. Clerk billing events are ignored in Stripe test mode. Account deletion must cancel Stripe subscriptions and pending checkouts before removing the local customer mapping.

Production activation is a separate approval. It requires confirmed Pro/annual offers, VAT and invoicing configuration, live customer migration policy, a durable webhook endpoint, renewal and cancellation evidence, and removal/replacement of Clerk billing entry points. No live billing keys are accepted by this implementation.

## Local operation

The test branch is `feat/stripe-eur-test`. Put `STRIPE_SECRET_KEY=sk_test_…` in ignored `.env.local`; put the provider flag, dedicated database URLs and `APP_URL=http://localhost:3005` in ignored `.env.stripe-test`. Use Clerk development credentials. Never commit these files.

```bash
bun run billing:setup-test   # Idempotent catalog, coupon and portal setup
bun run dev:stripe-test     # App plus signed local Stripe webhook forwarding
bun run billing:verify-test # Synthetic subscription, renewal and cancellation
```

The runner keeps the webhook signing secret in memory. Keep it running during checkout and verification. Catalog setup does not extend an existing promotion's expiry. The campaign created on 2026-09-22 expires on 2026-10-22 at 17:13:13 UTC; a later launch needs a separately selected campaign window.

The dedicated Neon branch is `feat-stripe-eur-test` (`br-icy-bonus-ag7hhlg9`); existing development and production endpoints are not used by this mode. Migration `20260922171717_stripe_test_billing` was applied only to that branch. Existing vector indexes are preserved.

The migration contains only the two Stripe identifiers and their unique indexes. Pre-existing drift in `MessageMetrics.updatedAt` and custom vector indexes is outside this change; do not accept an automatic reset or unrelated index removal during a future `migrate dev`.

## Verification evidence — 2026-09-22

- Browser checkout: Basic, LANCIO5, EUR 14.99 paid in Stripe Sandbox; next invoice EUR 19.99. A signed webhook activated BASIC before manual reconciliation. Customer Portal displays the matching paid invoice and renewal.
- `billing:verify-test`: Basic Plus EUR 24.99 first invoice, EUR 29.99 automatic renewal using a Stripe test clock, access retained until scheduled cancellation, then revoked by a signed webhook. Only the script's synthetic account and clock are removed afterward.
- Unit coverage includes price and environment guards, customer ownership, duplicate checkouts, webhook signatures/retries, provider isolation and cancel-before-account-deletion. Production Clerk billing remains the default.

For this checkout, an unrelated `.kilo/worktrees/` tree makes repository-wide discovery include another project root. Verify the active tree with `bun run test --exclude '**/.kilo/**'` and `bunx biome check src scripts prisma.config.ts next.config.ts package.json biome.json vitest.config.ts`. Typecheck with `bun --env-file=.env --env-file=.env.local --env-file=.env.stripe-test run typecheck`.
