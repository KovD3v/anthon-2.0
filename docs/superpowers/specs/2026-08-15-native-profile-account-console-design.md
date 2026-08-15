# Native profile account console

## Goal

Replace the Clerk `<UserProfile />` surface at `/profile` with a fully native
Anthon account console. Clerk remains the identity and session engine, but no
Clerk prebuilt UI or Clerk appearance configuration is rendered in the route.

## Scope

The replacement covers the functionality currently exposed by the first Clerk
block: profile identity and avatar, email addresses and verification, password
and security status, active sessions, connected accounts, and the destructive
account action. The same native profile block also owns the Anthon-specific
response preferences, usage summary, and coaching-context/memory controls. The
preference toggles move into that block, and the existing coaching-context
surface is composed into the `Profilo` tab rather than duplicated. The page
has one unambiguous account-deletion surface.

There are no schema changes and no new application API routes. Account
mutations use Clerk's client resources (`useUser`, `useClerk`, and session
resources); account deletion continues through `/api/user/me` so Clerk, the
application database, and private blobs are removed by the existing server-side
flow.

## Information architecture

The first block becomes one responsive account console:

- A branded identity header shows avatar, name, primary email, verification
  status, and the profile-edit action.
- A compact internal tab bar switches between `Profilo`, `Anthon`, `Sicurezza`,
  `Sessioni` and `Account collegati` without leaving `/profile`.
- `Profilo` owns name, username when enabled, avatar upload/removal, email list,
  add-email, verification, usage summary, memory review, and the danger zone.
- `Anthon` owns response tone, response style, language, voice delivery, and
  technical-response details. These controls use the existing preferences API.
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
child component so profile, Anthon preferences, security, sessions, and
connected-account states can be tested independently. The `Profilo` tab
composes the existing `UsageSection` and `CoachingContextSection`; usage stays
backed by `/api/usage`, memory management stays backed by the existing
`/api/coaching-context` endpoints, and no second persistence model is added.
Draft form values are initialized from the Clerk or application resource and
are not discarded when a mutation fails. Mutations expose loading, disabled,
success, and recoverable error states through inline status and existing Sonner
toasts. All interactive controls have labels, keyboard focus, and touch
targets at least 44px where the existing primitives support it.

## Verification

Add component tests that assert the Clerk prebuilt component is no longer
rendered, that the native sections and tab order are present, and that success
and failure paths call the expected Clerk resource or existing application API.
Cover profile/email/security mutations, account deletion, preferences, usage,
and the existing memory editing/deletion surface inside the profile tab. Run
focused profile tests, targeted Biome, the UI detector, and a runtime
desktop/mobile pass when the authenticated dev preview is available.
