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
- Deploy Workshop build tag bumped to **v0.3.5**.
- Example bots updated to include locked `;@slot1/2/3` header directives.
- `packages/replay` sample generator is now **loadout-driven** (no SAW/SHIELD source scanning).
- Bullet targeting + evasion v1 is available (`TARGET_CLOSEST_BULLET`, `DIST_TO_TARGET_BULLET()`, `MOVE_AWAY_FROM_TARGET`) with deterministic tie-break by numeric bullet creation order.
- React Workshop replay/debug parity shipped:
  - `All` tick-events toggle
  - tick-events filter/search
  - richer raw JSON (`nameMap`, `eventsWithNames`, query metadata)
  - replay export affordances (`Copy replay JSON`, `Download replay JSON`)
- React Workshop replay loadout warnings now surface in the replay-analysis tabs and Inspector while keeping the detailed `Loadout issues` list in the `Loadout` card.
- Phase 5b source-line debugging shipped for BOT1:
  - local compile metadata in the app
  - `pc` → source-line mapping
  - BOT1 source-focus panel + line-number gutter highlighting
- Legacy deploy Workshop parity now includes replay loadout warnings in tabs + Inspector.
- Roadmap/docs were synced to the shipped state:
  - bullet-targeting numeric-id regression coverage already exists
  - bullet-despawn interpolation is already implemented in both Workshop surfaces

---

## 3) Next slice: final local-loop audit before Phase 8

Why this is next:
- The local deterministic loop is now in good shape:
  - collision/invariant hardening is landed
  - React Workshop replay/debug parity is landed
  - BOT1 source-line / `pc` highlighting is landed
- The previously planned bullet-target example follow-through is now shipped:
  - the built-in example bots teach explicit bullet targeting and evasion
  - the deploy inspector exposes `Target bullet`
  - deploy smoke coverage exercises that path
- The server-side loadout contract is now aligned with the shipped engine/docs:
  - server planning docs now use explicit per-bot loadouts
  - omitted loadouts default to `[null, null, null]`
  - normalization and `loadoutIssues` are part of the planned server contract
- The remaining question is whether there is any material local-loop drift left before Phase 8 begins.

Scope:
- Run a final local-loop audit for any remaining spec/schema drift that would make server work riskier.
- Keep the active docs/checklists honest about what is implemented vs. still pending.
- Keep the authoritative gameplay rules in `packages/engine`; avoid changing mechanics unless the audit proves a real mismatch.

Acceptance criteria:
- The roadmap/checklists no longer describe the bullet-target example/deploy-inspector work as pending.
- The server planning docs consistently use the explicit-loadout contract.
- Any remaining local-loop drift is documented concretely, with verification evidence.
- Phase 8 begins only after the remaining audit items are judged small enough to defer.

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

## 5) After this local-loop slice

- Re-evaluate whether the server runner MVP is the right next move.
- If yes, start with the smallest server plan:
  - auth
  - persistent submissions/versioning
  - deterministic headless match execution
  - replay storage
