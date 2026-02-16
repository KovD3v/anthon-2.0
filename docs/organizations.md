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
- If active org memberships with contracts exist, organization contract entitlements are used.
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

## Related Docs

- [API Reference](./api.md)
- [Database](./database.md)
- [Rate Limiting](./rate-limiting.md)
- [Authentication](./authentication.md)
- [Getting Started](./getting-started.md)
