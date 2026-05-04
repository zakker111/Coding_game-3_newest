# NextPlan.md — What to build next (post `0.0.4`)

This repo already has a working, end-to-end **local** loop:
- **Engine**: deterministic bot DSL → VM → simulation → replay (`packages/engine`)
- **Workshop UI**: runs the engine in a worker + replay viewer (`apps/web`)
- **Static deploy**: buildless workshop prototype (`deploy/`)

This file is the **merge-time plan**: what we just shipped, what’s locked, and what we do next.

---

## 1) What’s “locked” right now (treat as contracts)

If you change any of the below, update `Versions.md` + affected specs/tests:
- `rulesetVersion = 0.2.0` behavior (`Ruleset.md`)
- `schemaVersion = 0.2.0` replay contract (`ReplayViewerPlan.md`, `packages/replay/src/index.d.ts`)
- Deterministic tick loop order (`Ruleset.md`, `SpecAlignment.md`)

Determinism guardrail:
- Phase 6 golden fixtures are committed and strict-checked in CI (`pnpm golden:check --strict`).

---

## 2) Recently completed (this merge set)

- Replay/engine contract bumped to `schemaVersion = 0.2.0` (docs + deploy artifacts + mock/sample replays updated).
- Deploy Workshop build tag bumped to **v0.3.5**.
- Example bots updated to include locked `;@slot1/2/3` header directives.
- `packages/replay` sample generator is now **loadout-driven** (no SAW/SHIELD source scanning).
- Bullet targeting + evasion v1 is available (`TARGET_CLOSEST_BULLET`, `DIST_TO_TARGET_BULLET()`, `MOVE_AWAY_FROM_TARGET`) with deterministic tie-break by numeric bullet creation order.
- React Workshop replay/debug parity shipped:
  - `All` tick-events toggle
  - tick-events filter/search
  - richer raw JSON (`nameMap`, `eventsWithNames`, query metadata)
  - replay export affordances (`Copy replay JSON`, `Download replay JSON`)
- React Workshop match setup now supports Workshop-only inactive opponent slots:
  - BOT2..BOT4 can be set to `None (inactive)` for local inspection runs
  - randomize still fills opponent slots with real bots only
  - this is a client-only Workshop convenience, not part of the server match contract
- React Workshop replay loadout warnings now surface in the replay-analysis tabs and Inspector while keeping the detailed `Loadout issues` list in the `Loadout` card.
- Phase 5b source-line debugging shipped for BOT1:
  - local compile metadata in the app
  - `pc` → source-line mapping
  - BOT1 source-focus panel + line-number gutter highlighting
- Legacy deploy Workshop parity now includes replay loadout warnings in tabs + Inspector.
- Roadmap/docs were synced to the shipped state:
  - bullet-targeting numeric-id regression coverage already exists
  - bullet-despawn interpolation is already implemented in both Workshop surfaces
- Phase 7 release-grade parity/sign-off shipped:
  - node-level deploy-engine replay parity coverage
  - canonical local release gate (`pnpm qa:release`)
  - deploy/app Workshop parity smoke included in the gate
  - actionable browser-runtime diagnostics in `qa:workshop`

---

## 3) Recently completed: Phase 8A sandbox server runner

Why this was the right first server slice:
- The local deterministic loop is already guarded by:
  - collision/invariant hardening
  - golden replay checks
  - node-level deploy-engine parity coverage
  - deploy drift/import checks
  - app build + deploy/app Workshop parity smoke in the release gate
- The server-side loadout contract is already aligned with the shipped engine/docs.
- Workshop-only inactive opponent slots are explicitly local UX and do not change the server runner contract.
- The remaining local-loop risk is operational, not architectural: run the browser-capable release gate where appropriate and fix any surfaced regressions in context.

Shipped scope:
- `apps/server` provides the deterministic server runner that consumes the existing engine contract.
- The server app includes:
  - `GET /api/ruleset`
  - `POST /api/simulations`
  - `GET /api/matches/:matchId`
  - `GET /api/matches/:matchId/replay`
- Inline participant snapshots (`sourceText` + explicit `loadout`) can be executed as sandbox matches.
- Match metadata and replay retrieval work over HTTP.
- Source limits, compile errors, loadout normalization, and failed-match lifecycle handling are covered by server tests.
- Auth, starter user bots, bot save/load, and source version history have also started in the server app.

Verification:
- `pnpm -C apps/server test`

---

## 4) Next slice: Phase 8B server-backed Workshop simulations

Why this is next:
- The client can already run local deterministic matches.
- The server can already run deterministic sandbox matches and return replay JSON.
- The next product milestone is proving that the Workshop can use the server runner without replacing the local workflow.

Scope:
- Add a Workshop control/path for server-backed simulations while keeping the current local run path.
- Send the current bot source snapshots and explicit loadouts to `POST /api/simulations`.
- Fetch the returned replay from `GET /api/matches/:matchId/replay`.
- Render the server replay in the existing replay viewer.
- Surface actionable server validation errors in the Workshop UI:
  - invalid request shape
  - source-size limit failures
  - compile errors with slot details
  - loadout normalization warnings
- Keep Workshop-only inactive opponent slots local-only unless the server contract is intentionally expanded.

Acceptance criteria:
- A user can run the same 4-bot setup locally or through the server from the Workshop.
- Server-returned replay JSON renders in the existing viewer without schema changes.
- Server error responses are visible and understandable in the UI.
- Server-backed runs do not change `rulesetVersion = 0.2.0` or `schemaVersion = 0.2.0`.
- Relevant web/server tests pass.

Recommended QA:
- `pnpm -C apps/server test`
- `pnpm -C apps/web test`
- `pnpm build`

---

## 5) Pre-merge checklist (run locally)

```bash
pnpm -C apps/server test
pnpm qa:release
pnpm -C packages/engine test:golden
```

Manual checks:
- Workshop shows the expected build tag and can run a match.
- Raw replay JSON includes `schemaVersion = 0.2.0`, `rulesetVersion = 0.2.0`, and `bots[].loadout`.

---

## 6) After Phase 8B lands

- Harden persistent submissions/versioning beyond the current server baseline.
- Replace the in-memory match store with durable storage.
- Add rate limiting and production-grade auth/session hardening.
- Add daily scheduling after the sandbox path is stable.
