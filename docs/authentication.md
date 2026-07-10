# Authentication and Authorization

Anthon uses Clerk for browser identity and organization/billing events, a database role for admin authorization, and an HttpOnly cookie for guest web sessions.

## Configuration

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."
CLERK_SECRET_KEY="sk_test_..."
CLERK_WEBHOOK_SECRET="whsec_..."
```

The webhook secret is only required when receiving Clerk events. See [Configuration](./configuration.md).

## Access-control layers

Authentication is intentionally layered.

### 1. Route proxy

`src/proxy.ts` uses Clerk's `clerkMiddleware` as the initial session gate for:

- `/profile(.*)`
- `/settings(.*)`
- `/admin(.*)`
- `/channels(.*)`
- `/organization(.*)`

`/chat` is excluded because signed-out guest chat is supported.

The proxy only knows whether a Clerk session exists. It does not replace database role or resource-ownership checks.

### 2. Server layouts

- The admin layout calls `requireAdmin()` and redirects non-admin users.
- The chat layout resolves either a Clerk-backed user or a guest-cookie user.
- Clerk organization components handle the signed-in organization page.

### 3. API routes

Every API route enforces its own boundary:

| Route family | Boundary |
| --- | --- |
| Authenticated user routes | Clerk session plus internal user lookup/ownership checks |
| `/api/guest/*` | Guest cookie and guest-owned resources |
| `/api/admin/*` | `requireAdmin()`; role changes require `requireSuperAdmin()` |
| `/api/cron/*` | `Authorization: Bearer $CRON_SECRET` |
| `/api/queues/*` | QStash signature |
| `/api/webhooks/*` | Provider-specific signatures/secrets |

## Internal users and roles

Clerk IDs map to the local `User` model. `getAuthUser()`:

1. reads the Clerk session;
2. looks up the internal user through a 60-second cache;
3. creates the local user when absent;
4. schedules a Clerk profile-name sync in the background.

Database roles:

| Role | Access |
| --- | --- |
| `USER` | Standard user and organization-member features |
| `ADMIN` | Admin UI and admin APIs |
| `SUPER_ADMIN` | Admin access plus user-role changes |

The database role is authoritative for admin access. Mirroring it into Clerk metadata is not required by the current implementation.

## Auth helpers

`src/lib/auth.ts` exports the primary server helpers.

```ts
import { getAuthUser } from "@/lib/auth";

const { user, error } = await getAuthUser();
```

```ts
import { requireAdmin } from "@/lib/auth";

export async function GET() {
  const { user, errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  return Response.json({ userId: user!.id });
}
```

Use ownership checks in addition to authentication whenever a route accepts a chat, message, attachment, organization, or user ID.

## Guest web sessions

`src/lib/guest-auth.ts` stores a random guest token in the `anthon_guest_token` cookie:

- HttpOnly;
- `SameSite=Lax`;
- Secure in production;
- 30-day maximum age.

Only a SHA-256 hash is stored in `User.guestAbuseIdHash`. A missing or invalid token creates a new guest user when a guest API requires authentication.

Guest chat uses separate endpoints and plan limits. It blocks attachments, memory extraction, and voice output.

## Guest migration

Migration can be triggered in two ways:

- a guest browser signs in and requests the authenticated chat list;
- a Telegram/WhatsApp guest consumes a channel-link token while signed in.

The merge runs transactionally through `migrateGuestToUser()`. See [Guest Migration](./guest-migration.md).

## Clerk webhook synchronization

Endpoint: `POST /api/webhooks/clerk`

The route verifies Svix headers with `CLERK_WEBHOOK_SECRET` and currently handles:

- `user.created`
- `user.updated`
- `subscription.created`
- `subscription.updated`
- `subscription.deleted`
- `organization.created`
- `organization.updated`
- `organization.deleted`
- organization membership created/updated/deleted variants
- organization invitation accepted variants

`user.deleted` is not handled by the webhook switch. Self-service account deletion uses `DELETE /api/user/me`. It rejects users who still created organizations, removes owned attachment/artifact Blob objects, deletes Clerk, and then hard-deletes the local record. Blob failure happens before identity deletion so the account can retry. Clerk and PostgreSQL remain non-transactional, so failure between those final calls still requires operational reconciliation.

Configure only the events the handler supports unless you also add handling for another event type.

## Channel linking

Telegram and WhatsApp `/connect` commands create short-lived one-time tokens. The raw token is returned in a link; only its hash is stored. Link pages require a signed-in Clerk target account and can migrate a channel guest before attaching the identity.

## Related documentation

- [API Reference](./api.md)
- [Guest Migration](./guest-migration.md)
- [Organizations](./organizations.md)
- [Configuration](./configuration.md)
