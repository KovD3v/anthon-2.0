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

### 2. Middleware

The middleware protects routes and passes auth to the app:

```typescript
// middleware.ts (auto-configured by Clerk)
import { clerkMiddleware } from "@clerk/nextjs/server";
export default clerkMiddleware();
```

### 3. Webhook Configuration

In Clerk Dashboard, configure webhook for:

-   URL: `https://your-domain.com/api/webhooks/clerk`
-   Events: `user.created`, `user.updated`, `user.deleted`, `subscription.*`

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

### `requireAuth()`

This codebase primarily uses `getAuthUser()` and role-gated helpers like `requireAdmin()`.

```typescript
import { requireAuth } from "@/lib/auth";

export async function GET() {
	const { dbUser } = await requireAuth();
	// Guaranteed to have authenticated user
}
```

### `requireRole(roles)`

Checks user has required role:

For admin-only routes, prefer `requireAdmin()` / `requireSuperAdmin()`.

## Protected Routes

### Route Groups

| Group         | Protection    | Purpose                |
| ------------- | ------------- | ---------------------- |
| `(marketing)` | Public        | Landing, pricing pages |
| `(chat)`      | Authenticated | Chat interface         |
| `(admin)`     | ADMIN role    | Admin dashboard        |

### Layout Protection

```typescript
// src/app/(chat)/layout.tsx
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function ChatLayout({ children }) {
	const { userId } = await auth();
	if (!userId) redirect("/sign-in");
	return <>{children}</>;
}
```

## User Sync

When a user signs up via Clerk, a webhook creates/updates the database record and subscription tracking:

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
