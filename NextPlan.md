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

## 3) Next slice: Phase 8 server runner MVP

Why this is next:
- The local deterministic loop is already guarded by:
  - collision/invariant hardening
  - golden replay checks
  - node-level deploy-engine parity coverage
  - deploy drift/import checks
  - app build + deploy/app Workshop parity smoke in the release gate
- The server-side loadout contract is already aligned with the shipped engine/docs.
- Workshop-only inactive opponent slots are explicitly local UX and do not change the server runner contract.
- The remaining local-loop risk is operational, not architectural: run the browser-capable release gate where appropriate and fix any surfaced regressions in context.

Scope:
- Start the smallest deterministic server runner that consumes the existing engine contract.
- Keep replay/schema/ruleset semantics unchanged while the server path is wired up.
- Reuse the local parity/sign-off workflow as the contract for server acceptance.

Acceptance criteria:
- The server can execute a deterministic headless match from submitted bot sources + explicit loadouts.
- Stored/retrieved replay output matches the local engine contract.
- Local release verification stays green via `pnpm qa:release` (or `pnpm gate:phase1`).

---

## 4) Pre-merge checklist (run locally)

```bash
pnpm qa:release
pnpm -C packages/engine test:golden
```

Manual checks:
- Workshop shows the expected build tag and can run a match.
- Raw replay JSON includes `schemaVersion = 0.2.0`, `rulesetVersion = 0.2.0`, and `bots[].loadout`.

---

## 5) After the server runner MVP starts

- Add persistent submissions/versioning.
- Add replay storage and retrieval.
- Add auth/validation once the deterministic runner path is stable.
