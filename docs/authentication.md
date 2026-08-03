# Authentication

Anthon 2.0 uses Clerk Core 3 as the authentication engine. Sign-in, sign-up,
email verification, OAuth continuation, client trust, MFA, and password recovery
use Anthon-owned Italian interfaces; account, organization, and rare session-task
screens continue to use Clerk components inside the same visual shell.

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
NEXT_PUBLIC_CLERK_SIGN_IN_URL="/sign-in"
NEXT_PUBLIC_CLERK_SIGN_UP_URL="/sign-up"
NEXT_PUBLIC_TERMS_URL="https://anthon.ai/terms"
NEXT_PUBLIC_PRIVACY_URL="https://anthon.ai/privacy"
```

The legal URL helper falls back to the two canonical `anthon.ai` addresses and
accepts only HTTPS outside local development.

### 2. Route-Level Protection

`src/proxy.ts` redirects signed-out users away from protected page routes while
preserving only the relative `pathname + search`. Layouts and APIs still enforce
authorization with helpers in `src/lib/auth.ts`:

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

## Custom authentication routes

The `(auth)` route group provides a dedicated shell without changing public
URLs:

| Route | Purpose |
| --- | --- |
| `/sign-in` | Password, Apple, Facebook, Google, client trust, and MFA |
| `/sign-up` | Email/password registration, legal consent, CAPTCHA, and email verification |
| `/forgot-password` | Email-code password reset and session finalization |
| `/sso-callback` | Clerk OAuth callback |
| `/auth-continue` | OAuth requirements and email verification |
| `/session-tasks/*` | Clerk organization, forced reset, and MFA setup tasks in `AuthShell` |

`getSafeAuthContinuation()` is the single boundary for post-auth navigation. It
accepts `/chat` and chat descendants, the exact protected top-level destinations,
and valid Telegram/WhatsApp linking routes. Absolute URLs, protocol-relative
URLs, backslashes, fragments, auth/API/static routes, malformed values, and
multiple query values fall back to `/chat`.

Guest signup remains intentionally separate: `getSafeGuestContinuation()` only
accepts `/chat` and `/chat/<id>`, and conversion still occurs through the
authenticated `POST /api/guest/convert` boundary. Server layouts must not mutate
the guest cookie.

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

### Marketing navigation

```tsx
import { Show, UserButton } from "@clerk/nextjs";
import Link from "next/link";

export function Navbar() {
	return (
		<nav>
			<Show when="signed-out">
				<Link href="/sign-in">Accedi</Link>
				<Link href="/sign-up">Registrati</Link>
			</Show>
			<Show when="signed-in"><UserButton /></Show>
		</nav>
	);
}
```

### Conditional Rendering

```tsx
import { Show } from "@clerk/nextjs";

export function Header() {
	return (
		<>
			<Show when="signed-in">
				<UserButton />
			</Show>
		</>
	);
}
```

## Clerk Dashboard and release gates

Before a production release:

- register `/sso-callback` for local, preview, and production Apple, Facebook,
  and Google applications;
- confirm email-code client trust, reset-password email delivery, MFA methods,
  and all three session tasks against a development Clerk instance;
- remove the stale `tryahtnon.com` value from Clerk Dashboard configuration;
- verify that both configured legal URLs return HTTP 200;
- verify guest conversion against a disposable Neon branch. The known
  `ConversationThread` ownership migration is tracked separately and is not
  changed by the authentication UI work.

## Related Documentation

-   [API Reference](./api.md) - Auth in API routes
-   [Rate Limiting](./rate-limiting.md) - Limits by subscription
