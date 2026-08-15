# Native profile account console

## Goal

Replace the Clerk `<UserProfile />` surface at `/profile` with a fully native
Anthon account console. Clerk remains the identity and session engine, but no
Clerk prebuilt UI or Clerk appearance configuration is rendered in the route.

## Scope

The replacement covers the functionality currently exposed by the first Clerk
block: profile identity and avatar, email addresses and verification, password
and security status, active sessions, connected accounts, and the destructive
account action. Usage and coaching context remain separate. The preference
toggles remain in their existing section, while its current danger zone moves
into this account console so the page has one unambiguous account-deletion
surface.

There are no schema changes and no new application API routes. Account
mutations use Clerk's client resources (`useUser`, `useClerk`, and session
resources); account deletion continues through `/api/user/me` so Clerk, the
application database, and private blobs are removed by the existing server-side
flow.

## Information architecture

The first block becomes one responsive account console:

- A branded identity header shows avatar, name, primary email, verification
  status, and the profile-edit action.
- A compact internal tab bar switches between `Profilo`, `Sicurezza`, `Sessioni`
  and `Account collegati` without leaving `/profile`.
- `Profilo` owns name, username when enabled, avatar upload/removal, email list,
  add-email, and verification.
- `Sicurezza` owns password update and the available two-factor/passkey status,
  exposing only controls supported by the current Clerk instance.
- `Sessioni` lists active devices and allows revoking sessions other than the
  current one.
- `Account collegati` lists connected providers and allows removing a provider
  only when Clerk permits it.
- The danger zone stays visually separate at the bottom and requires explicit
  confirmation before calling the existing deletion endpoint.

Desktop uses a horizontal tab rail and a single readable panel; mobile turns the
rail into a horizontally scrollable, keyboard-accessible tab list and stacks
the panel content. The page keeps Anthon's warm neutral surfaces, yellow
primary accent, Barlow/Barlow Condensed hierarchy, restrained borders, and
existing focus-ring behavior.

## Data and state

`AccountConsole` owns the active tab and mutation state. Each tab gets a focused
child component so profile, security, sessions, and connected-account states
can be tested independently. Draft form values are initialized from the Clerk
resource and are not discarded when a mutation fails. Mutations expose loading,
disabled, success, and recoverable error states through inline status and
existing Sonner toasts. All interactive controls have labels, keyboard focus,
and touch targets at least 44px where the existing primitives support it.

## Verification

Add component tests that assert the Clerk prebuilt component is no longer
rendered, that the native sections and tab order are present, and that success
and failure paths call the expected Clerk resource or existing application API.
Run focused profile tests (including the preference-section extraction),
targeted Biome, the UI detector, and a runtime desktop/mobile pass when the
authenticated dev preview is available.
