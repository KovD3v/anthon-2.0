# Rate Limiting

Anthon 2.0 implements database-backed rate limiting to control AI usage per user based on subscription tier.

## Overview

Rate limiting is enforced at the API level before processing chat requests. Limits are tracked daily in the `DailyUsage` table.

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Request   │────▶│ Check Rate  │────▶│  Process    │
│             │     │   Limit     │     │   Request   │
└─────────────┘     └─────────────┘     └─────────────┘
                          │
                    ┌─────┴─────┐
                    │DailyUsage │
                    │   Table   │
                    └───────────┘
```

## Subscription Tiers

| Tier        | Requests/Day | Input Tokens | Output Tokens | Cost/Day |
| ----------- | ------------ | ------------ | ------------- | -------- |
| **GUEST**   | 10           | 20,000       | 10,000        | $0.05    |
| **TRIAL**   | 50           | 100,000      | 50,000        | $1.00    |
| **STARTER** | 200          | 500,000      | 200,000       | $5.00    |
| **PRO**     | 1,000        | 2,000,000    | 1,000,000     | $25.00   |
| **ADMIN**   | ∞            | ∞            | ∞             | ∞        |

## Configuration

**File:** `src/lib/rate-limit.ts`

```typescript
export const RATE_LIMITS: Record<string, RateLimits> = {
	TRIAL: {
		maxRequestsPerDay: 50,
		maxInputTokensPerDay: 100_000,
		maxOutputTokensPerDay: 50_000,
		maxCostPerDay: 1.0,
	},
	STARTER: {
		maxRequestsPerDay: 200,
		maxInputTokensPerDay: 500_000,
		maxOutputTokensPerDay: 200_000,
		maxCostPerDay: 5.0,
	},
	// ...
};
```

## Usage Tracking

### DailyUsage Table

Each user has one record per day:

| Field          | Type  | Description            |
| -------------- | ----- | ---------------------- |
| `date`         | Date  | UTC date (no time)     |
| `requestCount` | Int   | Chat requests made     |
| `inputTokens`  | Int   | Total prompt tokens    |
| `outputTokens` | Int   | Total generated tokens |
| `totalCostUsd` | Float | Accumulated cost       |

### Increment Usage

After each chat response:

```typescript
await incrementUsage(
	userId,
	metrics.inputTokens,
	metrics.outputTokens,
	metrics.costUsd
);
```

## API Functions

### `checkRateLimit(userId, subscriptionStatus?, userRole?, planId?, isGuest?)`

Check if user can make a request:

```typescript
const result = await checkRateLimit(userId, "ACTIVE", "USER", "plan_starter");

if (!result.allowed) {
	return new Response(
		JSON.stringify({
			error: result.reason,
			code: "RATE_LIMIT_EXCEEDED",
		}),
		{ status: 429 }
	);
}
```

**Returns:**

```typescript
interface RateLimitResult {
	allowed: boolean;
	usage: DailyUsageData;
	limits: RateLimits;
	reason?: string; // Why blocked
	percentUsed: {
		requests: number; // 0-100+
		inputTokens: number;
		outputTokens: number;
		cost: number;
	};
}
```

### `getRemainingAllowance(userId)`

Get remaining quota for the day:

```typescript
const remaining = await getRemainingAllowance(userId);
// { requests: 45, inputTokens: 95000, outputTokens: 48000, costUsd: 0.95 }
```

### `formatRateLimitStatus(result)`

Format for UI display:

```typescript
const status = formatRateLimitStatus(result);
// { status: "warning", message: "80% of daily limit used", percentUsed: 80 }
```

## Integration

### In Chat API

```typescript
// /api/chat/route.ts
export async function POST(request: Request) {
	const { dbUser } = await requireAuth();

	// Check rate limit
	const rateLimit = await checkRateLimit(
		dbUser.id,
		dbUser.subscription?.status,
		dbUser.role,
		dbUser.subscription?.planId
	);

	if (!rateLimit.allowed) {
		return Response.json(
			{ error: rateLimit.reason, code: "RATE_LIMIT_EXCEEDED" },
			{ status: 429 }
		);
	}

	// Process chat...
}
```

### UI Feedback

The frontend displays usage status:

```tsx
function UsageIndicator({ percentUsed }: { percentUsed: number }) {
	const status =
		percentUsed >= 100
			? "limit-reached"
			: percentUsed >= 80
			? "warning"
			: "ok";

	return (
		<div className={`usage-${status}`}>
			{percentUsed}% of daily limit used
		</div>
	);
}
```

## Reset Schedule

Usage counters reset at **00:00 UTC** daily. The `date` field uses UTC to ensure consistent reset times across timezones.

```typescript
function getUTCDateOnly(): Date {
	const now = new Date();
	return new Date(
		Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
	);
}
```

## Admin Override

Users with `ADMIN` or `SUPER_ADMIN` role have unlimited access:

```typescript
if (userRole === "ADMIN" || userRole === "SUPER_ADMIN") {
	return RATE_LIMITS.ADMIN; // All limits = Infinity
}
```

## Related Documentation

-   [Authentication](./authentication.md) - User roles
-   [API Reference](./api.md) - Usage endpoint
-   [Database](./database.md) - DailyUsage model
