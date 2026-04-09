# Phase status (what’s left)

This repo already has a working end-to-end local loop:
- Bot DSL compiler + VM (`packages/engine/src/dsl`, `packages/engine/src/vm`)
- Deterministic simulation + replay generation (`packages/engine/src/sim/runMatchToReplay.js`)
- Workshop UI running the engine in a worker (`apps/web/src/worker`)

---

## Next slice: broader Phase 8 productization after the sandbox runner

Goals:
- Treat the deterministic sandbox runner as landed in-repo and keep the engine/replay contract locked while the broader server product surface catches up.
- Build from the existing server baseline instead of reopening local-loop work. Workshop-only inactive opponent slots remain a local UI affordance and are not part of the server-side match surface.
- Focus the next server work on the pieces still explicitly deferred inside Phase 8: competition scheduling, standings, and hardening around longer-lived submission/storage flows.

---

## Phase 1 — Spec + implementation alignment

Status: ✅ done

QA gates:
- `pnpm -C packages/engine test`
- `pnpm qa`

---

## Phase 2 — Real loadouts + module model (`rulesetVersion = 0.2.0`)

Status: ✅ done

Highlights:
- Explicit per-bot 3-slot `loadout` input (`SLOT1..SLOT3`) with default-empty + deterministic normalization + `loadoutIssues`.
- `ARMOR` implemented (speed penalty + mitigation; SHIELD→ARMOR bullet ordering).
- Workshop and deploy runners pass explicit loadouts (no source scanning).

---

## Phase 3 — Bullets as first-class targets

Status: ✅ done

Implemented:
- `TARGET_CLOSEST_BULLET`
- `HAS_TARGET_BULLET()` / `DIST_TO_TARGET_BULLET()`
- `MOVE_AWAY_FROM_TARGET`
- Deterministic tie-break by numeric bullet creation order (`B1 < B2 < …`).
- Determinism regression coverage for bullet ids `>= 10` (`B10`, `B2`, `B11`) is in `packages/engine/test/simBulletTargeting.test.js`.

---

## Phase 4 — Simulation correctness + invariants hardening

Status: ✅ done

Implemented:
- Bullet collision resolution now uses an explicit first-collision resolver in `packages/engine/src/sim/bulletSim.js`.
- Adversarial edge cases are covered in `packages/engine/test/simBulletCollisionEdgeCases.test.js`.
- Bullet invariants are covered in `packages/engine/test/simBulletsInvariants.test.js`.

## Phase 5 — Replay/UI polish (Workshop ergonomics)

Status: ✅ done

Implemented:
- Tick-events parity with deploy Workshop (`All`, filter/search, richer raw JSON).
- Replay export affordances in the React Workshop.
- Follow-on source-line / `pc` highlighting shipped for BOT1 via local compile metadata in the app.
- Workshop match setup supports local-only inactive opponent slots (`None` for BOT2..BOT4) so replay inspection can focus on one-bot or two-bot runs without changing the server contract.
- Replay `loadoutIssues` are surfaced prominently in the React Workshop tabs + Inspector while keeping the detailed list in `Loadout`.
- Deploy Workshop now mirrors the replay loadout-warning affordance in tabs + Inspector.
- Bullet despawn interpolation/fade is already shipped in both Workshop surfaces.

---

## Phase 6 — Determinism golden tests

Status: ✅ done

- Fixtures committed under `packages/engine/test/golden/fixtures/`.
- CI-enforced (`GOLDEN_STRICT=1` + `pnpm golden:check`).

---

## Phase 7 — Deployment unification / reduce duplication

Status: ✅ done

- `pnpm sync:deploy`, `pnpm check:deploy`, `pnpm check:deploy:imports`.
- Node-level deploy-engine parity coverage in `packages/engine/test/deployEngineParity.test.js`.
- Local release sign-off gate now includes app build plus deploy/app Workshop parity smoke (`pnpm qa:release` / `pnpm gate:phase1`).
- `qa:workshop` now fails clearly when the browser runtime is unavailable instead of surfacing an opaque Playwright launch stack.

---

## Phase 8 — Server: daily runner + submissions

Status: 🚧 in progress beyond a completed Phase 8A sandbox runner

Phase 8A implemented in-repo:
- New `apps/server` workspace app.
- Deterministic sandbox match execution from submitted bot source snapshots + explicit loadouts.
- Match metadata + replay retrieval over HTTP.
- Workspace build/test integration (`pnpm dev:server`, `pnpm start:server`, `pnpm test:server`).

The current repo state also includes a broader baseline server surface than the original 8A cut:
- Starter auth/session endpoints.
- Bot save/load/version routes.
- File-backed persistence in the default server entrypoint.

Still deferred inside Phase 8:
- Daily run scheduling and standings.
- Broader product hardening around multi-user submissions, validation/rate limiting, and operational concerns.
