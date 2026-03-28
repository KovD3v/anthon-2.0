# Organizations

This document describes the organization (B2B) feature introduced in the latest organizations rollout commit.

## Overview

Anthon supports contracted organizations on top of personal subscriptions through Clerk Organizations.

- Admins manage contracts and ownership in `/admin/organizations`.
- Members and owners manage invitations/membership in Clerk UI at `/organization`.
- Membership and lifecycle changes are synchronized via Clerk webhooks.
- Organization contracts can define limits, model tier, and seat caps.

## Core Data Model

Organization data is stored in four models:

| Model | Purpose |
| ----- | ------- |
| `Organization` | Tenant identity and owner metadata (mapped to Clerk organization). |
| `OrganizationContract` | Contract limits and plan defaults/overrides. |
| `OrganizationMembership` | Local mirror of Clerk membership state. |
| `OrganizationAuditLog` | Immutable audit trail for sensitive actions. |

Key enums:

- `OrganizationStatus`: `ACTIVE`, `SUSPENDED`, `ARCHIVED`
- `OrganizationBasePlan`: `BASIC`, `BASIC_PLUS`, `PRO`
- `OrganizationModelTier`: `TRIAL`, `BASIC`, `BASIC_PLUS`, `PRO`, `ENTERPRISE`, `ADMIN`
- `OrganizationMemberRole`: `OWNER`, `MEMBER`
- `OrganizationMembershipStatus`: `ACTIVE`, `REMOVED`, `BLOCKED`

## Contract Plans and Defaults

`basePlan` sets defaults; contract fields are explicit overrides.

| Base Plan | Default Model Tier | Default Seat Limit | Requests/Day | Input Tokens/Day | Output Tokens/Day | Cost/Day | Max Context |
| --------- | ------------------ | ------------------ | ------------ | ---------------- | ----------------- | -------- | ----------- |
| `BASIC` | `BASIC` | `10` | `50` | `500000` | `250000` | `3` | `15` |
| `BASIC_PLUS` | `BASIC_PLUS` | `25` | `50` | `800000` | `400000` | `5` | `30` |
| `PRO` | `PRO` | `50` | `100` | `2000000` | `1000000` | `15` | `100` |

Contract payload fields:

- `basePlan`
- `seatLimit`
- `planLabel`
- `modelTier`
- `maxRequestsPerDay`
- `maxInputTokensPerDay`
- `maxOutputTokensPerDay`
- `maxCostPerDay`
- `maxContextMessages`

## Effective Entitlements

`resolveEffectiveEntitlements()` drives both rate limiting and model access.

- Guests and admins use personal/admin limits only.
- If the user has no active org memberships, personal limits are used.
- If active org memberships with contracts exist, the best available organization entitlement source is used.
- If memberships exist but no valid org contract is found, personal fallback is used.

The response carries source metadata:

- `type`: `personal` or `organization`
- `sourceId`
- `sourceLabel`
- resolved `modelTier`
- resolved numeric limits

## Admin API

Admin routes are protected with `requireAdmin()`.

| Endpoint | Purpose |
| -------- | ------- |
| `GET /api/admin/organizations` | List organizations and active seat usage (`?sync=1` can backfill from Clerk). |
| `POST /api/admin/organizations` | Create organization, contract, and owner assignment/invite. |
| `GET /api/admin/organizations/[organizationId]` | Get organization detail, memberships, and effective contract. |
| `PATCH /api/admin/organizations/[organizationId]` | Update metadata, contract, status, and/or owner transfer. |
| `DELETE /api/admin/organizations/[organizationId]` | Delete organization from Clerk and local storage. |
| `GET /api/admin/organizations/[organizationId]/audit` | Paginated audit log (`page`, `limit`). |

## Admin UI Flow (`/admin/organizations`)

- Create organization with name, owner email, base plan, and contract values.
- Edit slug/name/status/contract in place.
- Transfer owner by changing owner email.
- Preview effective limits from base plan + overrides.
- Sync organizations from Clerk manually via `sync=1`.
- Review audit events from the integrated audit panel.

## Webhook Sync

`/api/webhooks/clerk` handles:

- `organization.created`, `organization.updated`, `organization.deleted`
- `organizationMembership.created`, `organizationMembership.updated`, `organizationMembership.deleted`
- `organization_membership.*` aliases
- `organizationInvitation.accepted`, `organization_invitation.accepted`

Sync behavior:

- Organization upsert/delete updates local organization status/metadata.
- Membership upsert mirrors role/status and writes audit events.
- Invitation accepted waits for real membership id before syncing activation.

## Seat Limit Enforcement

Seat enforcement happens on membership activation (`status=ACTIVE`):

1. Membership is upserted in a serializable transaction.
2. Active members are counted against `seatLimit`.
3. If the count exceeds `seatLimit`, membership is marked `BLOCKED` locally.
4. An audit event `MEMBERSHIP_BLOCKED_SEAT_LIMIT` is written.
5. The membership is removed in Clerk (best-effort consistency).

## Audit Actions

Tracked actions:

- `ORGANIZATION_CREATED`
- `CONTRACT_UPDATED`
- `OWNER_ASSIGNED`
- `OWNER_TRANSFERRED`
- `MEMBERSHIP_SYNCED`
- `MEMBERSHIP_BLOCKED_SEAT_LIMIT`

Audit entries include actor info (`ADMIN`, `SYSTEM`, `WEBHOOK`) plus optional `before`, `after`, and `metadata`.

## Failure and Compensation

Organization service includes compensation for cross-system writes:

- Create flow: if DB transaction fails after Clerk provisioning, created Clerk resources are cleaned up.
- Update flow: if DB update fails after Clerk org patch/owner membership changes, best-effort rollback is attempted.

## Access Control

Organization management is admin-only. Regular users cannot create organizations.

| Who | Can see "Organization" in sidebar | Can visit `/organization` | Can create orgs |
|-----|----------------------------------|--------------------------|-----------------|
| User with no org membership | No (hidden) | Sees "contact an admin" message | No |
| User in ≥1 org | Yes | Yes — shows their org profile | No |
| Admin | Yes (if also a member) | Yes | Yes — via `/admin/organizations` |

**Sidebar**: `SidebarBottom` reads `user.organizationMemberships` from Clerk and hides the Organization menu item when the array is empty.

**Organization page** (`/organization`): when no active `orgId` is in the session, shows a static message instead of `OrganizationSwitcher`. `OrganizationSwitcher` was intentionally removed because it exposes a "Create organization" button that bypasses admin-only creation.

**Admin creation**: `POST /api/admin/organizations` is the only org creation path. It requires `requireAdmin()` and does a coordinated Clerk + DB dual-write with compensation on failure.

## Known Fragility Points

This feature is the most fragile part of the codebase. Read this section before touching it.

### 1. Dual-Write Consistency (Clerk ↔ DB)

Every write touches both Clerk and the local DB. If Clerk succeeds but the DB fails (or vice versa), the state is inconsistent. The service has compensation logic (`deleteClerkOrganization`, `removeClerkMembership`) but it is **best-effort** — it can also fail. There is no saga/outbox pattern; no retry queue.

**Risk**: Clerk shows an org/member that the DB doesn't know about, so entitlement checks return wrong results.

**Mitigation**: The `GET /api/admin/organizations?sync=1` endpoint backfills from Clerk. Run it if you suspect drift.

### 2. Webhook Ordering and Idempotency

Clerk fires webhook events for membership changes. These arrive out of order and can duplicate. The handler (`handleOrganizationMembershipUpsert`) uses an upsert but does **not** use a deduplication key — replaying a webhook is safe but may log duplicate audit entries.

**Risk**: If webhooks are delayed or lost, the local `organizationMembership` rows are stale. Entitlement checks use the local DB, not Clerk directly.

**Mitigation**: Use `?sync=1` to force re-sync. Monitor webhook delivery in Clerk Dashboard → Webhooks.

### 3. Seat Limit Race Condition

Seat limit enforcement uses a `serializable` transaction that counts active members. Under high concurrency (unlikely but possible), two simultaneous invitations could both pass the seat check before either commits.

**Risk**: Organization ends up with one extra member beyond `seatLimit`.

**Mitigation**: Catch it in the audit log (`MEMBERSHIP_BLOCKED_SEAT_LIMIT`). Re-sync or manually block the extra member.

### 4. Owner Transfer Partial Failure

Transferring ownership requires: (1) removing old owner in Clerk, (2) adding new owner in Clerk, (3) updating DB. If the process fails mid-way, the org may have no owner or two owners in Clerk but only one in the DB.

**Mitigation**: Check `pendingOwnerEmail` on the `Organization` model — a non-null value means a transfer was initiated but may not have completed. Re-run the PATCH request or manually fix in Clerk Dashboard.

### 5. Clerk Organization Deletion

`DELETE /api/admin/organizations/[id]` deletes from Clerk first, then the DB. If DB cleanup fails after Clerk delete, the org is gone from Clerk but orphaned in the DB with no way to sync it back.

**Mitigation**: The error is logged. Run a manual DB cleanup:
```sql
UPDATE "Organization" SET status = 'ARCHIVED' WHERE id = '<id>';
```

### 6. Session orgId Staleness

Clerk sets `orgId` on the session token at login. If a user is added to or removed from an org after login, their `orgId` in `auth()` does not update until they refresh their session (sign out / sign in).

**Risk**: A newly-invited user may see "not part of any org" until they sign out and back in. A removed member may still see the org page for the rest of their session (though entitlement checks use the DB, which will already reflect their removal).

**Mitigation**: Instruct users to sign out and sign back in after org membership changes.

## Operational Runbook

### Checking for Clerk/DB drift
```bash
# Trigger a Clerk → DB re-sync for all orgs
curl -X GET /api/admin/organizations?sync=1 -H "Authorization: Bearer <admin-token>"
```

### Manually unblocking a blocked member
```sql
UPDATE "OrganizationMembership"
SET status = 'ACTIVE'
WHERE "organizationId" = '<org_id>' AND "userId" = '<user_id>';
```

### Checking effective entitlements for a user
```bash
GET /api/usage  # as the target user — returns sources[] showing org vs personal
```

### Finding inconsistencies
```sql
-- Members in DB not in Clerk: run ?sync=1 and compare
-- Orgs with no contract (will fall back to personal limits):
SELECT o.id, o.name FROM "Organization" o
LEFT JOIN "OrganizationContract" c ON c."organizationId" = o.id
WHERE c.id IS NULL AND o.status = 'ACTIVE';
```

## Related Docs

- [API Reference](./api.md)
- [Database](./database.md)
- [Rate Limiting](./rate-limiting.md)
- [Authentication](./authentication.md)
- [Getting Started](./getting-started.md)
