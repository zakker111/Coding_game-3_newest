# NextPlan.md — What to build next (post `0.0.3`)

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
- Deploy Workshop build tag bumped to **v0.3.3**.
- Example bots updated to include locked `;@slot1/2/3` header directives.
- `packages/replay` sample generator is now **loadout-driven** (no SAW/SHIELD source scanning).
- Bullet targeting + evasion v1 is available (`TARGET_CLOSEST_BULLET`, `DIST_TO_TARGET_BULLET()`, `MOVE_AWAY_FROM_TARGET`) with deterministic tie-break by numeric bullet creation order.

---

## 3) Next slice: Phase 4 — simulation correctness + invariants hardening

Scope:
- Harden bullet movement/collision edge cases (avoid missed/ambiguous hits).
- Add/extend invariants so replays never contain NaNs/out-of-bounds positions.
- Ensure every bullet despawns with a reason and state/event consistency is enforced.

Acceptance criteria:
- Engine tests cover invariants (no NaNs/out-of-bounds; bullet spawn/move/despawn consistency).
- Golden fixtures updated only when behavior changes intentionally.
- Workshop still runs a full match without errors.

---

## 4) Pre-merge checklist (run locally)

```bash
pnpm -C packages/engine test
pnpm -C packages/replay test
pnpm -C apps/web test
pnpm test:all
pnpm build:all
pnpm qa
pnpm check:deploy
pnpm check:deploy:imports
pnpm -C packages/engine test:golden
```

Manual checks:
- Workshop shows the expected build tag and can run a match.
- Raw replay JSON includes `schemaVersion = 0.2.0`, `rulesetVersion = 0.2.0`, and `bots[].loadout`.

---

## 5) After Phase 4

- Phase 8: server runner MVP (submissions + deterministic runs + replay storage).
