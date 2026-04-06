# Todo

Near-term engineering tasks and the **current ruleset/engine contract**.

Primary specs (authoritative for `rulesetVersion = 0.2.0`, `schemaVersion = 0.2.0`):
- `Ruleset.md`
- `ReplayViewerPlan.md` (schema contract)

---

## Current status

Recently completed (this merge set)
- `schemaVersion = 0.2.0` end-to-end (engine output + deploy artifacts + sample/mock replays).
- Deploy Workshop build tag bumped to **v0.3.5**.
- Example bots updated with locked loadout header directives (`;@slot1/2/3`).
- `packages/replay` sample generator is now **loadout-driven** (no source scanning for SAW/SHIELD).
- Bullet targeting + evasion v1 shipped (`TARGET_CLOSEST_BULLET`, `HAS_TARGET_BULLET()`, `DIST_TO_TARGET_BULLET()`, `MOVE_AWAY_FROM_TARGET`) with deterministic tie-break by numeric bullet creation order.
- Phase 6 golden determinism fixtures committed + enforced in CI.

Next slice (non-server roadmap)
- Keep the focus on the existing local loop before touching auth, submissions, or server infrastructure.
- Prioritize:
  - final local-loop audit and any remaining spec/schema alignment
  - deploy/workshop guardrails so the static surfaces stay boring and reliable
- Leave Phase 8 (server runner MVP) explicitly deferred until the local workflow feels complete.

### Status board

Implemented now
- [x] Explicit per-bot loadouts are the authoritative contract across engine, Workshop, deploy docs, and server planning docs.
- [x] Bullet targeting, example-bot follow-through, and deploy inspector `Target bullet` parity are shipped.
- [x] Replay/debug ergonomics are shipped in both Workshop surfaces.
- [x] Golden determinism guardrails and deploy drift checks are in place.

Still open
- [ ] Final local-loop audit for any remaining spec/schema drift or reliability gaps.
- [ ] Deploy/workshop hardening beyond the current sync/import/smoke guardrails.
- [ ] Phase 8 server runner MVP.

### Near-term execution checklist

Do next
- [ ] Audit `Ruleset.md` and `ReplayViewerPlan.md` against the produced engine/replay output.
- [ ] Decide which remaining local-loop drift is real, and which can be explicitly deferred.
- [ ] Make the deploy/workshop hardening list concrete enough to execute as one small slice.

Ready after audit
- [ ] Start the smallest Phase 8 server slice:
  - deterministic headless runner
  - submission storage/versioning
  - replay storage
  - auth/validation surface

### Checklist (done vs. not done)

Done (shipped)
- [x] Docs/spec alignment for `rulesetVersion = 0.2.0` / `schemaVersion = 0.2.0`.
- [x] Workshop build tag visible in `/workshop/`.
- [x] Example bots have `;@slot1/2/3` headers (first 3 non-blank lines in script).
- [x] Explicit per-bot 3-slot loadouts are wired through Workshop/engine (no source scanning).
- [x] Server planning docs now use the same explicit per-bot loadout contract as the engine.
- [x] ARMOR implemented and tested (mitigation + speed penalty; SHIELD→ARMOR ordering).
- [x] Golden determinism fixtures committed and `pnpm golden:check` is strict.
- [x] Bullet targeting + `MOVE_AWAY_FROM_TARGET` available and smoke-tested.

Next up
- [x] Phase 4: correctness + invariants hardening.
- [x] Phase 5: replay/debug parity + Workshop export affordances.
- [x] Phase 5b: source-line / `pc` highlighting in the Workshop editor.
- [ ] Local-loop hardening: close any remaining spec/schema drift and workshop/deploy guardrails.
- [x] Bullet-targeting follow-up: examples and remaining deploy parity UX.
- [x] Deploy/workshop parity: legacy deploy Workshop mirrors the React replay loadout warnings.
- [ ] Phase 8: server runner MVP (submissions + deterministic runs + replay storage).

---

## Current engine contract (rulesetVersion `0.2.0`, schemaVersion `0.2.0`)

### Determinism
- Seeded RNG per match.
- Stable ordering:
  - bots: `BOT1..BOT4`
  - bullets: creation order
  - powerups: stable anchor order for enumeration; RNG choice for spawn candidate

### Tick ordering
See `Ruleset.md` §5.

### Runtime error policy
- Invalid instruction at runtime:
  - treated as `NOP`
  - bot `pc` resets to `1` next tick
  - engine emits `BOT_EXEC { result: "NOP", reason: "INVALID_INSTR" }`

### Module availability
- Explicit per-bot 3-slot `loadout` is supported as match input.
- If omitted, the engine defaults to all-empty: `[null, null, null]`.
- Loadouts are deterministically normalized and issues may be surfaced in replay header as `loadoutIssues`.
- `ARMOR` is implemented (passive mitigation + speed penalty).

### Implemented balance numbers
(These are *implemented constants*; tuneable only via a rulesetVersion bump.)

- Movement: `speedUnitsPerTick = 12`
- Bullets:
  - `damage = 10`, `speed = 16`, `ttl = 18`
  - `ammoCost = 1`, `cooldownTicks = 4`
- SAW:
  - `damagePerTick = 6`
  - `energyDrainPerTick = 1`
  - `rangeUnits = 18`
- SHIELD:
  - `energyDrainPerTick = 1`
  - bullet mitigation: 50% reduction (`amount - floor(amount/2)`)
- Wall bump:
  - `damage = 2`
- Bot bump:
  - `damage = 1` to each bot
- Powerups:
  - spawn interval `10..20` ticks
  - `maxActive = 6`, `lifetimeTicks = 30`
  - deltas: `HEALTH +30`, `AMMO +20`, `ENERGY +30`
  - type distribution: uniform among `HEALTH|AMMO|ENERGY`

---

## Future development plan

This section is the working roadmap. It’s structured as phases so we can ship incrementally while keeping determinism and the replay schema stable.

Recently completed:
- **Phase 0.1**: Add deploy Workshop build tag mechanism (visible version chip in header).
- **Phase 0.2**: Workshop Inspector ergonomics (deploy):
  - Human-readable tick-event list grouped by category (Movement/Combat/Resources/Other)
  - Bot display names shown in Inspector + event log (beyond BOT1/BOT2…)
  - Tick events modes: **All** toggle, **Raw** toggle
  - Filter/search for tick events (list + raw)
  - Raw JSON includes `nameMap` + `eventsWithNames` (and includes query metadata when filtered)
  - Playwright smoke coverage extended (`pnpm qa:workshop`) to cover these affordances
  See `Versions.md`.

### Global definition of done (all phases)

- Specs updated (as needed): `Ruleset.md`, `ReplayViewerPlan.md`, and any phase-specific docs.
- Version discipline followed:
  - Update `Versions.md` before merge if user-visible behavior or contracts change.
  - Bump `rulesetVersion` when changing sim/replay semantics.
  - If `deploy/workshop/*` changes user-visible behavior, bump the Workshop build tag:
    - `deploy/workshop/workshop.js`: `WORKSHOP_BUILD = '…'`
- QA gates green:
  - `pnpm -C packages/engine test`
  - `pnpm test:all`
  - `pnpm build:all`
  - `pnpm qa`

Optional smoke checks (recommended for anything touching Workshop or deploy artifacts):
- `pnpm check:deploy`
- `pnpm check:deploy:imports`
- `pnpm qa:workshop -- --serve --url http://127.0.0.1:8787`

Workshop QA contract (keep stable or update the QA script alongside UI changes):
- `/workshop` must resolve/redirect to `/workshop/` (relative module imports depend on trailing slash).
- `scripts/qa-workshop.mjs` relies on these IDs existing: `runBtn`, `randomizeOpponentsBtn`, `scrub`, `tickLabel`, `runNotice`, `inspectStats`, `tickEventsAllBtn`, `tickEventsRawBtn`, `tickEventsFilterInput`, `tickEventsFilterStatus`, `tickEventsList`, `eventLog`.
- Treat `pnpm qa:workshop` as **required** when changing `deploy/workshop/*` or `scripts/qa-workshop.mjs`.

---

## Phase 0.3+ — Post-0.0.2 hardening (keep `rulesetVersion = 0.2.0`)

Goal: close out alignment work, reduce drift, and make the existing loop “boringly reliable” before adding new mechanics.

Concrete tasks
- [ ] Close any remaining spec/schema drift:
  - `Ruleset.md` tick ordering + collision semantics match engine behavior.
  - `ReplayViewerPlan.md` fields/events match produced replays.
- [ ] Determinism audit checklist for new features:
  - no `Math.random()`
  - stable iteration order for maps/sets
  - tie-breakers specified (id order, creation order)
- [ ] Workshop stability:
  - worker startup + reload is robust
  - replay playback is stable (no NaNs; no crashes on scrub)
- [ ] Deploy drift guardrails:
  - expand `pnpm check:deploy` to cover any additional copied docs/assets introduced since 0.0.2.

Acceptance criteria
- `pnpm qa` is green on a clean checkout.
- A replay generated twice with the same seed produces byte-identical replay JSON (or matches golden hash, once Phase 6 is complete).
- `pnpm check:deploy` passes and `pnpm sync:deploy` is a no-op after it runs.

QA checklist
- `pnpm -C packages/engine test`
- `pnpm qa`
- `pnpm check:deploy`
- `pnpm qa:workshop -- --serve --url http://127.0.0.1:8787`

---

## Phase 2 — Real loadouts + module model (`rulesetVersion = 0.2.0`)

Goal: make bot capabilities explicit via per-bot 3-slot loadouts, and ensure all match runners/frontends pass those loadouts into the engine.

Implemented (authoritative engine: `packages/engine`)
- [x] `runMatchToReplay` accepts per-bot `loadout` (3 slots) and defaults to `[null, null, null]` when omitted.
- [x] Deterministic loadout normalization + `loadoutIssues` surfaced in the replay header.
- [x] Slot behavior is loadout-driven (no source scanning) in `packages/engine`.

Consumers / wiring
- [x] Workshop (`apps/web`) passes each bot’s `loadout` into the worker → engine boundary.
- [x] Workshop UI has loadout selection/editing per bot, persistence, and inspector rendering of resolved `loadout` + `loadoutIssues`.
- [x] Deploy runner uses the upgraded `deploy/engine` copy that matches `packages/engine` (`rulesetVersion = 0.2.0`).

Acceptance criteria
- Local Workshop matches behave according to selected loadouts (weapons available, ARMOR speed penalty, etc.), not source-text scanning.
- Replay viewer surfaces per-bot loadout and any normalization issues.
- Deploy drift checks remain green (`pnpm check:deploy`).

QA checklist
- `pnpm -C packages/engine test`
- `pnpm test:all`
- `pnpm build:all`
- Workshop smoke: `pnpm qa:workshop -- --serve --url http://127.0.0.1:8787`

---

## Phase 2.1 — ARMOR (complete module set, `rulesetVersion = 0.2.0`)

Goal: lock in ARMOR semantics (docs + tests) and make the behavior debuggable/visible in the Workshop.

Implemented (authoritative engine: `packages/engine`)
- [x] Passive mitigation (all damage sources): `amount - floor(amount/3)`.
- [x] Movement speed penalty when equipped in any slot: `floor(12 * 3/4) = 9`.
- [x] Bullet mitigation ordering when SHIELD is active: apply SHIELD first, then ARMOR.

QA / UX
- [x] Engine regression tests cover mitigation math (including odd amounts), SHIELD→ARMOR ordering, and speed penalty.
- [x] Workshop makes ARMOR’s effects inspectable via per-bot loadout + events/stats.

Acceptance criteria
- ARMOR behavior is fully specified in `Ruleset.md` and matches the engine.
- Tests prove mitigation + ordering + speed penalty are deterministic and stable.

QA checklist
- `pnpm -C packages/engine test`
- `pnpm qa`

---

## Phase 3 — Bullets as first-class targets (baseline shipped)

Status: ✅ implemented baseline (engine + deploy)

Completed (shipped)
- [x] DSL/compiler/runtime support:
  - `TARGET_CLOSEST_BULLET`
  - `HAS_TARGET_BULLET()`
  - `DIST_TO_TARGET_BULLET()`
- [x] Evasion primitive:
  - `MOVE_AWAY_FROM_TARGET` (via canonical `MOVE { target: { kind: "TARGET_AWAY" } }`)
- [x] Deterministic tie-break documented + implemented:
  - closest-by-Manhattan; ties break by **numeric bullet creation order** (`B1 < B2 < …`).

Remaining hardening / UX polish
- [x] Add a determinism regression test that specifically covers bullet ids ≥ 10 (guards against accidental lexicographic compares like `B10 < B2`).
- [x] Update/extend example bots to demonstrate bullet-target-driven evasion (not just coarse threat booleans).
- [x] Replay/Workshop debug UX: surface `targetBulletId` (or related targeting state) so bullet targeting is inspectable.

QA checklist
- `pnpm -C packages/engine test`
- `pnpm qa`

---

## Phase 4 — Simulation correctness + invariants hardening

Status: ✅ implemented

Goal: tighten simulation math and invariants so future mechanics don’t create subtle replay drift or edge-case bugs.

Completed
- [x] Collision correctness:
  - bullet movement now resolves the earliest collision along the segment for the tick.
  - collision ordering is explicit and regression-tested for wall/bot ties and bot/bot ties.
- [x] Event and damage invariants:
  - bullets despawn with an explicit reason and position.
  - invariant tests assert finite/in-bounds bullet move/despawn positions and absence after despawn.
- [x] Invariant-focused tests:
  - `simBulletCollisionEdgeCases.test.js`
  - `simBulletsInvariants.test.js`

Acceptance criteria
- Invariant tests fail on NaNs/out-of-bounds/despawn-without-reason.
- Collision behavior is documented and matches implementation.

QA checklist
- `pnpm -C packages/engine test`
- `pnpm qa`
- Optional: update golden fixtures (Phase 6) if changes are intentional.

---

## Phase 5 — Replay/UI polish (Workshop ergonomics)

Goal: make debugging and viewing matches pleasant enough for frequent iteration.

Completed (shipped)
- [x] Tick-events parity with deploy Workshop:
  - `All` toggle
  - filter/search
  - raw JSON includes `nameMap`, `eventsWithNames`, and query metadata
- [x] Quality-of-life:
  - one-click `Copy replay JSON` / `Download replay JSON`
- [x] Source-line / `pc` highlighting shipped for BOT1 via local compile metadata in the app

Remaining follow-up polish
- [x] Make `loadoutIssues` more prominent in the React Workshop UI.
- [x] Bullet despawn interpolation/fade is shipped in both Workshop surfaces.
- [x] Legacy deploy Workshop mirrors the React replay loadout warnings.
- [x] Add deploy inspector parity for `targetBulletId`.

Acceptance criteria
- For any bot, a developer can switch between selected-bot events and full-tick events and search within them.
- Raw tick-events JSON is self-describing enough to paste into bug reports without additional annotation.
- Replay JSON can be copied/downloaded from the UI without opening devtools.

QA checklist
- `pnpm -C apps/web test` (or `pnpm test:all`)
- `pnpm build:all`
- `pnpm qa:workshop -- --serve --url http://127.0.0.1:8787`

---

## Phase 6 — Determinism “golden replay” tests (CI-enforced)

Goal: lock in determinism via checked-in fixtures/hashes so future changes can’t silently alter simulation.

Concrete tasks
- [x] Generate and commit fixtures/hashes under `packages/engine/test/golden/fixtures/`.
- [x] Flip placeholder handling so CI enforces goldens.
- [x] Document fixture update workflow.

Acceptance criteria
- `pnpm golden:check` fails on any replay drift.
- Fixture update is a deliberate action (`pnpm golden:update`) and reviewed like a spec change.

QA checklist
- Generate: `pnpm golden:update`
  - Or run GitHub Actions workflow "Golden fixtures update (Phase 6)" (`.github/workflows/golden-update.yml`) to generate fixtures and open a PR.
- Verify: `pnpm golden:check`
- Full gate: `pnpm qa`

---

## Phase 7 — Deployment unification / reduce duplication

Goal: prevent deploy-time copies drifting from the repo’s authoritative sources.

Completed baseline
- [x] `pnpm sync:deploy`, `pnpm check:deploy`, and `pnpm check:deploy:imports` are in place.
- [x] CI drift guardrails cover the current generated deploy artifacts.

Remaining hardening
- [ ] Expand deploy sync coverage:
  - ensure any new deploy artifacts are generated from authoritative sources.
  - add/update tests so drift fails in CI.
- [ ] Tighten `pnpm sync:deploy` workflow:
  - document when it must be run (and by whom) before releases.
  - ensure it is deterministic (stable formatting and ordering).
- [ ] Workshop deploy smoke checks:
  - validate that `deploy/` Workshop behaves consistently with `apps/web` for a baseline replay.

Acceptance criteria
- `pnpm check:deploy` fails on any drift and produces actionable output.
- Running `pnpm sync:deploy` followed by `pnpm check:deploy` is always green.

QA checklist
- `pnpm check:deploy`
- `pnpm check:deploy:imports`
- `pnpm qa:workshop -- --serve --url http://127.0.0.1:8787`

---

## Phase 8 — Server: daily runner + submissions

Goal: run deterministic daily competitions and accept bot submissions.

Concrete tasks
- [ ] Headless deterministic match runner:
  - accepts bot source + match config
  - runs engine deterministically
  - outputs replay JSON + summary results
- [ ] Storage + retrieval:
  - store bot submissions with versioning
  - store daily match results + replays
- [ ] Submission API:
  - auth
  - validation (size limits, compile/parse limits, timeouts)
  - rate limiting
- [ ] Operations:
  - scheduled daily runs
  - admin tooling to re-run a day with the same seed

Acceptance criteria
- Given a fixed seed and identical bot sources, the server produces the same replay as local engine execution.
- Submissions are validated consistently and failures are explainable (actionable error messages).

QA checklist
- Engine gates: `pnpm -C packages/engine test` + `pnpm golden:check`
- End-to-end (once server exists):
  - submit known bots, run match, fetch replay, compare to local replay (byte-identical or hash-identical)
