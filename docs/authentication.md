# Authentication

Anthon 2.0 uses [Clerk](https://clerk.com) for authentication and user management.

## Overview

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client    │────▶│    Clerk    │────▶│  Anthon DB  │
│  (Browser)  │     │   (Auth)    │     │   (User)    │
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │                   │
       │   Sign In/Up      │    Webhook        │
       └───────────────────┼───────────────────┘
                           │
                      User Sync
```

## Setup

### 1. Environment Variables

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."
CLERK_SECRET_KEY="sk_test_..."
CLERK_WEBHOOK_SECRET="whsec_..."
```

### 2. Route-Level Protection

This project does not rely on a global `middleware.ts` auth gate.
Access control is enforced at layout/API level with helpers in `src/lib/auth.ts`:

- `getAuthUser()` for authenticated user resolution
- `requireAdmin()` for admin-only access
- `requireSuperAdmin()` for super-admin-only operations

### 3. Webhook Configuration

In Clerk Dashboard, configure webhook for:

-   URL: `https://your-domain.com/api/webhooks/clerk`
-   Events: `user.created`, `user.updated`, `user.deleted`, `subscription.*`, `organization.*`, `organizationMembership.*`, `organizationInvitation.accepted`

## User Roles

| Role          | Permissions                                |
| ------------- | ------------------------------------------ |
| `USER`        | Standard user access                       |
| `ADMIN`       | Access to admin dashboard, user management |
| `SUPER_ADMIN` | Full system access, can manage admins      |

### Role Assignment

Roles are stored in the database `User.role` field.

- Admin UI and admin APIs enforce role checks.
- Only `SUPER_ADMIN` can change roles (see admin endpoints in [API Reference](./api.md)).

If you also want to mirror roles into Clerk metadata for visibility, that is optional and not required by the app.

## Auth Utilities

**File:** `src/lib/auth.ts`

### `getAuthUser()`

Gets the authenticated user with database record:

```typescript
import { getAuthUser } from "@/lib/auth";

const { user, error } = await getAuthUser();
// user: internal AuthUser (id, role, etc.)
// error: string when not authenticated or on failure
```

### `requireAdmin()` / `requireSuperAdmin()`

Use these helpers for role-gated routes:

```typescript
import { requireAdmin } from "@/lib/auth";

export async function GET() {
  const { user, errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;
  return Response.json({ ok: true, userId: user!.id });
}
```

## Protected Routes

### Route Groups

| Group         | Protection    | Purpose                |
| ------------- | ------------- | ---------------------- |
| `(marketing)` | Public        | Landing, pricing pages |
| `(chat)`      | Mixed (guest + authenticated) | Chat interface |
| `(admin)`     | ADMIN role    | Admin dashboard        |
| `/organization` | Authenticated | Clerk Organization management |

### Layout Protection

```typescript
// src/app/(admin)/admin/layout.tsx
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";

export default async function AdminLayout({ children }) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) redirect("/");
  return <>{children}</>;
}
```

## User Sync

When a user signs up via Clerk, a webhook creates/updates the database record and subscription tracking.
Organization and membership webhooks are also mirrored locally for contract seat enforcement and audit logging:

See the handler implementation in `/api/webhooks/clerk` for the exact event mapping.

## Client Components

### Sign In/Up Buttons

```tsx
import { SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";

export function Navbar() {
	return (
		<nav>
			<SignInButton />
			<SignUpButton />
			<UserButton />
		</nav>
	);
}
```

### Conditional Rendering

```tsx
import { SignedIn, SignedOut } from "@clerk/nextjs";

export function Header() {
	return (
		<>
			<SignedOut>
				<SignInButton />
			</SignedOut>
			<SignedIn>
				<UserButton />
			</SignedIn>
		</>
	);
}
```

## Related Documentation

-   [API Reference](./api.md) - Auth in API routes
-   [Rate Limiting](./rate-limiting.md) - Limits by subscription
