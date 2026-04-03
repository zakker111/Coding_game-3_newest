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

## 3) Next slice: Phase 5 — replay/debug parity + Workshop export affordances

Why this is next:
- Phase 4 collision/invariant hardening is already landed in the engine and covered by tests.
- The live React Workshop still lags behind the richer deploy prototype for tick-event inspection/debugging.

Scope:
- Add `All` + filter/search controls to the React Workshop tick-events panel.
- Enrich raw tick-events JSON with `nameMap`, `eventsWithNames`, and query metadata.
- Add `Copy replay JSON` / `Download replay JSON` affordances.
- Sync roadmap/docs so they stop pointing at already-completed Phase 4 work.

Acceptance criteria:
- The React Workshop can switch between selected-bot and all-events views for the current tick.
- Tick events can be filtered in both list and raw JSON modes.
- Replay JSON can be copied/downloaded from the UI.
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

## 5) After Phase 5

- Phase 5b: source-line / `pc` highlighting once compile metadata is intentionally wired into the app boundary.
- Phase 8: server runner MVP (submissions + deterministic runs + replay storage).
