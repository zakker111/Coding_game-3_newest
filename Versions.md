# Versions

This project follows **Semantic Versioning** (SemVer): `MAJOR.MINOR.PATCH`.

- **MAJOR**: breaking changes to bot APIs, replay formats, save formats, or public interfaces.
- **MINOR**: new features that are backwards-compatible.
- **PATCH**: bug fixes and small improvements.

## Release discipline (required)

- Every deployable build (client and/or server) must have a **version string**.
  - The deployed version should be visible somewhere (UI footer/about panel) and logged on startup.
- Every merge that changes user-visible behavior or spec contracts must update `Versions.md`.
- **Bump the version before merging** (no “we’ll do it later”).
- Every release entry must include a **timestamp**.
  - Format: ISO 8601 in UTC (example: `2026-03-02T12:34:56Z`).

---

## Unreleased

- Workshop-only inactive opponent slots:
  - BOT2..BOT4 can be set to `None (inactive)` in the React Workshop for local inspection runs
  - randomize still fills opponent slots with real bots only
  - the inactive-slot affordance is local Workshop UX, not part of the server match contract
- Phase 8A sandbox server runner:
  - new `apps/server` workspace app
  - `GET /api/ruleset`
  - `POST /api/simulations`
  - `GET /api/matches/:matchId`
  - `GET /api/matches/:matchId/replay`
  - in-memory match/replay storage for the MVP slice
  - root convenience commands: `pnpm dev:server`, `pnpm start:server`, `pnpm test:server`

---

## 0.0.4 — 2026-04-06T12:25:00Z

> Marketing version: **0.04** (SemVer: `0.0.4`).

### Added
- Selftest improvements (coverage + diagnostics) for Workshop/engine integration.
- Node-level deploy-engine parity coverage in `packages/engine/test/deployEngineParity.test.js`.
- Canonical local release sign-off command: `pnpm qa:release`.

### Changed
- Engine/replay contract: `schemaVersion` bumped to `0.2.0` (and docs/plans aligned to `rulesetVersion = 0.2.0`).
- Deploy Workshop build tag bumped to **v0.3.5**.
- Example bot scripts now include locked loadout header directives as the first 3 non-blank lines:
  - `;@slot1 <MODULE|EMPTY>`
  - `;@slot2 <MODULE|EMPTY>`
  - `;@slot3 <MODULE|EMPTY>`
  These are UI/UX metadata comments; authoritative loadout is still the match config / structured UI state.
- Workshop "My Bots" selection now uses a single BOT1 dropdown instead of per-bot tab chips, and local custom bots are capped at 3 entries.
- Workshop wording pass: "My Bots" is now "Bot library", "New bot" is now "Add bot", and the BOT1 selector copy is clearer about choosing the next-run bot.
- React Workshop replay analysis now surfaces replay `loadoutIssues` more prominently:
  - bot tabs show a warning marker when the replay header includes loadout normalization issues
  - Inspector shows a non-blocking `Loadout warning` summary for the selected bot
  - the detailed `Loadout issues` list remains in the `Loadout` card
- Legacy deploy Workshop inspector now mirrors the replay loadout warning affordance:
  - bot tabs show a warning marker when the replay header includes loadout normalization issues
  - Inspector shows the normalized-loadout warning details for the selected bot
- Bullet-target example follow-through is now shipped:
  - built-in example bots teach explicit `TARGET_CLOSEST_BULLET` / `MOVE_AWAY_FROM_TARGET`
  - deploy Workshop inspector mirrors React’s `targetBulletId` visibility
  - deploy sync/smoke coverage protects those paths
- Roadmap/docs now reflect the shipped engine state more accurately:
  - Phases 4, 5, and 5b are complete
  - bullet-targeting numeric-id regression coverage is already shipped
  - bullet-despawn interpolation is already shipped in both Workshop surfaces
  - server planning docs now use the same explicit-loadout contract as the local engine
  - Phase 7 deploy parity/sign-off is now treated as shipped
  - the next recommended slice is the Phase 8 server runner MVP
- Local release sign-off now includes:
  - deploy drift/import checks
  - package tests
  - app build
  - deploy/app Workshop parity smoke

### Updated
- Spec clarifications for `rulesetVersion = 0.2.0` loadouts:
  - explicit per-bot 3-slot loadouts (default-empty if omitted + deterministic normalization + `loadoutIssues`)
  - invalid loadouts surface as **visible, non-blocking warnings/errors** via `loadoutIssues` (match still runs)
- `ARMOR` semantics: passive mitigation (~33%) + speed penalty + SHIELD→ARMOR ordering.
- Replay/debug contract now allows optional per-bot `targetBulletId` in tick state so bullet-target selection is inspectable in the Workshop.
- React Workshop replay analysis now includes:
  - `All` tick-events toggle
  - tick-events filter/search
  - richer raw JSON (`nameMap`, `eventsWithNames`, query metadata)
  - replay export affordances (`Copy replay JSON`, `Download replay JSON`)
  - selected bot inspector shows the current `targetBulletId` when available
- React Workshop debug tooling now includes BOT1 source-line inspection:
  - local compile metadata in the app
  - `pc` → source-line mapping
  - BOT1 source-focus panel and editor gutter highlighting

### Fixed
- `packages/engine`: fixed VM init corruption in `initBotVm` (could break execution).
- `TARGET_CLOSEST_BULLET` tie-break now uses numeric bullet creation order (`B1 < B2 < …`, not lexicographic).
- `packages/replay` sample generator no longer source-scans for module capability; it is loadout-driven (consistent with `rulesetVersion = 0.2.0`).
- Sample replay starter bot source includes the same `;@slot*` header directives for consistency.
- Phase 6: golden determinism fixtures committed + enforced in CI.
- `packages/engine` test harness no longer mutates golden fixtures during ordinary `pnpm test` runs; fixture regeneration stays behind `pnpm golden:update`.
- Engine tests now match the current DSL/runtime contract:
  - canonical IR coverage accounts for normalized nested `IF_DO` instructions
  - expression built-in mocks include bullet-target context when asserting bullet-target predicates
  - movement/targeting/wall-credit/SAW scenarios use valid DSL labels and non-blocking paths
- Deployed Workshop deep links now return HTTP `200` for `/workshop/`, `/docs/`, and `/docs/bot-instructions/` via emitted route entry HTML.
- `qa:workshop` now reports missing Playwright browser runtime dependencies with actionable guidance instead of a raw launch failure stack.

---

## 0.0.3 — 2026-03-17T00:00:00Z

> Marketing version: **0.03** (SemVer: `0.0.3`).

### Added
- Deploy Workshop (buildless static):
  - Visible build tag chip in header (`WORKSHOP_BUILD`), **v0.3.1**.
  - Inspector improvements:
    - bot display names shown in Inspector + event formatting
    - tick events grouped (Movement/Combat/Resources/Other) with collapsible headers
    - tick events modes: **All** toggle + **Raw** toggle
    - tick events filter/search + match count status
    - raw tick events JSON includes `nameMap` and `eventsWithNames` (and includes query metadata when filtered)
- Deploy drift guardrails:
  - `pnpm sync:deploy`, `pnpm check:deploy`
  - `pnpm check:deploy:imports` validates deploy-time JS import targets
- Workshop QA smoke:
  - `scripts/qa-workshop.mjs` supports local serve (`--serve`) and multi-URL checks.
  - Covers run/preview + opponent selection/randomize + tick-events All/Raw/Filter + raw JSON shape.

### Fixed
- Deploy Workshop now ensures `/workshop` resolves to `/workshop/` to avoid broken relative module imports.
- Deploy Workshop engine worker boundary: improved failure reporting and rejects in-flight runs on worker errors.

### Changed
- Bumped workspace package versions to `0.0.3` (`apps/web`, `packages/engine`, `packages/replay`, root, and legacy `site`).

---

## 0.0.2 — 2026-03-07T00:00:00Z

> Marketing version: **0.02** (SemVer: `0.0.2`).

### Added
- Monorepo workspace:
  - `apps/web` (Nowt web app)
  - `packages/engine` (bot DSL compiler/VM + deterministic simulation + replay generation)
  - `packages/replay` (legacy replay generator + typings; not used by the Workshop)
  - `deploy/` (buildless static workshop prototype)
- Deterministic simulation + replay generation (engine-driven) including:
  - stable PRNG (no `Math.random()`)
  - continuous positions in a 192×192 arena
  - bots spawning in the four corners
  - bullets + bot/bot + bot/wall collisions
  - powerups (spawn/pickup/despawn) represented in replay state and rendered in the arena
  - SAW melee demo behavior for SAW-capable bots
- Client Workshop features (local, deterministic):
  - landing (`/`) → workshop (`/workshop`)
  - bot editing for `BOT1..BOT4` with local persistence and an explicit apply/update flow for BOT1
  - deterministic opponent selection/randomization (seeded; no `Math.random()`)
  - replay controls (play/pause, step, scrub) with smooth intra-tick interpolation
  - arena rendering: grid + walls + bots + bullets + powerups
  - inspector: per-bot stats + filtered tick event log (including bumps and powerups)
- Vite global `__APP_VERSION__` injected from `apps/web/package.json` and shown in UI.
- Tests:
  - determinism tests for replay generation
  - unit tests for opponent selection and arena utilities

### Changed
- Root `pnpm` scripts target `apps/web` for `dev/build/test`.
- Workspace configuration (`pnpm-workspace.yaml`) includes `apps/*` and `packages/*`, excluding legacy `site/`.

### Notes
- `packages/engine` is the authoritative simulation core for `rulesetVersion = 0.2.0` (replay `schemaVersion = 0.2.0`).
- `packages/replay` remains a legacy/sample generator and should not be treated as authoritative.

---

## 0.0.1 — 2026-03-01T00:00:00Z

> Marketing version: **0.01** (SemVer: `0.0.1`).

### Added
- Initial repository created (spec-first Markdown + planning docs).
