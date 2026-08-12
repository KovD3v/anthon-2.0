# Marketing Typography Hierarchy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish scoped typographic inheritance for the marketing route group and make the homepage hierarchy read clearly as hero, section, card, body, then microcopy.

**Architecture:** Add one `marketing-surface` boundary at the marketing layout and define a small vocabulary of scoped CSS roles in `globals.css`. Apply those roles to the existing homepage markup, keeping component-local classes only for responsive size, color, alignment, and geometry; supporting marketing pages receive only the inheritance fix and the approved small-label legibility floor.

**Tech Stack:** Next.js 16.3 App Router, React 19, TypeScript, Tailwind CSS 4, `next/font`, Vitest, Testing Library, Biome.

## Global Constraints

- Keep Barlow, Barlow Condensed, and Geist Mono as the selected families.
- Do not change marketing copy, claims, labels, calls to action, colors, borders, cards, imagery, icons, section order, alignment, structural spacing, responsive layout, or animation behavior.
- Keep typography outside `src/app/(marketing)/` materially unchanged.
- Keep homepage body copy at least 16px with a line-height of at least 1.5.
- Keep small uppercase labels at least 12px with tracking no wider than `0.16em`, unless a functional constraint is documented beside the exception.
- Preserve the compact interface scale of profile and channels; do not apply homepage display roles to them.
- Read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/layout.md`, `route-groups.md`, and `node_modules/next/dist/docs/01-app/03-api-reference/02-components/font.md` before editing the layout or font integration.
- Use `bun run` and `bunx` commands, preserve unrelated worktree changes, and stage only the files owned by each task.

---

### Task 1: Add the scoped marketing typography contract

**Files:**

- Create: `src/app/(marketing)/layout.test.tsx`
- Modify: `src/app/(marketing)/layout.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**

- Consumes: `--font-barlow`, `--font-barlow-condensed`, and `--font-geist-mono` already attached to `<html>` by `src/app/layout.tsx`.
- Produces: `.marketing-surface`, `.marketing-title-hero`, `.marketing-title-section`, `.marketing-title-card`, `.marketing-lead`, `.marketing-copy`, `.marketing-eyebrow`, `.marketing-label`, and `.marketing-microcopy` for Task 2 and Task 3.

- [ ] **Step 1: Read the relevant local Next.js documentation**

Run:

```bash
sed -n '1,240p' node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/layout.md
sed -n '1,200p' node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route-groups.md
sed -n '556,590p;733,850p;894,940p' node_modules/next/dist/docs/01-app/03-api-reference/02-components/font.md
```

Expected: the docs confirm nested layouts wrap their segment children and that `next/font` variables are activated on an ancestor before being consumed from CSS.

- [ ] **Step 2: Write the failing marketing-layout boundary test**

Create `src/app/(marketing)/layout.test.tsx`:

```tsx
// @vitest-environment jsdom

import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../(marketing)/components/Navbar", () => ({
  Navbar: () => <div data-testid="navbar" />,
}));

import MarketingLayout from "./layout";

describe("MarketingLayout", () => {
  it("scopes the marketing typography contract to its route group", () => {
    const { container } = render(
      <MarketingLayout>
        <p>Contenuto marketing</p>
      </MarketingLayout>,
    );

    expect(
      container.firstElementChild?.classList.contains("marketing-surface"),
    ).toBe(true);
  });
});
```

- [ ] **Step 3: Run the test and verify the contract is missing**

Run:

```bash
bunx vitest run 'src/app/(marketing)/layout.test.tsx'
```

Expected: FAIL because the layout root does not yet contain `marketing-surface`.

- [ ] **Step 4: Add the root class and scoped CSS roles**

In `src/app/(marketing)/layout.tsx`, change only the outer wrapper:

```tsx
<div className="marketing-surface flex min-h-screen flex-col">
```

In the existing `@layer utilities` block in `src/app/globals.css`, add:

```css
.marketing-surface {
  font-family:
    var(--font-barlow), "Barlow Fallback", ui-sans-serif, system-ui, sans-serif;
  line-height: 1.5;
}

.marketing-surface .font-display,
.marketing-surface .marketing-title-hero,
.marketing-surface .marketing-title-section,
.marketing-surface .marketing-title-card {
  font-family:
    var(--font-barlow-condensed), "Barlow Condensed Fallback", ui-sans-serif,
    system-ui, sans-serif;
}

.marketing-surface .font-mono,
.marketing-surface .marketing-eyebrow {
  font-family:
    var(--font-geist-mono), "Geist Mono Fallback", ui-monospace, monospace;
}

.marketing-surface .marketing-title-hero {
  font-weight: 800;
  line-height: 0.88;
  letter-spacing: -0.025em;
  text-transform: uppercase;
}

.marketing-surface .marketing-title-section {
  font-weight: 700;
  line-height: 0.95;
  letter-spacing: -0.025em;
  text-transform: uppercase;
}

.marketing-surface .marketing-title-card {
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.01em;
  text-transform: uppercase;
}

.marketing-surface .marketing-lead,
.marketing-surface .marketing-copy {
  line-height: 1.625;
}

.marketing-surface .marketing-copy {
  font-size: 1rem;
}

.marketing-surface .marketing-eyebrow,
.marketing-surface .marketing-label {
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 1.25;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.marketing-surface .marketing-microcopy {
  font-size: 0.875rem;
  line-height: 1.5;
}
```

Do not change the global `body`, `.font-display`, or Tailwind theme mappings; the new contract must remain inactive outside `.marketing-surface`.

- [ ] **Step 5: Run focused tests and formatting checks**

Run:

```bash
bunx vitest run 'src/app/(marketing)/layout.test.tsx'
bunx biome check 'src/app/(marketing)/layout.tsx' 'src/app/(marketing)/layout.test.tsx' src/app/globals.css
git diff --check -- 'src/app/(marketing)/layout.tsx' 'src/app/(marketing)/layout.test.tsx' src/app/globals.css
```

Expected: all commands pass.

- [ ] **Step 6: Commit the scoped foundation**

```bash
git add -- 'src/app/(marketing)/layout.tsx' 'src/app/(marketing)/layout.test.tsx' src/app/globals.css
git commit -m "refactor(marketing): scope typography foundation"
```

### Task 2: Clarify the homepage hierarchy

**Files:**

- Create: `src/app/(marketing)/components/HomepageTypography.test.tsx`
- Modify: `src/app/(marketing)/components/Hero.test.tsx`
- Modify: `src/app/(marketing)/components/Hero.tsx`
- Modify: `src/app/(marketing)/components/Features.tsx`
- Modify: `src/app/(marketing)/components/HowItWorks.tsx`
- Modify: `src/app/(marketing)/components/Testimonials.tsx`
- Modify: `src/app/(marketing)/components/CTA.tsx`
- Modify: `src/app/(marketing)/components/AnthonScenarioDemo.tsx`

**Interfaces:**

- Consumes: the scoped class names produced by Task 1.
- Produces: one consistent homepage hierarchy with the existing responsive font-size utilities preserved where they encode the current design.

- [ ] **Step 1: Extend the hero test with hierarchy assertions**

In `Hero.test.tsx`, keep the hydration test and add assertions to it:

```tsx
const heading = screen.getByRole("heading", { level: 1 });
expect(heading.getAttribute("data-motion-initial")).not.toBe("hidden");
expect(heading.classList.contains("marketing-title-hero")).toBe(true);

expect(
  screen
    .getByText(/Racconta ad Anthon cosa succede in gara/)
    .classList.contains("marketing-lead"),
).toBe(true);
```

- [ ] **Step 2: Add the failing repeated-level hierarchy test**

Create `HomepageTypography.test.tsx` with a generic motion-element mock, render `Features`, `HowItWorks`, `Testimonials`, and `CTA`, and assert the shared roles:

```tsx
// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("framer-motion", async () => {
  const React = await import("react");
  const motionElement =
    (tag: string) =>
    ({
      children,
      variants: _variants,
      initial: _initial,
      animate: _animate,
      transition: _transition,
      whileInView: _whileInView,
      whileHover: _whileHover,
      viewport: _viewport,
      ...props
    }: {
      children?: React.ReactNode;
      [key: string]: unknown;
    }) => React.createElement(tag, props, children);

  return {
    m: new Proxy(
      {},
      { get: (_target, tag: string) => motionElement(tag) },
    ),
  };
});

import { CTA } from "./CTA";
import { Features } from "./Features";
import { HowItWorks } from "./HowItWorks";
import { Testimonials } from "./Testimonials";

describe("homepage typography hierarchy", () => {
  it("uses one role for repeated heading and copy levels", () => {
    render(
      <>
        <Features />
        <HowItWorks />
        <Testimonials />
        <CTA />
      </>,
    );

    const sectionTitles = [
      "La preparazione mentale entra in campo con te",
      "Come funziona Anthon",
      "Dalla conversazione al campo",
      "Prepara la testa per la prossima gara",
    ];
    for (const title of sectionTitles) {
      expect(
        screen
          .getByRole("heading", { name: title })
          .classList.contains("marketing-title-section"),
      ).toBe(true);
    }

    const cardTitles = [
      "Fiducia costruita in allenamento",
      "Parla con Anthon",
      "Parte dalla situazione reale",
    ];
    for (const title of cardTitles) {
      expect(
        screen
          .getByRole("heading", { name: title })
          .classList.contains("marketing-title-card"),
      ).toBe(true);
    }
  });
});
```

- [ ] **Step 3: Run the tests and verify the semantic roles are absent**

Run:

```bash
bunx vitest run 'src/app/(marketing)/components/Hero.test.tsx' 'src/app/(marketing)/components/HomepageTypography.test.tsx'
```

Expected: FAIL on the new `marketing-title-*` and `marketing-lead` assertions.

- [ ] **Step 4: Apply the roles without changing responsive proportions**

Make these mechanical replacements:

- `Hero.tsx`: add `marketing-title-hero` to the `h1`, remove its duplicated display family, weight, uppercase, leading, and tracking utilities, and add `marketing-lead` to its introduction while retaining `text-lg sm:text-xl`.
- `Features.tsx`: use `marketing-title-section` on the `h2`, `marketing-lead` on the section introduction, `marketing-title-card` on each `h3`, and `marketing-copy` on each card description. Retain `text-4xl sm:text-5xl` on the section title and `text-2xl` on card titles.
- `HowItWorks.tsx`: apply the same section, lead, card, and copy roles. Normalize step titles to `text-2xl`, removing the current `sm:text-3xl` escalation so they remain subordinate to the section title.
- `Testimonials.tsx`: apply the same roles and normalize method titles to `text-2xl`.
- `CTA.tsx`: apply `marketing-title-section` to the heading and `marketing-lead` to the existing `text-xl` description.
- `AnthonScenarioDemo.tsx`: use `marketing-copy` for its two long explanatory paragraphs and `marketing-label` for the two 12px uppercase speaker labels. Keep the sentence-case preview heading and all interface dimensions unchanged.

Do not change any strings, element order, spacing, color, background, border, animation, or motion prop.

- [ ] **Step 5: Run the hierarchy tests and inspect the scoped diff**

Run:

```bash
bunx vitest run 'src/app/(marketing)/components/Hero.test.tsx' 'src/app/(marketing)/components/HomepageTypography.test.tsx'
bunx biome check 'src/app/(marketing)/components/Hero.tsx' 'src/app/(marketing)/components/Hero.test.tsx' 'src/app/(marketing)/components/HomepageTypography.test.tsx' 'src/app/(marketing)/components/Features.tsx' 'src/app/(marketing)/components/HowItWorks.tsx' 'src/app/(marketing)/components/Testimonials.tsx' 'src/app/(marketing)/components/CTA.tsx' 'src/app/(marketing)/components/AnthonScenarioDemo.tsx'
git diff --check -- 'src/app/(marketing)/components'
```

Expected: all commands pass; the diff contains typography classes only.

- [ ] **Step 6: Commit the homepage hierarchy**

```bash
git add -- 'src/app/(marketing)/components/Hero.tsx' 'src/app/(marketing)/components/Hero.test.tsx' 'src/app/(marketing)/components/HomepageTypography.test.tsx' 'src/app/(marketing)/components/Features.tsx' 'src/app/(marketing)/components/HowItWorks.tsx' 'src/app/(marketing)/components/Testimonials.tsx' 'src/app/(marketing)/components/CTA.tsx' 'src/app/(marketing)/components/AnthonScenarioDemo.tsx'
git commit -m "refactor(marketing): clarify homepage typography"
```

### Task 3: Enforce the approved marketing label floor and verify runtime behavior

**Files:**

- Create: `src/app/(marketing)/marketing-typography-policy.test.ts`
- Modify: `src/app/(marketing)/help/page.tsx`
- Modify: `src/app/(marketing)/pricing/page.tsx`
- Modify: `src/app/(marketing)/components/LegalPageLayout.tsx`
- Modify: `src/app/(marketing)/profile/components/CoachingContextSection.tsx`

**Interfaces:**

- Consumes: `.marketing-eyebrow` from Task 1.
- Produces: consistent 12px/`0.16em` technical labels across the remaining marketing surfaces without introducing homepage display scale.

- [ ] **Step 1: Add a failing source-policy regression test**

Create `marketing-typography-policy.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const labelFiles = [
  "src/app/(marketing)/help/page.tsx",
  "src/app/(marketing)/pricing/page.tsx",
  "src/app/(marketing)/components/LegalPageLayout.tsx",
  "src/app/(marketing)/profile/components/CoachingContextSection.tsx",
];

describe("marketing typography policy", () => {
  it("does not use undersized or overtracked technical labels", () => {
    for (const file of labelFiles) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/text-\[(?:0\.65|0\.68)rem\]/);
      expect(source).not.toMatch(/tracking-\[(?:0\.18|0\.2)em\]/);
    }
  });
});
```

This source-level test is intentionally limited to the approved typography policy and must not assert incidental class ordering.

- [ ] **Step 2: Run the policy test and verify existing violations are detected**

Run:

```bash
bunx vitest run 'src/app/(marketing)/marketing-typography-policy.test.ts'
```

Expected: FAIL on the current 0.65/0.68rem labels and 0.18/0.2em tracking.

- [ ] **Step 3: Replace only the violating technical-label combinations**

In help, pricing, and legal components, replace each literal `font-mono` + undersized text + uppercase + overtracking combination with `marketing-eyebrow`, preserving its existing margin and color utilities. In `CoachingContextSection.tsx`, apply `marketing-eyebrow` to the existing memory-type label, again preserving color and layout utilities.

Do not change headings, paragraphs, panels, controls, or layout on these supporting pages.

- [ ] **Step 4: Run policy, focused, and full unit checks**

Run:

```bash
bunx vitest run 'src/app/(marketing)/marketing-typography-policy.test.ts' 'src/app/(marketing)/components/Hero.test.tsx' 'src/app/(marketing)/components/HomepageTypography.test.tsx' 'src/app/(marketing)/layout.test.tsx'
bunx biome check 'src/app/(marketing)' src/app/globals.css
bun run test
git diff --check
```

Expected: all tests and checks pass. If the global Biome check reports only pre-existing unrelated files, rerun the exact changed-file check and record the unrelated failure without editing user-owned files.

- [ ] **Step 5: Run the Impeccable detector once over the finished targets**

Run exactly once after all UI edits:

```bash
node /Users/kovd3v/.agents/skills/impeccable/scripts/detect.mjs --json src/app/globals.css 'src/app/(marketing)/layout.tsx' 'src/app/(marketing)/components/Hero.tsx' 'src/app/(marketing)/components/Features.tsx' 'src/app/(marketing)/components/HowItWorks.tsx' 'src/app/(marketing)/components/Testimonials.tsx' 'src/app/(marketing)/components/CTA.tsx' 'src/app/(marketing)/components/AnthonScenarioDemo.tsx' 'src/app/(marketing)/components/LegalPageLayout.tsx' 'src/app/(marketing)/help/page.tsx' 'src/app/(marketing)/pricing/page.tsx' 'src/app/(marketing)/profile/components/CoachingContextSection.tsx'
```

Expected: no unresolved typography, accessibility, or scope violations relevant to this change.

- [ ] **Step 6: Verify the running Next.js application in one bounded visual pass**

Start or reuse `bun run dev`, then:

1. query `/_next/mcp` for `get_compilation_issues`, `get_routes`, and runtime errors;
2. use the T3 collaborative preview when available, opening it first if closed;
3. inspect `/` at 1440px desktop and 390px mobile in light and dark themes;
4. verify hero wrapping, section-title consistency, card-title subordination, 16px+ body copy, 12px+ labels, and navbar/footer inheritance;
5. spot-check `/pricing`, `/help`, `/terms`, `/privacy`, `/profile`, and `/channels` to confirm base inheritance without homepage display treatment;
6. fix all observed issues in one batch and perform at most one confirmation pass.

Expected: no compilation/runtime errors, no clipped Italian headings, and the intended `hero → section → card → body → microcopy` reading order at both viewports.

- [ ] **Step 7: Commit the supporting legibility fix**

```bash
git add -- src/app/globals.css 'src/app/(marketing)/layout.tsx' 'src/app/(marketing)/layout.test.tsx' 'src/app/(marketing)/marketing-typography-policy.test.ts' 'src/app/(marketing)/help/page.tsx' 'src/app/(marketing)/pricing/page.tsx' 'src/app/(marketing)/components/Hero.tsx' 'src/app/(marketing)/components/Hero.test.tsx' 'src/app/(marketing)/components/HomepageTypography.test.tsx' 'src/app/(marketing)/components/Features.tsx' 'src/app/(marketing)/components/HowItWorks.tsx' 'src/app/(marketing)/components/Testimonials.tsx' 'src/app/(marketing)/components/CTA.tsx' 'src/app/(marketing)/components/AnthonScenarioDemo.tsx' 'src/app/(marketing)/components/LegalPageLayout.tsx' 'src/app/(marketing)/profile/components/CoachingContextSection.tsx'
git commit -m "fix(marketing): refine typography legibility"
```

- [ ] **Step 8: Confirm repository scope and final evidence**

Run:

```bash
git status --short --branch
git log -4 --oneline
```

Expected: the three implementation commits contain only the planned marketing typography and test files; unrelated AI and plan-catalog changes remain uncommitted and untouched.
