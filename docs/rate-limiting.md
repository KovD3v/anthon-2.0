# Rate Limiting

Anthon 2.0 enforces database-backed daily limits before processing AI requests
and uploads.

## Overview

Rate limits are checked per user on each request. Committed usage is tracked in
`DailyUsage` and reset at `00:00 UTC`; `AiUsageReservation` rows fence work that
has been admitted but not yet reconciled.

## Personal Plan Limits (Source of Truth)

These are the personal limits used by the entitlement resolver.

| Tier         | Requests/Day | Input Tokens | Output Tokens | Cost/Day | Max Context Messages |
| ------------ | ------------ | ------------ | ------------- | -------- | -------------------- |
| `GUEST`      | 10           | 20,000       | 10,000        | $0.05    | 5                    |
| `TRIAL`      | 10           | 100,000      | 50,000        | $0.50    | 10                   |
| `basic`      | 50           | 500,000      | 250,000       | $3.00    | 15                   |
| `basic_plus` | 50           | 800,000      | 400,000       | $5.00    | 30                   |
| `pro`        | 100          | 2,000,000    | 1,000,000     | $15.00   | 100                  |
| `ACTIVE`     | 50           | 500,000      | 250,000       | $3.00    | 15                   |
| `ADMIN`      | ∞            | ∞            | ∞             | ∞        | 100                  |

## Organization Entitlements

For non-guest, non-admin users, effective entitlements are resolved with this priority:

1. If no active organization memberships exist: use personal limits.
2. If active memberships exist and at least one valid organization contract exists: compare personal and organization entitlement sources, then use the strongest single source.
3. If memberships exist but no valid organization contract is available: use personal fallback limits.

Notes:

1. Guests skip organization resolution entirely.
2. `ADMIN` and `SUPER_ADMIN` always resolve to admin limits.
3. Registration fallback entitlements may equal or exceed guest entitlements, but never fall below them.
4. The `sources` payload returned by `checkRateLimit` reports which source was actually applied (`personal` or `organization`).

## Seat Limits and Memberships

Seat enforcement is based on active memberships only:

1. `ACTIVE` members consume seats.
2. Pending invitations do not consume seats.
3. If activation exceeds `seatLimit`, membership is blocked and reverted from Clerk.

## API Integration

Primary check path:

1. `checkRateLimit(userId, subscriptionStatus, userRole, planId, isGuest)`
   reads committed usage and resolves effective entitlements.
2. After the inbound message is durably claimed, `reserveAiUsage(...)` locks
   the user and atomically admits one request key.
3. The provider generates the answer.
4. Assistant persistence and actual-usage reconciliation commit together.

For finite plans, a second concurrent turn receives a retryable `409` while a
reservation is active. A retry with the same request key reuses a persisted or
recoverable result instead of generating and charging twice. Generation
failures release the reservation; post-generation persistence failures retain
a bounded recovery record until the response can be persisted.

Returned payload includes:

1. Current `usage`
2. Effective `limits`
3. Block reason (if blocked)
4. Upgrade info (if applicable)
5. Entitlement source metadata (`modelTier` + the applied source in `sources`)

## Guest and Admin Behavior

1. Guests use guest limits and skip organization merging. New guest sessions
   are also limited to three creations per trusted client address and UTC day
   by default, even when the cookie is cleared.
2. `ADMIN` and `SUPER_ADMIN` users resolve to admin limits and skip organization merging.

## Upload Limits

Uploads reserve both object count and bytes before Vercel Blob is called. The
winning effective personal or organization plan supplies the limits.

| Tier | Files/Day | Bytes/Day |
| ---- | --------- | --------- |
| `GUEST` | 0 | 0 |
| `TRIAL` | 10 | 50 MiB |
| `basic` | 25 | 250 MiB |
| `basic_plus` | 50 | 500 MiB |
| `pro` | 100 | 2 GiB |
| `ADMIN` | ∞ | ∞ |

Individual files remain capped at 10 MiB. Empty files are rejected. Quota
denials return `429`; a storage or database failure releases the reservation.

## Notes

1. The same entitlement resolution is used by chat, channel webhook, and upload entry points.
2. Usage counters are UTC-based for deterministic reset behavior.

## Related Documentation

- [Authentication](./authentication.md)
- [API Reference](./api.md)
- [Database](./database.md)
