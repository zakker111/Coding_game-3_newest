# Phase status (what’s left)

This repo already has a working end-to-end local loop:
- Bot DSL compiler + VM (`packages/engine/src/dsl`, `packages/engine/src/vm`)
- Deterministic simulation + replay generation (`packages/engine/src/sim/runMatchToReplay.js`)
- Workshop UI running the engine in a worker (`apps/web/src/worker`)

---

## Next slice: final local-loop audit before Phase 8

Goals:
- Keep improving the existing local deterministic loop before introducing server scope.
- Focus on:
  - closing any remaining spec/schema drift and determinism guardrails
  - keeping deploy/workshop guardrails boring and reliable
  - keeping the planning docs/checklists aligned to the shipped implementation

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

Status: ✅ in place, with follow-up hardening available

- `pnpm sync:deploy`, `pnpm check:deploy`, `pnpm check:deploy:imports`.
- CI drift guardrails for `deploy/bot-instructions.md` and `deploy/workshop/exampleBots.js`.

---

## Phase 8 — Server: daily runner + submissions

Status: ⏳ deferred until after the local-loop hardening/polish track

Key items:
- Server planning docs now assume the same explicit per-bot loadout contract as the local engine.
- Headless deterministic match runner (scheduling + storage + replay output)
- Auth + bot submissions + versioning + validation
