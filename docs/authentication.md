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
CLERK_WEBHOOK_SIGNING_SECRET="whsec_..."
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

Roles are stored in the database User model and synced from Clerk metadata:

```typescript
// Set role in Clerk Dashboard or via API
await clerkClient.users.updateUser(userId, {
	publicMetadata: { role: "ADMIN" },
});
```

## Auth Utilities

**File:** `src/lib/auth.ts`

### `getAuthUser()`

Gets the authenticated user with database record:

```typescript
import { getAuthUser } from "@/lib/auth";

const { clerkUser, dbUser } = await getAuthUser();
// clerkUser: Clerk user object
// dbUser: Prisma User with profile, preferences, subscription
```

### `requireAuth()`

Throws if not authenticated:

```typescript
import { requireAuth } from "@/lib/auth";

export async function GET() {
	const { dbUser } = await requireAuth();
	// Guaranteed to have authenticated user
}
```

### `requireRole(roles)`

Checks user has required role:

```typescript
import { requireRole } from "@/lib/auth";

export async function GET() {
	const { dbUser } = await requireRole(["ADMIN", "SUPER_ADMIN"]);
	// Only ADMIN or SUPER_ADMIN can access
}
```

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

When a user signs up via Clerk, a webhook creates the database record:

```typescript
// /api/webhooks/clerk/route.ts
case "user.created":
  await prisma.user.create({
    data: {
      clerkId: event.data.id,
      email: event.data.email_addresses[0]?.email_address,
      role: "USER",
      subscription: {
        create: {
          status: "TRIAL",
          trialStartedAt: new Date(),
          trialEndsAt: addDays(new Date(), 7),
        },
      },
    },
  });
```

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
