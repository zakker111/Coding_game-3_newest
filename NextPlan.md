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
- Phase 8A sandbox server runner is implemented in-repo:
  - `apps/server` workspace app
  - `GET /api/ruleset`
  - `POST /api/simulations`
  - `GET /api/matches/:matchId`
  - `GET /api/matches/:matchId/replay`
  - deterministic headless execution from inline source/loadout snapshots
  - workspace build/test/start commands
  - the default server entrypoint also persists users/bots/matches to `.nowt/server-state.json`

---

## 3) Next slice: Phase 8 beyond the sandbox runner

Why this is next:
- The local deterministic loop is already guarded by:
  - collision/invariant hardening
  - golden replay checks
  - node-level deploy-engine parity coverage
  - deploy drift/import checks
  - app build + deploy/app Workshop parity smoke in the release gate
- The server-side loadout contract is already aligned with the shipped engine/docs.
- Workshop-only inactive opponent slots are explicitly local UX and do not change the server runner contract.
- The sandbox server boundary already exists in-repo, so the remaining risk is not “can we run a deterministic match over HTTP?” but “can we turn that into the intended product flow without destabilizing the contract?”

Scope:
- Keep the sandbox runner semantics unchanged while broadening the product surface around it.
- Treat the existing auth/bot/persistence baseline as implementation detail that still needs roadmap closure and hardening.
- Focus follow-on Phase 8 work on:
  - durable submission/version flows as a first-class product surface
  - validation/rate-limiting/hardening for multi-user access
  - daily scheduling and standings
  - operational confidence around longer-lived persisted state

Acceptance criteria:
- The existing sandbox runner contract remains stable while follow-on server features are added.
- Daily-run/product work builds on stored bot snapshots rather than ad hoc inline-only flows.
- Replay/match persistence semantics are explicit and tested.
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

## 5) Remaining Phase 8 work after the sandbox runner

- Harden and document the saved-bot/version flow that now exists in the server.
- Tighten validation and operational guardrails for the server surface.
- Add daily scheduling and standings after the sandbox path is stable.
