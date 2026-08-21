# Beta access gate and release mailing list

**Date:** 2026-08-15  
**Status:** Approved design  
**Scope:** All human-facing Anthon surfaces for guests and registered users, with a separate SUPER_ADMIN console

## Objective

Make the beta phase explicit and controlled. A shared beta password gates the site independently of Clerk accounts, persists on the same browser for 180 days, and can be rotated or temporarily disabled from `/admin`. The same gate screen also collects release-notification subscriptions with a separate optional consent for additional product updates.

The feature must not interrupt Telegram, WhatsApp, Clerk webhooks, queues, cron jobs, or health checks.

## Product decisions

- The password is shared and is not attached to a guest or registered account.
- A successful unlock persists for 180 days on that browser.
- Rotating the password invalidates every previously issued beta cookie on its next request.
- The whole human-facing site is gated, including marketing, ordinary authentication, onboarding, chat, profile, channels, and organization pages.
- `/privacy` and `/terms` remain public.
- `/admin` and its APIs remain outside the beta gate and retain their existing Clerk and database-role authorization.
- Only `SUPER_ADMIN` can set or rotate the password or view/export mailing subscribers.
- The first saved password activates the gate. Before that first configuration, the site remains available so deployment cannot lock administrators out.
- A SUPER_ADMIN can temporarily disable and later re-enable the gate without deleting or rotating the password and without deleting subscribers.
- Disabling increments the access version and therefore revokes every existing beta cookie. Re-enabling preserves that incremented version, so old cookies do not become valid again.
- Mailing data remains independent from Clerk accounts and beta access cookies.
- Anthon stores and exports subscribers in this phase; it does not yet send double-opt-in or campaign email.

## Route boundary

The existing Next.js proxy remains the central early gate. Route classification must be explicit and segment-aware.

### Public without beta access

- `/beta-access`
- `/privacy`
- `/terms`
- the unlock and mailing-subscription endpoints under `/api/beta-access/`
- static assets and Next.js internals already excluded by the matcher
- health, webhook, queue, and cron endpoints
- `/admin` and `/api/admin/*`, which keep their existing independent authorization
- only the Clerk sign-in, recovery, continuation, and callback requests required to authenticate an administrator whose safe internal destination is `/admin`

The administrator exception must not turn the normal authentication experience into an ungated entrance. A non-admin completing that flow is redirected by the existing admin authorization boundary and then encounters the beta gate on the destination site.

### Requires beta access

Every other human page and interactive browser API requires a valid beta cookie. This includes guest and authenticated chat routes.

- A page or React Server Component request without valid access redirects to `/beta-access` with a sanitized internal `returnTo` value.
- An interactive API request without valid access returns JSON with status `403`; it never receives an HTML redirect body.
- `returnTo` accepts only same-origin paths beginning with `/`, rejects protocol-relative paths, and excludes public/admin/technical paths.
- After unlock, the browser returns to the validated destination or `/`.

## Access configuration and cryptography

Add one singleton `BetaAccessConfig` record with:

- password algorithm metadata, salt, and derived digest;
- monotonically increasing access version;
- explicit enabled state, independent from whether a password has been configured;
- activation and latest-rotation timestamps;
- the database user ID of the SUPER_ADMIN who last changed it;
- standard creation and update timestamps.

The password is derived with Node.js `scrypt` using a random salt and a versioned serialized format. Neither plaintext nor a reversible password value is persisted or logged. Verification uses constant-time comparison.

A separate required deployment secret, `BETA_ACCESS_COOKIE_SECRET`, signs the cookie with HMAC-SHA-256. It is not stored in the database or exposed to the client. The cookie payload contains only a format version, access-config version, expiry, and random nonce. It contains no password, email, Clerk identity, or guest identity.

Cookie properties:

- `HttpOnly`
- `Secure` in production
- `SameSite=Lax`
- `Path=/`
- `Max-Age=180 days`
- high priority

The proxy reads the singleton configuration to distinguish an unconfigured gate, a configured but temporarily disabled gate, and an active gate. Only the active state verifies the cookie format, expiry, HMAC, and access version. A password rotation or gate deactivation increments that version, so all older cookies fail on their next request. This one-row read is required even for a new browser: without it, an absent cookie cannot distinguish an intentionally inactive gate from a locked active gate. Password derivation never runs in the proxy.

If `BETA_ACCESS_COOKIE_SECRET` is missing or the active configuration cannot be read, the gated site fails closed. Admin and technical exceptions remain reachable for repair. If no configuration record exists, the gate is not active.

## Unlock flow and abuse control

`POST /api/beta-access/unlock` accepts a password and an optional sanitized `returnTo`.

The endpoint:

1. checks the failure bucket for the trusted client fingerprint;
2. loads the active singleton configuration;
3. verifies the password;
4. issues a new 180-day signed cookie when valid;
5. returns the safe destination.

Failed attempts are limited to 10 per 15-minute window. The fingerprint is a domain-separated HMAC of the trusted client address, never a raw IP. Vercel-supplied forwarding headers are trusted only under the same explicit rules already used for guest abuse control. Incorrect password, malformed cookie, inactive internal state, and unknown email/password combinations produce neutral client copy and do not reveal configuration details.

## Beta access screen

`/beta-access` uses the visual language of the existing custom auth shell: Anthon branding, focused editorial typography, strong mobile behavior, and no promotional-page clutter.

The page has two independent panels.

### Enter the beta

- title and short explanation that Anthon is in private beta;
- password field with show/hide control and password-manager-compatible autocomplete;
- primary action, `Entra in Anthon`;
- generic inline error for rejected attempts;
- automatic navigation to the original safe destination after success.

Rendering this page must not create a guest user or associate access with an authenticated session.

### Release mailing list

- email input;
- unchecked required checkbox: `Desidero essere avvisato quando Anthon sarà disponibile`;
- unchecked optional checkbox for news and additional product information;
- Privacy link and concise consent context;
- separate submit action;
- neutral success state that does not disclose whether the address was already present.

The password form and mailing form have separate loading, error, and success states. Subscribing never unlocks the site, and unlocking never subscribes the visitor.

## Subscriber data and consent behavior

Add `BetaMailingSubscriber` with:

- original display email and a normalized unique email;
- release-notification consent timestamp;
- optional-updates opt-in timestamp;
- optional-updates opt-out timestamp;
- privacy/consent text version;
- creation and update timestamps.

Submission requires a syntactically valid email and explicit release consent. The server trims and normalizes the comparison value before the unique upsert.

Repeated submissions are idempotent:

- release consent is refreshed without duplicating the subscriber;
- checking optional updates sets a new opt-in timestamp and clears opt-out;
- leaving optional updates unchecked records opt-out when an active updates consent previously existed;
- the response is the same for insert and update.

Because no mail provider is in scope, addresses are marked as unverified in the admin UI and CSV. Double opt-in and campaign delivery are deferred to a separate integration.

Mailing submissions are limited to five per trusted client fingerprint per hour. Add a generic `BetaAbuseBucket` keyed by domain-separated fingerprint, action, and window start. Store only the keyed digest, action, count, and timestamps. Old buckets are deleted by bounded retention during later reservations.

## SUPER_ADMIN console

Add `/admin/beta` and a `Beta` item to desktop and mobile admin navigation.

The route and every backing API call use `requireSuperAdmin`; hiding the navigation item is not an authorization boundary.

The page contains:

- current gate status;
- explicit activate/deactivate control, available after the first password is configured;
- activation/latest-rotation timestamp;
- new password and confirmation fields;
- an explicit warning that saving revokes all current beta access;
- subscriber totals and optional-updates total;
- server-paginated subscriber table with consent status and timestamps;
- filter for optional-updates consent;
- CSV export with consent timestamps and verification state.

The current password, salt, digest, cookie secret, and fingerprints never appear in admin responses. Updating the password is transactional: derive the new digest, increment the access version, write audit metadata, and commit together. Deactivation is an explicit SUPER_ADMIN action that atomically disables enforcement and increments the access version. Reactivation restores enforcement without changing the stored password or version.

CSV fields are quoted and values beginning with spreadsheet formula prefixes are neutralized. Exports are generated only after a fresh SUPER_ADMIN authorization check and are never publicly cacheable.

## Error handling and observability

- Gate/database unavailable: gated pages fail closed and render the recoverable beta-access error surface; gated APIs return a generic `503` JSON response.
- Invalid or expired cookie: treat as locked and expire the cookie on the redirect/response where possible.
- Incorrect password: generic rejection, failed-attempt reservation, no password material in logs.
- Rate limited: generic `429` response with retry guidance.
- Duplicate subscriber: successful idempotent response.
- Invalid consent/email: field-level `400` response without persisting partial data.
- Admin rotation failure: transaction rolls back, existing password/version remains authoritative.

Operational logging goes through `src/lib/logger/` and records event kind, outcome, and safe identifiers only. It must not log passwords, email addresses, raw IP addresses, cookie values, derived password material, or subscriber exports.

## Verification strategy

Implementation follows test-driven development.

### Unit and route tests

- password serialization and verification;
- cookie signing, tamper rejection, expiry, and version mismatch;
- safe `returnTo` handling and segment-aware public/gated route classification;
- page redirect versus API `403` behavior;
- inactive initial state and fail-closed active-state failures;
- unlock success, neutral wrong-password response, and throttling;
- subscriber validation, unique upsert, consent opt-in/opt-out, and neutral duplicate response;
- `SUPER_ADMIN` enforcement for settings, subscriber list, and export;
- CSV quoting and formula neutralization.

### Integration tests

- migration and singleton configuration behavior on an ephemeral Neon branch;
- transactional password rotation increments the version;
- a cookie valid for version N is rejected after rotation to N+1;
- concurrent duplicate subscriptions produce one subscriber;
- consent timestamps survive repeated updates correctly;
- subscriber filtering, pagination, and export use the same authoritative data.

### Runtime verification

Using the Next.js development loop and the collaborative browser:

- locked guest visiting marketing and chat routes reaches `/beta-access`;
- wrong password and throttling states are usable;
- correct password returns to the original route;
- reload and browser restart retain access;
- mailing submission works independently from unlock;
- mobile layout, keyboard focus, labels, errors, and reduced motion are correct;
- registered-user routes obey the same beta cookie;
- SUPER_ADMIN can rotate the password and export subscribers;
- an already unlocked browser is rejected immediately after rotation;
- webhook, health, cron, queue, privacy, terms, and admin boundaries remain intact.

Final gates are targeted Biome checks, targeted unit/integration tests, the complete unit suite, production build, `git diff --check`, and browser evidence. The global test/build result must be reported separately from any pre-existing or environment-only warning.

## Worktree and delivery boundary

All specification, implementation, migration, tests, and commits live in the dedicated worktree:

`/Users/kovd3v/Documents/Projects/anthon-2.0/.worktrees/beta-access-gate`

Branch: `feat/beta-access-gate`, based on local `main` commit `71d2cd7`.

The primary checkout remains untouched. The feature will be committed with conventional commit messages after verification. No push, merge, database deployment, or production deployment is implied by this design approval.

## Out of scope

- Per-user beta passwords or invite codes
- Individual browser-session revocation
- Linking access or mailing consent to Clerk users
- Sending release or newsletter email
- Double opt-in and unsubscribe delivery flows
- A general feature-flag platform
- A control that disables the beta gate after activation
