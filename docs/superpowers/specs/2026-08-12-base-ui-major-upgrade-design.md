# Base UI and UI-stack major upgrade design

## Goal

Replace Radix UI with Base UI as the primitive layer underneath Anthon's
shadcn components, update the UI and animation stack through current major
versions, and remove obsolete UI dependencies without changing the product's
visual identity or public component contracts.

## Scope

This migration covers:

- the shadcn configuration in `components.json`;
- primitive-backed components under `src/components/ui/`;
- application call sites affected by Base UI API differences;
- UI, charting, icon, theme, toast, styling, and animation dependencies;
- obsolete UI dependencies and source files identified by static analysis;
- regression tests and runtime verification for affected interaction flows.

It does not redesign Anthon, rewrite unrelated application components, update
backend-only major dependencies, or adopt AI Elements.

## Chosen direction

Configure shadcn for the Base UI-backed `base-nova` family, then use the
generated Base UI variants as implementation references rather than blindly
overwriting the repository's customized components. Preserve Anthon's existing
semantic tokens, dimensions, variants, focus treatment, motion curves, dark
mode, responsive behavior, and Italian product copy.

The local wrappers remain the compatibility boundary. Existing imports such as
`@/components/ui/dialog` and their exported component names should continue to
work unless Base UI makes an exact compatibility adapter unsafe. Any necessary
consumer change must be narrow and included in the same migration.

## Component migration

Migrate every Radix-backed wrapper currently used by the application:

- accordion;
- alert dialog and confirm dialog;
- button and badge composition;
- checkbox;
- dialog and sheet;
- dropdown menu;
- label;
- popover;
- progress;
- scroll area;
- select;
- separator;
- slider;
- switch;
- tabs;
- tooltip.

For each wrapper, compare the existing API with the current shadcn Base UI
registry implementation. Adapt composition, portals, positioning, state data
attributes, event callbacks, and ref behavior deliberately. Preserve existing
class names where they encode Anthon-specific visual or motion decisions.

The completed source tree must contain no production import from `radix-ui` or
`@radix-ui/*`, and the corresponding dependencies must be removed.

## Dependency policy

Update the UI stack to the newest compatible releases available during
implementation, including major releases where applicable:

- Base UI and shadcn-generated dependencies;
- Framer Motion;
- Lucide React;
- Tailwind CSS and its PostCSS adapter;
- Recharts;
- Sonner;
- `cnfast`;
- closely coupled UI utilities required by the migrated components.

Exact versions are resolved once at implementation time and committed through
`package.json` and `bun.lock`. Major updates outside the UI boundary, including
TypeScript, PDF parsing, test DOM, and backend integration packages, remain out
of scope unless a UI upgrade cannot install or compile without a tightly scoped
compatibility update.

Remove `tw-animate-css` if no migrated component uses its utilities. Remove
`@tanstack/react-virtual` and the unused
`src/app/(chat)/components/hooks/useMessageVirtualizer.ts` only after confirming
there are no runtime or test imports. Preserve any dependency that static
analysis incorrectly identifies as unused.

## Motion contract

Keep `src/lib/motion.ts` as the source of truth for durations, easing curves,
and shared variants. Preserve `LazyMotion`, user-preference reduced motion,
compositor-friendly transforms, trigger-relative origins for floating UI, and
the existing ban on broad `transition-all` usage in live application code.

The Base UI migration must map its state attributes and transform-origin
variables into these existing treatments. Framer Motion's major upgrade may
change imports or types, but it must not introduce a second animation system or
change the perceived timing of chat interactions.

## Compatibility and accessibility

The migrated components must retain:

- keyboard navigation and expected arrow-key behavior;
- focus trapping and focus restoration for modal surfaces;
- Escape and outside-interaction dismissal where currently supported;
- accessible names, descriptions, validation state, and checked/selected state;
- portal layering and collision-aware positioning;
- touch behavior and 44-pixel targets where already provided;
- light and dark themes;
- reduced-motion alternatives that preserve useful opacity and color feedback.

Base UI event semantics differ from Radix. Consumers must be updated to Base
UI's supported event model rather than emulating Radix internals with fragile
DOM workarounds.

## Test strategy

Use test-driven migration for behavior changes. Before replacing a primitive,
add or extend a focused test that captures a user-observable contract and
confirm it fails against the incompatible intermediate state or explicit
dependency boundary. Avoid source-text-only tests except for repository policy
contracts such as the absence of forbidden imports.

Automated verification includes:

1. focused component tests for dialog, alert dialog, menu, select, checkbox,
   switch, slider, tabs, tooltip, and sheet behavior;
2. the existing motion contract tests;
3. TypeScript type checking;
4. Biome checks;
5. the full unit suite;
6. Knip after intentional dead-code removal;
7. a production build when the environment permits it.

Runtime verification uses the running Next.js application and checks affected
flows on desktop and mobile: chat sidebar/account menu, chat composer dialogs,
marketing mobile navigation, profile controls, admin menus/forms, toast
placement, and admin charts. Test keyboard focus and reduced motion in addition
to pointer interaction.

## Delivery and rollback

Perform the work as one coherent migration, but keep the diff organized into
configuration/dependencies, primitive wrappers, consumers, and cleanup so a
failure can be localized. Do not leave a mixed Radix/Base UI state at delivery.

Commit only after all required verification is fresh. Use a conventional commit
message and preserve unrelated user work. A failed major upgrade is rolled back
within the working diff to the last verified package set rather than weakening
types, tests, accessibility, or production behavior.

## Acceptance criteria

- `components.json` identifies a Base UI-backed shadcn style.
- All active shadcn primitives use Base UI; Radix packages and imports are gone.
- UI/animation packages are upgraded through the agreed major versions where
  compatible with the application.
- Obsolete dependencies and confirmed dead UI source are removed.
- Anthon's visual identity, component import surface, motion character, theme,
  and responsive layouts remain materially unchanged.
- Affected pointer, keyboard, focus, dismissal, selection, and reduced-motion
  behaviors pass automated and runtime verification.
- Lint, typecheck, unit tests, dependency analysis, and build gates pass, or any
  environment-only unavailable gate is reported precisely with the completed
  substitute evidence.
