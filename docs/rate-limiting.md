# Rate Limiting and Entitlements

Anthon checks database-backed daily usage before AI generation. The selected personal-or-organization entitlement controls limits, model routing, and context size. Attachment retention and voice use the same plan catalog, but their current call sites resolve the personal role/subscription only and do not apply organization candidates.

## Canonical plans

`src/lib/plans/catalog.ts` is the source of truth.

| Plan | Requests/day | Input tokens | Output tokens | Cost/day | Context messages | Attachment retention |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `GUEST` | 10 | 20,000 | 10,000 | $0.05 | 5 | 1 day |
| `TRIAL` | 3 | 100,000 | 50,000 | $0.50 | 10 | 7 days |
| `BASIC` | 50 | 500,000 | 250,000 | $3.00 | 15 | 30 days |
| `BASIC_PLUS` | 50 | 800,000 | 400,000 | $5.00 | 30 | 60 days |
| `PRO` | 100 | 2,000,000 | 1,000,000 | $15.00 | 100 | 180 days |
| `ADMIN` | Unlimited | Unlimited | Unlimited | Unlimited | 100 | 3,650 days |

`ACTIVE` is a subscription status, not a plan. An active subscription must have a recognized plan ID containing `basic`, `basic_plus`, or `pro`; otherwise plan resolution throws an invalid-plan error. Non-active/unknown personal subscriptions fall back to `TRIAL`.

## Effective entitlement selection

For a normal signed-in user:

1. Build the personal candidate from role, guest status, subscription status, and plan ID.
2. Load active memberships in active organizations.
3. Convert every valid organization contract into a candidate.
4. Select the strongest candidate across the personal and organization candidates.

The comparison is lexicographic:

1. model tier;
2. request cap;
3. input-token cap;
4. output-token cap;
5. cost cap;
6. context-message cap;
7. stable source-ID tie break.

An organization contract therefore does not automatically replace a stronger personal plan. If active memberships exist but none has a valid contract, the response labels the personal source as a fallback.

Special cases:

- Guests always use `GUEST` and skip organizations.
- `ADMIN` and `SUPER_ADMIN` always use `ADMIN` and skip organizations.
- Suspended/archived organizations and non-active memberships do not contribute candidates.

## Daily usage

`DailyUsage` is keyed by `(userId, date)` where `date` is midnight UTC. A generation increments:

- request count;
- input tokens;
- output tokens;
- reasoning tokens;
- total USD cost.

Voice generation does not increment request count. The tracking helper increments `voiceCostUsd` and total daily cost only when a positive cost is supplied. Current web/Telegram/WhatsApp call sites do not pass that cost, so voice generation is recorded in `VoiceUsage` but normally does not affect the daily cost counters.

The limit check blocks when any current counter is already at or above its effective cap. The reset boundary is `00:00 UTC`, not the user's local timezone.

## API behavior

`checkRateLimit(userId, subscriptionStatus, userRole, planId, isGuest)` returns:

- `allowed`;
- current `usage`;
- effective `limits`;
- percentage used;
- a reason and upgrade suggestion when blocked;
- the selected model tier and source metadata;
- the complete effective entitlement used by the orchestrator.

Chat and channel handlers return or send a limit-specific response before starting AI work. `/api/usage` exposes the signed-in user's usage, limits, and selected source.

## Organization seats

Seat limits are separate from daily usage:

- only `ACTIVE` memberships consume seats;
- pending invitations do not consume seats;
- activation above the contract's `seatLimit` is marked `BLOCKED` locally and removed from Clerk on a best-effort basis.

See [Organizations](./organizations.md) for synchronization and failure modes.

## Related documentation

- [AI System](./ai-system.md)
- [Organizations](./organizations.md)
- [Database](./database.md)
- [API Reference](./api.md)
