# Launch Stripe EUR monthly and annual billing

The owner approved production activation on 2026-09-22. This supersedes the test-only restriction and undecided catalog in ADR 0031. Clerk remains the identity and organization provider. Personal billing uses Stripe, including the in-app checkout and account settings already implemented.

Final customer prices, EUR:

| Plan | Monthly | Annual, charged upfront |
| --- | ---: | ---: |
| Basic | 19.99 | 199.99 |
| Basic Plus | 29.99 | 299.99 |
| Pro | 49.99 | 499.99 |

LANCIO5 discounts the first monthly invoice by EUR 5, including Pro. Only new customers can redeem it, within 30 days of the actual launch. Annual offers are excluded: they have separate Stripe products not included in the coupon and their Checkout Sessions disable promotion codes. The launch timestamp is explicit (`STRIPE_LAUNCH_AT`); rerunning setup never renews the window.

The owner confirms that there are no customer subscriptions to migrate and that VAT/invoicing are already handled. Existing personal test subscriptions are not migrated. Catalog prices retain inclusive tax behavior. This implementation does not introduce a new tax or invoicing service. Quotas and features continue to come from the existing application plan catalog, identical for monthly and annual subscriptions of each tier.

`BILLING_PROVIDER=stripe_test` retains a dedicated database, development Clerk credentials, and Stripe test credentials. `stripe_live` is allowed only in production with live Clerk/Stripe credentials and an HTTPS application origin. Default/unconfigured mode remains Clerk billing. Stripe objects and signed events must match the selected mode; redirect parameters never grant access.

Production activation requires the six live prices, launch campaign, live API keys, and a signed, publicly reachable Stripe webhook. The production build applies the additive subscription identifier migration. Existing organization-funded access is preserved. No plan switching or proration is introduced by this launch.

The complete replacement checkout browser purchase was explicitly waived by the owner. Sandbox billing settings, card replacement, cancellation/resumption and invoice download were tested. Real payment and renewal behavior remains an explicit release verification boundary; unit tests do not prove live settlement.

## Verification before activation

On 2026-09-22, the expanded Sandbox catalog was provisioned with all six offers. Real Stripe Checkout Sessions verified Pro monthly and all annual amounts/intervals, with annual promotion entry disabled. The synthetic lifecycle verified the discounted Basic Plus first invoice, automatic full-price renewal, owned card replacement, rejection of a foreign SetupIntent, and signed-webhook revocation after scheduled cancellation. Only synthetic fixtures were removed.

Pricing was checked in a running browser at desktop and 390px width, including the annual toggle, upfront totals and absence of horizontal overflow. Next.js reported no compilation or runtime errors. Full unit suite: 2,881 passed, four skipped. Biome and TypeScript passed. These checks do not activate production by themselves.
