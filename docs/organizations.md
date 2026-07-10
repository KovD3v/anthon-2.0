# Organizations

This document describes the current organization (B2B) data model, Clerk synchronization, contract policies, and operational failure modes.

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
- If active memberships with contracts exist, those contracts are added as candidates alongside the personal source.
- The strongest candidate across personal and organization sources is selected using model tier first, then the numeric limit vector.
- If memberships exist but no valid organization contract is found, the personal source is returned with fallback metadata.

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
| `GET /api/admin/organizations` | List organizations and active seat usage; `?sync=1` backfills organization metadata only. |
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
- Backfill organization name/slug/status metadata from Clerk via `sync=1`.
- Review audit events from the integrated audit panel.

## Webhook Sync

`/api/webhooks/clerk` handles:

- `organization.created`, `organization.updated`, `organization.deleted`
- `organizationMembership.created`, `organizationMembership.updated`, `organizationMembership.deleted`
- `organization_membership.*` aliases
- `organizationInvitation.accepted`, `organization_invitation.accepted`

Sync behavior:

- Organization create/update events update an existing local organization; they do not create a missing local row or contract. Delete events mark an existing row `ARCHIVED`.
- `GET /api/admin/organizations?sync=1` is the metadata-only backfill for missing/existing organization rows. It does not fetch contracts or memberships.
- Membership events upsert local role/status and write audit events only when the local organization and contract already exist; otherwise they are skipped.
- Invitation accepted waits for a real membership ID before syncing activation.

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

This feature coordinates two systems and deserves careful failure handling. Read this section before changing it.

### 1. Dual-Write Consistency (Clerk ↔ DB)

Provisioning, Clerk metadata changes, and owner/membership operations touch both Clerk and the local DB. Contract-only/status-only patches and webhook persistence can be local-only. When a coordinated write fails between systems, compensation (`deleteClerkOrganization`, `removeClerkMembership`, or role repair) is best-effort; there is no saga/outbox pattern or durable retry queue.

**Risk**: Clerk shows an org/member that the DB doesn't know about, so entitlement checks return wrong results.

**Mitigation**: `GET /api/admin/organizations?sync=1` can backfill organization metadata only. Compare contracts and memberships separately against Clerk and repair them through the supported admin/Clerk flows.

### 2. Webhook Ordering and Idempotency

Clerk fires webhook events for membership changes. These arrive out of order and can duplicate. The handler (`handleOrganizationMembershipUpsert`) uses an upsert but does **not** use a deduplication key — replaying a webhook is safe but may log duplicate audit entries.

**Risk**: If webhooks are delayed or lost, the local `organizationMembership` rows are stale. Entitlement checks use the local DB, not Clerk directly.

**Mitigation**: Monitor and replay the relevant webhook from Clerk when possible, then compare membership rows manually. `?sync=1` does not synchronize memberships or contracts.

### 3. Seat Enforcement Failure Modes

Seat activation uses a serializable transaction and retries serialization failures up to three times. If the limit is exceeded, the local membership is marked `BLOCKED` and the Clerk membership is removed afterward.

**Risk**: Exhausted/failed synchronization can leave a Clerk membership with no matching local state. A failure while removing an over-seat Clerk membership leaves it blocked locally but still present in Clerk.

**Mitigation**: Inspect webhook errors and the `MEMBERSHIP_BLOCKED_SEAT_LIMIT` audit event, repair the Clerk membership first, then replay/synchronize the event. Do not activate a blocked row only in SQL.

### 4. Owner Transfer Partial Failure

For an existing target user, transfer adds/promotes the new Clerk owner first, commits the local owner/membership transaction, then best-effort demotes the previous Clerk owner.

**Risk**: If the final demotion fails, Clerk can show two owners while the database has one. The separate unknown-user invitation flow sets `pendingOwnerEmail`; that field is not a failure marker for an existing-user transfer.

**Mitigation**: Compare Clerk owner roles with `ownerUserId` and the local `OWNER` membership, then demote/repair the stale Clerk role before retrying another transfer.

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

### Checking organization metadata drift

Use the sync action in `/admin/organizations` (or an authenticated `GET /api/admin/organizations?sync=1`) to backfill names, slugs, status, and missing organization rows. It does not synchronize contracts or memberships.

### Restoring a blocked member

1. Confirm the contract has seat capacity.
2. Re-invite or recreate the membership in Clerk; the over-seat flow may already have removed it there.
3. Let the membership webhook recreate/synchronize the local row.
4. Verify the local status and audit log. Do not set the local row to `ACTIVE` without restoring the Clerk membership.

### Checking effective entitlements for a user
```bash
GET /api/usage  # as the target user — returns sources[] showing org vs personal
```

### Finding inconsistencies
```sql
-- Compare local memberships with Clerk manually; ?sync=1 does not fetch them.
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
