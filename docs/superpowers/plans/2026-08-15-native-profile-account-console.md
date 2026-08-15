# Native Profile Account Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Replace the Clerk UserProfile surface with a native Anthon account console that keeps identity/security flows custom while bringing Anthon preferences, usage, coaching context, memory controls, and account deletion into the Profile tab.

**Architecture:** ProfileClient becomes a route shell that renders one AccountConsole. The console owns the native tab rail and composes focused sections: Profilo contains Clerk identity data, usage, coaching context/memories, and the danger zone; Anthon contains persisted response preferences; Sicurezza, Sessioni, and Account collegati use Clerk headless resources. Existing application endpoints remain the source of truth for usage, preferences, coaching context, memories, and deletion.

**Tech Stack:** Next.js 16 App Router, React, TypeScript, Clerk React resources, Tailwind CSS v4, existing shadcn/Base UI primitives, Vitest, Testing Library, Biome.

## Global Constraints

- Do not render UserProfile or any other Clerk prebuilt profile UI in the route.
- Do not retain Clerk appearance configuration or a Clerk-specific CSS layer for this surface.
- Clerk remains the identity/session engine; application data stays on the existing API endpoints.
- Do not add schema changes, new API routes, dependencies, or a second memory persistence model.
- Keep /api/user/me, /api/usage, /api/preferences, and /api/coaching-context as the existing data boundaries.
- Keep the current Anthon warm-neutral palette, Barlow/Barlow Condensed typography, focus rings, and existing UI primitives.
- Keep all controls keyboard accessible, labelled, and at least 44px where the existing primitives support it.
- Do not expose push until a real end-to-end notification behavior exists; it remains persisted but is not part of this UI.
- Preserve unrelated worktree changes and stage only profile files, tests, the spec/plan when intentionally committed.
- Prefer bun run and bunx; use Biome rather than ESLint or Prettier.

---

### Task 1: Replace the Clerk surface with the native console shell

**Files:**
- Create: src/app/(marketing)/profile/components/AccountConsole.tsx
- Create: src/app/(marketing)/profile/components/AccountConsole.test.tsx
- Create: src/app/(marketing)/profile/components/ProfileIdentitySection.tsx
- Create: src/app/(marketing)/profile/components/DangerZoneSection.tsx
- Modify: src/app/(marketing)/profile/[[...rest]]/profile-client.tsx
- Modify: src/app/(marketing)/profile/[[...rest]]/profile-client.test.tsx
- Modify: src/app/(marketing)/profile/components/PreferencesSection.tsx
- Modify: src/app/globals.css

**Interfaces:**
- AccountConsole consumes useUser and the existing application sections; DangerZoneSection consumes useClerk for sign-out.
- ProfileIdentitySection consumes the loaded Clerk UserResource.
- DangerZoneSection calls DELETE /api/user/me, then signOut({ redirectUrl: "/" }).
- Tasks 3 and 4 extend the shell with the Security, Sessions, and Connected Accounts panels without changing its tab values: profile, anthon, security, sessions, connected.

- [ ] **Step 1: Write the failing shell and route tests**

Replace the Clerk mock in profile-client.test.tsx with an AccountConsole mock and assert that the route renders the native account region, the usage section, the Anthon settings section, and the coaching context in document order. Add an assertion that no element with the former Clerk profile label is rendered.

Create AccountConsole.test.tsx with mocked child sections and assert:

~~~tsx
render(<AccountConsole />);

expect(screen.getByRole("tab", { name: "Profilo" })).toBeTruthy();
expect(screen.getByRole("tab", { name: "Anthon" })).toBeTruthy();
expect(screen.getByRole("tab", { name: "Sicurezza" })).toBeTruthy();
expect(screen.getByRole("tab", { name: "Sessioni" })).toBeTruthy();
expect(screen.getByRole("tab", { name: "Account collegati" })).toBeTruthy();
expect(screen.getByRole("region", { name: "Profilo account" })).toBeTruthy();
expect(screen.queryByLabelText("Profilo Clerk")).toBeNull();
~~~

- [ ] **Step 2: Run the focused tests to verify the current implementation fails**

Run:

~~~bash
bunx vitest run 'src/app/(marketing)/profile/[[...rest]]/profile-client.test.tsx' 'src/app/(marketing)/profile/components/AccountConsole.test.tsx'
~~~

Expected: the route test still finds the Clerk mock and the new shell test cannot find the native tab rail.

- [ ] **Step 3: Implement the native shell and identity surface**

Remove UserProfile, clerkProfileAppearance, the Clerk-only profile section, and the standalone user-ID card from ProfileClient. Render only AccountConsole before the route-level content.

Implement AccountConsole with the existing Tabs, TabsList, TabsTrigger, and TabsContent primitives. The panel composition is:

~~~tsx
<Tabs defaultValue="profile">
  <TabsList aria-label="Sezioni del profilo" variant="line">
    <TabsTrigger value="profile">Profilo</TabsTrigger>
    <TabsTrigger value="anthon">Anthon</TabsTrigger>
    <TabsTrigger value="security">Sicurezza</TabsTrigger>
    <TabsTrigger value="sessions">Sessioni</TabsTrigger>
    <TabsTrigger value="connected">Account collegati</TabsTrigger>
  </TabsList>
  <TabsContent value="profile" aria-label="Profilo account">
    <ProfileIdentitySection user={user} />
    <UsageSection />
    <CoachingContextSection />
    <DangerZoneSection />
  </TabsContent>
  <TabsContent value="anthon" aria-label="Impostazioni Anthon">
    <PreferencesSection />
  </TabsContent>
</Tabs>
~~~

During this first task, the three unimplemented panels must render real labelled native states, not blank panels: use a small Card explaining that the panel is being connected to the available Clerk resources. Tasks 3 and 4 replace those states before completion.

ProfileIdentitySection must render:

- avatar image with initials fallback;
- first name and last name form fields;
- username field only when user.username is not null;
- verified primary email and Clerk user ID;
- an explicit save action calling user.update({ firstName, lastName, username? });
- avatar file input calling user.setProfileImage({ file }) and a remove action calling user.setProfileImage({ file: null }).

Keep drafts after failures, disable only the active mutation, refresh the local Clerk resource after success, and show success/error feedback through the existing Sonner pattern.

DangerZoneSection must own the existing deletion flow and confirmation dialog. Move the delete state, useClerk, router, and ConfirmDialog out of PreferencesSection; the preference card must render only product controls.

Remove the obsolete Clerk layer declaration from globals.css if it is no longer used by any source file.

- [ ] **Step 4: Run tests and targeted formatting**

Run:

~~~bash
bunx vitest run 'src/app/(marketing)/profile/[[...rest]]/profile-client.test.tsx' 'src/app/(marketing)/profile/components/AccountConsole.test.tsx' 'src/app/(marketing)/profile/components/PreferencesSection.test.tsx'
bunx biome check 'src/app/(marketing)/profile' src/app/globals.css
~~~

Expected: all focused tests pass and the files pass Biome.

- [ ] **Step 5: Commit the shell as an independently reviewable change**

~~~bash
git add -- 'src/app/(marketing)/profile/[[...rest]]/profile-client.tsx' 'src/app/(marketing)/profile/[[...rest]]/profile-client.test.tsx' 'src/app/(marketing)/profile/components/AccountConsole.tsx' 'src/app/(marketing)/profile/components/AccountConsole.test.tsx' 'src/app/(marketing)/profile/components/ProfileIdentitySection.tsx' 'src/app/(marketing)/profile/components/DangerZoneSection.tsx' 'src/app/(marketing)/profile/components/PreferencesSection.tsx' 'src/app/globals.css'
git commit -m "feat(profile): replace Clerk profile surface"
~~~

---

### Task 2: Make the Anthon tab carry real response preferences

**Files:**
- Modify: src/app/(marketing)/profile/components/PreferencesSection.tsx
- Modify: src/app/(marketing)/profile/components/PreferencesSection.test.tsx
- Reference only: src/app/api/preferences/route.ts, src/lib/ai/orchestrator.ts

**Interfaces:**
- The component keeps its existing GET /api/preferences and PATCH /api/preferences boundary.
- Persisted fields exposed here are tone, mode, language, voiceEnabled, and showTechnicalMetrics.
- push remains out of the UI.

- [ ] **Step 1: Add failing tests for the missing product controls**

Extend the existing test fixture and assert that loaded preferences render:

~~~tsx
expect(screen.getByLabelText("Tono di Anthon")).toBeTruthy();
expect(screen.getByLabelText("Stile delle risposte")).toBeTruthy();
expect(screen.getByLabelText("Lingua delle risposte")).toBeTruthy();
~~~

Select a new tone and assert the exact request:

~~~tsx
fireEvent.change(screen.getByLabelText("Tono di Anthon"), {
  target: { value: "direct" },
});

await waitFor(() =>
  expect(fetchMock).toHaveBeenLastCalledWith("/api/preferences", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tone: "direct" }),
  }),
);
~~~

Keep the existing tests that prove technical metrics stay disabled after a load failure.

- [ ] **Step 2: Run the preference tests to verify the new assertions fail**

Run:

~~~bash
bunx vitest run 'src/app/(marketing)/profile/components/PreferencesSection.test.tsx'
~~~

Expected: the new controls are not found because the current card exposes only audio and technical metrics.

- [ ] **Step 3: Implement the Anthon settings card**

Add labelled native selects using the existing Anthon input styling:

- tone options: direct, empathetic, technical, motivational;
- response style options: concise, elaborate, challenging, supportive;
- language options: it, en, with the current stored value normalized for display.

Each select must use the same guarded update function as the existing switches, preserve the current state on a non-2xx or network failure, disable while a request is active, and show the existing success/error toast. Use human Italian labels and descriptions rather than exposing database field names.

Keep the existing audio and technical metrics controls. Change the card heading/copy to make clear that these controls affect how Anthon responds.

- [ ] **Step 4: Run tests and formatting**

Run:

~~~bash
bunx vitest run 'src/app/(marketing)/profile/components/PreferencesSection.test.tsx'
bunx biome check 'src/app/(marketing)/profile/components/PreferencesSection.tsx' 'src/app/(marketing)/profile/components/PreferencesSection.test.tsx'
~~~

Expected: all preference tests pass.

- [ ] **Step 5: Commit the Anthon settings change**

~~~bash
git add -- 'src/app/(marketing)/profile/components/PreferencesSection.tsx' 'src/app/(marketing)/profile/components/PreferencesSection.test.tsx'
git commit -m "feat(profile): expose Anthon response preferences"
~~~

---

### Task 3: Replace the security panel with native password and factor controls

**Files:**
- Create: src/app/(marketing)/profile/components/SecuritySection.tsx
- Create: src/app/(marketing)/profile/components/SecuritySection.test.tsx
- Modify: src/app/(marketing)/profile/components/AccountConsole.tsx

**Interfaces:**
- Consume useUser and the typed UserResource methods updatePassword, createPasskey, passkeys, totpEnabled, backupCodeEnabled, and twoFactorEnabled.
- Do not call a Clerk prebuilt component.
- Password mutation uses user.updatePassword({ currentPassword, newPassword, signOutOfOtherSessions }).

- [ ] **Step 1: Write failing security tests**

Mock a user with passwordEnabled true, one passkey, and inactive TOTP. Assert the password form, factor status rows, and passkey action render. Submit mismatched confirmation and assert no Clerk mutation is called. Submit valid data and assert:

~~~tsx
expect(user.updatePassword).toHaveBeenCalledWith({
  currentPassword: "old-password",
  newPassword: "new-password",
  signOutOfOtherSessions: true,
});
~~~

Also assert that a rejected password update keeps the form values and renders an error state.

- [ ] **Step 2: Run the security tests to verify failure**

Run:

~~~bash
bunx vitest run 'src/app/(marketing)/profile/components/SecuritySection.test.tsx'
~~~

Expected: the file/component does not exist yet.

- [ ] **Step 3: Implement the security section**

Render three native cards:

1. Password: current password when required, new password, confirmation, and a checkbox for revoking other sessions. Validate non-empty new password and equality before calling Clerk.
2. Two-step verification: status from twoFactorEnabled/totpEnabled and backup-code status. If TOTP is available, provide the supported setup path using createTOTP(), show the returned secret/URI as a setup state, accept a six-digit code, and call verifyTOTP({ code }); do not claim activation before verification succeeds.
3. Passkeys: list existing passkeys with last-used date, create with createPasskey(), and delete through the passkey resource after explicit confirmation.

The UI must distinguish unavailable Clerk capabilities from inactive security settings and show recoverable inline errors.

- [ ] **Step 4: Connect the security tab and verify**

Replace the shell's temporary security content with SecuritySection, then run:

~~~bash
bunx vitest run 'src/app/(marketing)/profile/components/SecuritySection.test.tsx' 'src/app/(marketing)/profile/components/AccountConsole.test.tsx'
bunx biome check 'src/app/(marketing)/profile/components/SecuritySection.tsx' 'src/app/(marketing)/profile/components/SecuritySection.test.tsx' 'src/app/(marketing)/profile/components/AccountConsole.tsx'
~~~

Expected: security mutation tests and tab rendering pass.

- [ ] **Step 5: Commit the security panel**

~~~bash
git add -- 'src/app/(marketing)/profile/components/SecuritySection.tsx' 'src/app/(marketing)/profile/components/SecuritySection.test.tsx' 'src/app/(marketing)/profile/components/AccountConsole.tsx' 'src/app/(marketing)/profile/components/AccountConsole.test.tsx'
git commit -m "feat(profile): add native security controls"
~~~

---

### Task 4: Add native sessions and connected-account panels

**Files:**
- Create: src/app/(marketing)/profile/components/SessionsSection.tsx
- Create: src/app/(marketing)/profile/components/SessionsSection.test.tsx
- Create: src/app/(marketing)/profile/components/ConnectedAccountsSection.tsx
- Create: src/app/(marketing)/profile/components/ConnectedAccountsSection.test.tsx
- Modify: src/app/(marketing)/profile/components/AccountConsole.tsx

**Interfaces:**
- Sessions use user.getSessions() and the current useSession() resource to identify the current session.
- A session row consumes SessionWithActivitiesResource fields id, status, lastActiveAt, and latestActivity; non-current rows call session.revoke().
- Connected accounts consume user.externalAccounts; removal calls externalAccount.destroy().

- [ ] **Step 1: Write failing tests for session loading/revocation and provider removal**

For sessions, resolve two active resources, mark one as current, assert device/browser labels, and assert that revoking the other session calls only that resource's revoke.

For connected accounts, render Google and Apple resources, click the removal action, confirm it, and assert that only the selected resource's destroy is called. Assert a rejected mutation leaves the row and shows an error.

- [ ] **Step 2: Run the tests to verify failure**

Run:

~~~bash
bunx vitest run 'src/app/(marketing)/profile/components/SessionsSection.test.tsx' 'src/app/(marketing)/profile/components/ConnectedAccountsSection.test.tsx'
~~~

Expected: the new components do not exist.

- [ ] **Step 3: Implement sessions**

Load sessions on mount with an active guard, show a labelled loading state and retry action, format dates with Intl.DateTimeFormat using it-IT, and show the current session with a non-destructive “Questa sessione” badge. Each other active session gets a 44px revoke button and confirmation dialog. After revocation remove the row locally; on failure retain it.

- [ ] **Step 4: Implement connected accounts**

Render provider title, provider email, verification status, and a removal action only when the external account can be destroyed. Keep the list stable after a failed removal. If no accounts exist, show a useful empty state explaining that providers can be connected during sign-in; do not invent a redirect callback flow in this task.

- [ ] **Step 5: Connect both tabs and verify**

Replace the two temporary tab panels, then run:

~~~bash
bunx vitest run 'src/app/(marketing)/profile/components/SessionsSection.test.tsx' 'src/app/(marketing)/profile/components/ConnectedAccountsSection.test.tsx' 'src/app/(marketing)/profile/components/AccountConsole.test.tsx'
bunx biome check 'src/app/(marketing)/profile/components/SessionsSection.tsx' 'src/app/(marketing)/profile/components/SessionsSection.test.tsx' 'src/app/(marketing)/profile/components/ConnectedAccountsSection.tsx' 'src/app/(marketing)/profile/components/ConnectedAccountsSection.test.tsx' 'src/app/(marketing)/profile/components/AccountConsole.tsx'
~~~

Expected: all session/provider tests pass and the tab rail renders five working panels.

- [ ] **Step 6: Commit sessions and connected accounts**

~~~bash
git add -- 'src/app/(marketing)/profile/components/SessionsSection.tsx' 'src/app/(marketing)/profile/components/SessionsSection.test.tsx' 'src/app/(marketing)/profile/components/ConnectedAccountsSection.tsx' 'src/app/(marketing)/profile/components/ConnectedAccountsSection.test.tsx' 'src/app/(marketing)/profile/components/AccountConsole.tsx' 'src/app/(marketing)/profile/components/AccountConsole.test.tsx'
git commit -m "feat(profile): add native session and provider controls"
~~~

---

### Task 5: Verify the complete profile surface in tests and the running app

**Files:**
- Modify only files required by the verification findings.
- Test: all files under src/app/(marketing)/profile.

**Interfaces:**
- No new product behavior is introduced in this task; it proves the integrated route and correct boundaries.

- [ ] **Step 1: Add integration-level component assertions**

Extend AccountConsole.test.tsx to assert:

- the default Profile tab includes Utilizzo, Cosa sa Anthon di te, Memorie, and Zona pericolosa;
- the Anthon tab includes the five product controls;
- tab switching hides the previous panel and exposes the selected panel;
- the delete action calls /api/user/me only after confirmation;
- no UserProfile import or rendered Clerk profile marker exists.

- [ ] **Step 2: Run the focused profile test suite and static checks**

Run:

~~~bash
bunx vitest run 'src/app/(marketing)/profile'
bunx biome check 'src/app/(marketing)/profile' src/app/globals.css
node /Users/kovd3v/.agents/skills/impeccable/scripts/detect.mjs --json 'src/app/(marketing)/profile' src/app/globals.css
git diff --check
~~~

Expected: focused tests pass, Biome is clean, the detector returns no findings, and the diff has no whitespace errors.

- [ ] **Step 3: Run the existing project checks and classify unrelated failures**

Run:

~~~bash
bun run lint
bun run test
bun run typecheck
~~~

If a check fails in the already modified AI-routing files, report the exact file/error and keep it separate from profile verification; do not alter those unrelated files.

- [ ] **Step 4: Verify the authenticated route in the T3 preview**

Use the existing T3 preview workflow: check preview status, open it if needed, navigate to /profile, and inspect the running DOM at desktop and mobile widths. If authentication is unavailable, record that the route redirects to sign-in and retain the component/test evidence; do not weaken auth to obtain a screenshot.

Verify:

- no Clerk visual surface appears;
- the Anthon tab rail is keyboard navigable and horizontally usable on mobile;
- Profile shows usage, coaching context/memory, and danger zone;
- controls expose loading, disabled, success, and error feedback;
- no horizontal overflow is introduced.

- [ ] **Step 5: Commit verification-only fixes**

~~~bash
git status --short
git add -- <only profile files changed by verification>
git commit -m "test(profile): verify native account console"
~~~

Do not stage or commit unrelated AI-routing, schema, admin, or documentation changes.
