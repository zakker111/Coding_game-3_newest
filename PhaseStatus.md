# Phase status (what’s left)

This repo already has a working end-to-end local loop:
- Bot DSL compiler + VM (`packages/engine/src/dsl`, `packages/engine/src/vm`)
- Deterministic simulation + replay generation (`packages/engine/src/sim/runMatchToReplay.js`)
- Workshop UI running the engine in a worker (`apps/web/src/worker`)

---

## Next slice: Phase 5 — replay/debug parity + Workshop export affordances

Goals:
- Bring the React Workshop inspector/debug surface closer to deploy parity:
  - `All` tick-events toggle
  - tick-events filter/search
  - richer raw JSON (`nameMap`, `eventsWithNames`, query metadata)
- Add replay export affordances in the live Workshop UI (`Copy replay JSON`, `Download replay JSON`).
- Sync roadmap/docs to the shipped engine state so future planning starts from the current baseline.

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

## Phase 3 — Bullets as first-class targets (implemented baseline)

Status: ✅ done (baseline)

Implemented:
- `TARGET_CLOSEST_BULLET`
- `HAS_TARGET_BULLET()` / `DIST_TO_TARGET_BULLET()`
- `MOVE_AWAY_FROM_TARGET`
- Deterministic tie-break by numeric bullet creation order (`B1 < B2 < …`).

Nice-to-have hardening:
- Add a determinism test that covers bullet ids ≥ 10 (guards against accidental lexicographic comparisons).

---

## Phase 4 — Simulation correctness + invariants hardening

Status: ✅ done

Implemented:
- Bullet collision resolution now uses an explicit first-collision resolver in `packages/engine/src/sim/bulletSim.js`.
- Adversarial edge cases are covered in `packages/engine/test/simBulletCollisionEdgeCases.test.js`.
- Bullet invariants are covered in `packages/engine/test/simBulletsInvariants.test.js`.

## Phase 5 — Replay/UI polish (Workshop ergonomics)

Status: ⏳ next

Ideas:
- Tick-events parity with deploy Workshop (`All`, filter/search, richer raw JSON).
- Replay export affordances in the React Workshop.
- Follow-on: source-line / `pc` highlighting once compile metadata is intentionally wired through the app boundary.

---

## Phase 6 — Determinism golden tests

Status: ✅ done

- Fixtures committed under `packages/engine/test/golden/fixtures/`.
- CI-enforced (`GOLDEN_STRICT=1` + `pnpm golden:check`).

---

## Phase 7 — Deployment unification / reduce duplication

Status: ✅ in place

- `pnpm sync:deploy`, `pnpm check:deploy`, `pnpm check:deploy:imports`.
- CI drift guardrails for `deploy/bot-instructions.md` and `deploy/workshop/exampleBots.js`.

---

## Phase 8 — Server: daily runner + submissions

Status: ⏳ later

Key items:
- Headless deterministic match runner (scheduling + storage + replay output)
- Auth + bot submissions + versioning + validation
