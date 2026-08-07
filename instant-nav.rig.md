# instant-nav rig: Anthon 2.0

- BUILD: `EXPOSE_TESTING_API=1 bun run build`, served with `INSTANT_NAV_RIG=1 bun run start --hostname localhost --port 3200`.
- EXPOSE: `EXPOSE_TESTING_API=1` enables `experimental.exposeTestingApiInProductionBuild`; normal and production builds leave it disabled.
- RUN: `bun run test:e2e:instant` against `http://localhost:3200`; the existing runner creates an ephemeral Neon branch and starts the production server through Playwright.
- TEST USER: a fresh guest created through the real `/chat` UI; identity is held in the app's guest cookie and data lives on the ephemeral Neon branch.
- DRIFT: authenticated Clerk session versus guest, plan and entitlements, admin role, PostHog flags or experiment buckets, existing versus empty chat data, locale, and desktop versus mobile viewport.
- LOOP: local build → start on port 3200 → run the instant-navigation spec on desktop and mobile → stop the Playwright-owned server; fully agent-drivable when the repository's Neon and build credentials are present.
- LIVENESS: not applicable; each run starts the freshly built local artifact and Playwright fails if its server cannot own port 3200.
- WALLS: requires `NEON_API_KEY`, `NEON_PROJECT_ID`, and a development `DATABASE_URL`; local production mode needs `TRUST_PROXY_HEADERS=true` so guest-abuse protection can identify Playwright requests; the existing build hook uploads PostHog source maps; the existing mock OpenRouter server owns port 4317; the regular dev server may remain on port 3100.
