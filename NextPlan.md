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
- React Workshop replay/debug parity shipped:
  - `All` tick-events toggle
  - tick-events filter/search
  - richer raw JSON (`nameMap`, `eventsWithNames`, query metadata)
  - replay export affordances (`Copy replay JSON`, `Download replay JSON`)
- Phase 5b source-line debugging shipped for BOT1:
  - local compile metadata in the app
  - `pc` → source-line mapping
  - BOT1 source-focus panel + line-number gutter highlighting

---

## 3) Next slice: local-loop hardening + debug polish

Why this is next:
- The local deterministic loop is now in good shape:
  - collision/invariant hardening is landed
  - React Workshop replay/debug parity is landed
  - BOT1 source-line / `pc` highlighting is landed
- There is still valuable non-server work to finish before auth, submissions, and replay storage widen the surface area.

Scope:
- Close remaining non-server tasks that improve reliability and developer iteration speed:
  - finish spec/schema drift cleanup and determinism guardrails
  - add the remaining bullet-targeting regression/debugging polish
  - make `loadoutIssues` more visible in the Workshop
  - add bullet-despawn smoothing
  - tighten deploy-sync and deploy-smoke coverage
- Keep the authoritative gameplay rules in `packages/engine`; avoid widening scope into server concerns for this slice.

Acceptance criteria:
- The roadmap/checklists no longer imply that already-shipped Workshop features are missing.
- The remaining non-server follow-up work is explicit, prioritized, and testable.
- Server work remains deferred until the local loop feels complete and stable.

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
