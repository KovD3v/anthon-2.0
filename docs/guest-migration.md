# Guest User Migration

When a guest user (anonymous) registers or links a channel, their data is migrated to the registered account.

## Overview

```
┌─────────────────┐         ┌─────────────────┐
│   Guest User    │   ───►  │ Registered User │
│  (isGuest=true) │ migrate │ (Clerk account) │
└─────────────────┘         └─────────────────┘
        │                           │
        ├── Messages                │
        ├── Chats                   │
        ├── Profile        ───►     │ All data unified
        ├── Preferences             │
        ├── Memories                │
        └── SessionSummaries        │
```

## Migration Trigger

Migration is triggered when a guest user links a channel (e.g., Telegram) to a registered account via the `/link/telegram/[token]` flow.

**File:** `src/lib/guest-migration.ts`

## Conflict Resolution Strategy

When the guest user has data that conflicts with the registered user's existing data, conflicts are resolved based on **recency** (most recently updated data wins).

| Scenario                      | Resolution                                  |
| ----------------------------- | ------------------------------------------- |
| Both have the same field      | **More recent wins** (based on `updatedAt`) |
| Only guest has the field      | Copied to registered user                   |
| Only registered has the field | Kept as-is                                  |

### Data-Specific Behavior

| Data Type             | Migration Strategy                  |
| --------------------- | ----------------------------------- |
| **Messages**          | All moved to registered user        |
| **Chats**             | All moved to registered user        |
| **Profile**           | Merge with recency priority         |
| **Preferences**       | Merge with recency priority         |
| **Memories**          | Move or update based on recency     |
| **SessionSummaries**  | All moved to registered user        |
| **DailyUsage**        | Aggregated (counters are summed)    |
| **ChannelIdentities** | Updated to point to registered user |

## Conflict Logging

Conflicts are saved as a special memory entry `_migration_conflicts` for reference:

```json
{
	"migratedAt": "2024-12-13T18:30:00Z",
	"guestUserId": "guest_cuid123",
	"conflicts": [
		{
			"field": "profile:name",
			"keptValue": "Marco",
			"discardedValue": "Marco Rossi",
			"reason": "guest_newer"
		},
		{
			"field": "memory:obiettivo",
			"keptValue": "vincere torneo",
			"discardedValue": "top 100 ATP",
			"reason": "target_newer"
		}
	]
}
```

### Conflict Reasons

| Reason         | Meaning                                     |
| -------------- | ------------------------------------------- |
| `guest_newer`  | Guest data was more recent, replaced target |
| `target_newer` | Target data was more recent, kept original  |

## API Usage

```typescript
import { migrateGuestToUser } from "@/lib/guest-migration";

const result = await migrateGuestToUser(guestUserId, targetUserId);

if (result.success) {
	console.log("Migrated:", result.migratedCounts);
	console.log("Conflicts resolved:", result.conflicts.length);
} else {
	console.error("Migration failed:", result.error);
}
```

### Return Type

```typescript
interface MigrationResult {
	success: boolean;
	migratedCounts: {
		messages: number;
		chats: number;
		memories: number;
		sessionSummaries: number;
		channelIdentities: number;
		dailyUsage: number;
		profile: boolean;
		preferences: boolean;
	};
	conflicts: ConflictInfo[];
	error?: string;
}
```

## Transaction Safety

All migration operations are wrapped in a Prisma transaction. If any step fails, the entire migration is rolled back to maintain data integrity.

## Related Documentation

-   [Authentication](./authentication.md) - User registration flow
-   [Database](./database.md) - User and related models
-   [Rate Limiting](./rate-limiting.md) - Guest vs registered limits
