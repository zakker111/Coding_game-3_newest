# Phase status (what’s left)

This repo already has a working end-to-end local loop:
- Bot DSL compiler + VM (`packages/engine/src/dsl`, `packages/engine/src/vm`)
- Deterministic simulation + replay generation (`packages/engine/src/sim/runMatchToReplay.js`)
- Workshop UI running the engine in a worker (`apps/web/src/worker`)

---

## Next slice: Phase 4 — simulation correctness + invariants hardening

Goals:
- Improve bullet collision math edge cases (current stepped approach can miss/alias rare geometries).
- Strengthen invariants (no NaNs/out-of-bounds; bullet spawn/move/despawn consistency).
- Keep golden determinism fixtures updated when intentional behavior changes occur.

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

## Phase 5 — Replay/UI polish (Workshop ergonomics)

Status: ⏳ later

Ideas:
- Bullet despawn-tick smoothing (avoid “pop” on HIT/WALL/TTL).
- Richer debugging UI (executed instruction per tick + prominent `BOT_EXEC.reason`).

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
