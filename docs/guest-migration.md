# Guest User Migration

When an anonymous web user registers, signs in, or links an external channel,
their durable guest data is migrated to the registered account.

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
        ├── ConversationThreads     │
        ├── AI turn traces          │
        ├── SessionSummaries        │
        └── Usage counters          │
```

## Migration Trigger

Cookie-backed web conversion is coordinated by
`convertGuestForAuthenticatedUser()` in `src/lib/guest-conversion.ts`. It runs
before authenticated chat data is loaded, including the chat layout,
`/chat/[id]`, and `GET /api/chats`. The client may also retry it with
`POST /api/guest/convert` after the rendered layout could not mutate cookies.

Telegram and WhatsApp linking flows also call the lower-level migration when an
external guest identity is connected to an authenticated account.

The guest cookie is cleared after successful conversion, when it is stale, or
when it already belongs to the authenticated user. A retryable transaction
failure preserves the cookie so a later request can try again.

**Files:** `src/lib/guest-conversion.ts`, `src/lib/guest-migration.ts`

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
| **ConversationThreads** | All moved with their chats/messages |
| **AiTurnTraces**      | All moved with their conversation threads |
| **Profile**           | Merge with recency priority         |
| **Preferences**       | Merge with recency priority         |
| **Memories**          | Move or update based on recency     |
| **SessionSummaries**  | All moved to registered user        |
| **DailyUsage**        | Aggregated (counters are summed)    |
| **DailyUploadUsage**  | Aggregated by UTC day               |
| **In-flight reservations** | Deleted instead of transferred because claims are identity-scoped |
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

Authenticated application surfaces normally call the cookie-aware coordinator:

```typescript
import { convertGuestForAuthenticatedUser } from "@/lib/guest-conversion";

const outcome = await convertGuestForAuthenticatedUser(userId);
// no_cookie | stale_cookie | already_owned | migrated | retryable_failure
```

Channel-linking flows that already resolved both internal user IDs call the
lower-level atomic migration directly:

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
