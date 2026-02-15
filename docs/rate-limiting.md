# Rate Limiting

Anthon 2.0 enforces database-backed daily limits before processing AI requests.

## Overview

Rate limits are checked per user on each request. Usage is tracked in `DailyUsage` and reset at `00:00 UTC`.

## Personal Plan Limits (Source of Truth)

These are the personal limits used by the entitlement resolver.

| Tier         | Requests/Day | Input Tokens | Output Tokens | Cost/Day | Max Context Messages |
| ------------ | ------------ | ------------ | ------------- | -------- | -------------------- |
| `GUEST`      | 10           | 20,000       | 10,000        | $0.05    | 5                    |
| `TRIAL`      | 3            | 100,000      | 50,000        | $0.50    | 10                   |
| `basic`      | 50           | 500,000      | 250,000       | $3.00    | 15                   |
| `basic_plus` | 50           | 800,000      | 400,000       | $5.00    | 30                   |
| `pro`        | 100          | 2,000,000    | 1,000,000     | $15.00   | 100                  |
| `ACTIVE`     | 50           | 500,000      | 250,000       | $3.00    | 15                   |
| `ADMIN`      | ∞            | ∞            | ∞             | ∞        | 100                  |

## Organization Entitlements

For non-guest, non-admin users, effective entitlements are resolved by combining:

1. Personal source (subscription/role)
2. All active organization memberships with active organization contracts

Merge strategy:

1. Numeric limits (`requests`, `tokens`, `cost`, `context`) use per-dimension `max` across all sources.
2. `modelTier` uses the highest available tier across sources.

This means organization contracts can upgrade users, but not downgrade below personal entitlements.

## Seat Limits and Memberships

Seat enforcement is based on active memberships only:

1. `ACTIVE` members consume seats.
2. Pending invitations do not consume seats.
3. If activation exceeds `seatLimit`, membership is blocked and reverted from Clerk.

## API Integration

Primary check path:

1. `checkRateLimit(userId, subscriptionStatus, userRole, planId, isGuest)`
2. Fetches daily usage from `DailyUsage`
3. Resolves effective entitlements
4. Compares usage to effective limits

Returned payload includes:

1. Current `usage`
2. Effective `limits`
3. Block reason (if blocked)
4. Upgrade info (if applicable)
5. Entitlement source metadata (`modelTier` + sources)

## Guest and Admin Behavior

1. Guests use guest limits and skip organization merging.
2. `ADMIN` and `SUPER_ADMIN` users resolve to admin limits and skip organization merging.

## Notes

1. The same entitlement resolution is used by chat and channel webhook entry points.
2. Usage counters are UTC-based for deterministic reset behavior.

## Related Documentation

- [Authentication](./authentication.md)
- [API Reference](./api.md)
- [Database](./database.md)
