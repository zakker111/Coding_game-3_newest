# Todo

Near-term engineering tasks and the **current ruleset/engine contract**.

Primary specs (authoritative for `rulesetVersion = 0.2.0`, `schemaVersion = 0.2.0`):
- `Ruleset.md`
- `ReplayViewerPlan.md` (schema contract)

---

## Current status

Recently completed (this merge set)
- Public leaderboard page and latest daily run API shipped.
- Server bot management in Workshop now edits/saves the authenticated user’s own server bots.
- Daily rankings now use saved user/server bots only.
- Placement scoring shipped: 3/2/1/0 points with wins, matches played, and average points.
- Bot language helpers and new `SNIPER` / `ROCKET` / `TELEPORT` modules shipped.
- `schemaVersion = 0.2.0` end-to-end (engine output + deploy artifacts + sample/mock replays).
- Deploy Workshop build tag bumped to **v0.3.5**.
- Example bots updated with locked loadout header directives (`;@slot1/2/3`).
- `packages/replay` sample generator is now **loadout-driven** (no source scanning for SAW/SHIELD).
- Bullet targeting + evasion v1 shipped (`TARGET_CLOSEST_BULLET`, `HAS_TARGET_BULLET()`, `DIST_TO_TARGET_BULLET()`, `MOVE_AWAY_FROM_TARGET`) with deterministic tie-break by numeric bullet creation order.
- Phase 6 golden determinism fixtures committed + enforced in CI.
- Replay contract and deploy Workshop static-contract tests now lock the current 0.2.0 schema/QA surface more explicitly.
- Workshop match setup now allows `BOT2..BOT4` to be set to `None (inactive)` for client-side local inspection runs while keeping randomize opponent-only.

Recently completed (cont.)
- Ranked lifecycle controls shipped in `dailyRunService.js`: `rankedStatus` (`active`/`pending`/`dropped`),
  `rankedActiveLimit` cutoff (default `20`), dropped bots excluded from ranked runs, saving a dropped bot
  marks it `pending`, and post-scoring promote/drop of the top `rankedActiveLimit` eligible bots.
- Polished example bots for `SNIPER`, `ROCKET`, and `TELEPORT` shipped as `examples/bot7..bot9.md`,
  wired into web `exampleBots.ts`, opponents, deploy workshop, and engine compile tests.
- Repeatable admin/dev seed flow added: `scripts/seed-demo.mjs` creates demo users and clones builtin
  example bots into each account against a running server.

Next slice
- ~~User-facing resubmit/ranked-status details in the Workshop UI~~ — shipped: per-bot ranked badges
  (`describeRankedStatus` in `apps/web/src/serverClient.ts`) with Active/Pending/Dropped tone + points,
  shown in the server-bot panel and in the post-save notice in `WorkshopPage.tsx`.
- ~~Admin `/admin` ranked controls UI~~ — shipped: "Ranked ladder controls" panel in `AdminServerPage.tsx`
  lists all submitted bots with status badge + points and Activate/Pending/Drop buttons wired to
  `fetchServerRankedState` / `setServerBotRankedStatus` (`/api/admin/ranked` GET/PATCH) in `serverClient.ts`.
- Balance pass for SNIPER / ROCKET / TELEPORT after populating a league with `scripts/seed-demo.mjs`
  (current constants live in `packages/engine/src/sim/constants.js`).
- Pre-production security hardening before real hosting: password hashing, session store,
  remove default admin, durable storage, rate limiting.
- Hosting: replace temporary dev tunnels (trycloudflare quick tunnels) with a persistent deployment;
  keep frontend + `/api` proxy on one origin (see `ServerPlan.md`).

### Ranked lifecycle plan (shipped backend/admin slice — kept for reference)

Goal: keep daily ranked runs bounded while still letting users improve and re-upload bots.

Recommended bot fields:

```js
{
  rankedEnabled: true,
  rankedStatus: 'active', // 'active' | 'pending' | 'dropped'
  rankedPoints: 0,
  lastRankedRunId: null,
  lastSubmittedAt: null,
  droppedAt: null,
  dropReason: null
}
```

Initial/default behavior:
- New starter user bots begin as `active`.
- Daily eligibility includes saved user/server bots where:
  - `rankedEnabled === true`
  - `rankedStatus` is `active` or `pending`
- Built-in bots remain excluded from ranked daily runs.

Daily run size control:
- Add `rankedActiveLimit` to daily run input/config.
- Recommended early default: `20`.
- If more eligible bots exist than the limit, select deterministically:
  1. `pending` bots first
  2. then `active` bots by previous `rankedPoints` descending
  3. then `botId` ascending
  4. take the first `rankedActiveLimit`

After daily scoring:
- Top `rankedActiveLimit` bots in the run become/remain `active`.
- Lower-ranked eligible bots become `dropped`.
- Store their latest `rankedPoints`, `lastRankedRunId`, `droppedAt`, and `dropReason = 'below_daily_cut'`.

Resubmission loop:
- When a user saves a dropped bot, automatically set:
  - `rankedStatus = 'pending'`
  - `rankedEnabled = true`
  - `lastSubmittedAt = now`
- That bot is included in the next daily run.
- If it places above the cutoff, it returns to `active`; otherwise it drops again.

Admin-first controls:
- Keep ranked controls admin-only for now.
- Add `/admin` controls later for:
  - `rankedActiveLimit`
  - activate/drop/reset bot status
  - ranked bot status table

Publishing recommendation:
- Keep `POST /api/runs/daily` admin-triggered and synchronous while `rankedActiveLimit` is low.
- Move to queued/background processing only when daily run runtime becomes too high.

### Status board

Implemented now
- [x] Explicit per-bot loadouts are the authoritative contract across engine, Workshop, deploy docs, and server planning docs.
- [x] Bullet targeting, example-bot follow-through, and deploy inspector `Target bullet` parity are shipped.
- [x] Replay/debug ergonomics are shipped in both Workshop surfaces.
- [x] Workshop-only inactive opponent slots are available in local match setup and do not widen the server contract.
- [x] Golden determinism guardrails and deploy drift checks are in place.
- [x] Phase 7 release-grade parity/sign-off is in place:
  - node-level deploy-engine parity coverage
  - canonical local release gate (`pnpm qa:release`)
  - deploy/app Workshop parity smoke in the gate
  - actionable browser-runtime diagnostics for `qa:workshop`

Still open
- [x] Phase 9 balance pass (SNIPER/ROCKET/TELEPORT) + admin ranked-controls UI. (Balance harness: `scripts/balance-report.mjs`; SNIPER nerfed to `ammoCost = 6` / `cooldownTicks = 12`; see "Phase 9 balance pass notes".)
- [x] Durable storage verified end-to-end: server boots with `NOWT_SERVER_DATA_FILE=.nowt/server-state.json`, state survives restarts, `.nowt/` is gitignored.
      Production-mode guard: in production the admin password comes from `NOWT_ADMIN_PASSWORD` (superseded: `admin/admin` is never created in production; see Server 0.0.8).
      One-command preview boot documented in README ("Preview deployment" section).
- [ ] Persistent *public* hosting: quick tunnels (`trycloudflare.com`) are session-scoped and URLs rotate on restart.
      For a stable domain, deploy the same two processes (server :3000 + `serve-deploy.mjs` :4173 with `API_PROXY_TARGET`) to any always-on host
      (Fly.io / Render / Railway / VPS) or create a named Cloudflare tunnel. See `ServerPlan.md`.

### Near-term execution checklist

Do next
- [x] Audit `Ruleset.md` and `ReplayViewerPlan.md` against the produced engine/replay output.
- [x] Decide which remaining local-loop drift is real, and which can be explicitly deferred.
- [x] Make the deploy/workshop hardening list concrete enough to execute as one small slice.
- [x] User-facing ranked-status/resubmit details in the Workshop UI (badges + save notice).

Ready after audit
- [x] Admin `/admin` ranked controls: ranked-status table (Activate/Pending/Drop) shipped in `AdminServerPage.tsx`; `rankedActiveLimit` is shown read-only from the latest run.
- [x] Balance new modules (ruleset 0.3.0): 1v1 duel harness `scripts/balance-weapons-duel.mjs` + league `scripts/balance-report.mjs`. Railgun retuned; see "Phase 9 balance pass notes".
- [ ] Balance new modules via seeded daily leagues (`scripts/seed-demo.mjs`) with real player data (not yet run).

### Checklist (done vs. not done)

Done (shipped)
- [x] Docs/spec alignment for `rulesetVersion = 0.2.0` / `schemaVersion = 0.2.0`.
- [x] Workshop build tag visible in `/workshop/`.
- [x] Example bots have `;@slot1/2/3` headers (first 3 non-blank lines in script).
- [x] Explicit per-bot 3-slot loadouts are wired through Workshop/engine (no source scanning).
- [x] Workshop local setup can mark BOT2..BOT4 as inactive (`None`) for local-only inspection runs; randomize still picks real opponents.
- [x] Server planning docs now use the same explicit per-bot loadout contract as the engine.
- [x] ARMOR implemented and tested (mitigation + speed penalty; SHIELD→ARMOR ordering).
- [x] Golden determinism fixtures committed and `pnpm golden:check` is strict.
- [x] Bullet targeting + `MOVE_AWAY_FROM_TARGET` available and smoke-tested.

Next up
- [x] Phase 4: correctness + invariants hardening.
- [x] Phase 5: replay/debug parity + Workshop export affordances.
- [x] Phase 5b: source-line / `pc` highlighting in the Workshop editor.
- [x] Local-loop hardening: close the remaining deploy/workshop parity and release-sign-off guardrails.
- [x] Bullet-targeting follow-up: examples and remaining deploy parity UX.
- [x] Deploy/workshop parity: legacy deploy Workshop mirrors the React replay loadout warnings.
- [x] Phase 8A: sandbox server runner (inline submissions + deterministic runs + replay retrieval).
- [x] Phase 8B: server-backed Workshop simulations (Workshop server mode + local-mirror parity).
- [x] Phase 8C: ranked lifecycle (active/pending/dropped, rankedActiveLimit, promote/drop), example bots bot7..bot9 (SNIPER/ROCKET/TELEPORT), and `scripts/seed-demo.mjs` admin/dev seed flow.

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
- Implemented module ids (`@coding-game/ruleset` catalog): `BULLET`, `SAW`, `SHIELD`, `ARMOR`, `GRENADE`, `MINE`, `REPAIR_DRONE`, `SNIPER`, `ROCKET`, `TELEPORT`.

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
- Phase 9 modules (constants in `packages/engine/src/sim/constants.js`):
  - SNIPER: `damage = 25`, `ammoCost = 6`, `cooldownTicks = 12` (tuned up from `4`/`10` in the Phase 9 balance pass — see `scripts/balance-report.mjs`)
  - ROCKET: `ammoCost = 8`, `cooldownTicks = 12`, `speed = 3/tick`, `fuse = 24`, `ttl = 60`, damage `center = 35` / `adjacent = 15`
  - TELEPORT: `energyCost = 30`, `cooldownTicks = 14`

### Phase 9 balance pass notes (scripts/balance-report.mjs)
- Harness runs a round-robin league of `examples/bot0..bot9` across N seeds (`BALANCE_SEEDS`, default 10; `BALANCE_TICK_CAP`, default 240).
- Findings (30-seed run, pre-tune): SNIPER bot dealt ~208 dmg/game at old cost/cooldown and out-sustained every weapon; ROCKET bot dealt 221/game but never won or died (slow rocket + ARMOR stalemate); TELEPORT bot had 0 kills (utility module, no damage output) and died to aggressive tables.
- Action taken: raised SNIPER to `ammoCost = 6`, `cooldownTicks = 12`. This caps a full-ammo burst at ~16 shots (~400 dmg vs 300 total table HP) and gives ammo pickups real weight for snipers.
- Accepted as-is (documented behavior, not bugs):
  - ROCKET stalemates: high center damage + slow travel means rockets trade well defensively; example bot is built to survive, not close. Balance target met after sniper nerf (rocket dmg/game now comparable to top DPS bots without dominating wins).
  - TELEPORT zero kills: teleport is a mobility/utility module; kill contribution comes from bumps/follow-up weapons. Example bot loadout intentionally has no damaging slot.
- Golden fixtures unaffected (`node --test test/golden`: 4/4 pass); deploy mirror re-synced with `node scripts/sync-deploy.mjs`.
- Ruleset 0.3.0 pass (`scripts/balance-weapons-duel.mjs`, 20 seeds, passive 100-HP dummy, tickCap 240):
  - Per-100-AMMO single-target ceiling (cost × cooldown math, before duel): BULLET ~500, ROCKET ~420, SNIPER ~400, GRENADE ~290, RAILGUN was ~160.
  - Action: RAILGUN `ammoCost 12→8`, `cooldown 22→18`, `damage 20/12→24/10`. Single-target ceiling is now ~290 (on par with GRENADE). Killing the dummy: 53→41 ticks.
  - League after the change (`balance-report.mjs`, 10 seeds): RAILGUN bot (bot11) still wins 10/10, kills 20→10, dmg/game 88→94.
  - Open: SNIPER bot (bot7) is still the top league performer (151 dmg/game, 20 kills, 10/10 survival). Not changed here because SNIPER is outside the 0.3.0 track.
  - Open: PULSE bot (bot12) has 0 kills and 0 survival in the league. PULSE is a utility/stun module by design, so direct damage is kept at 10.
- Step 3 balance pass (engine fix + harness, no constant changes):
  - Bug fixed: CLOAK was not broken by SNIPER, GRENADE/ROCKET or SAW damage. Before the fix, CLOAK+SNIPER beat an active BULLET hunter 20/20 (42 HP left). After the fix it is 20/20 mutual kills, 0 wins. Regression test: `simNewModules.test.js` "attacking while cloaked breaks the cloak (SNIPER)".
  - `scripts/balance-weapons-duel.mjs` now has an active matchup (attacker vs BULLET hunter that moves and fires back), reporting win / loss / mutualKill / timeout.
  - Active duel (20 seeds, after fix): BULLET 0 wins / 1.00 mutual; SNIPER 0.10 win; RAILGUN 1.00 mutual; PULSE 0.90 mutual / 0.10 loss; CLOAK+SNIPER 1.00 mutual. CLOAK adds little in these duels.
  - SNIPER still leads the league (bot7: 1.00 win, 151 dmg/game over 30 seeds). Tested and reverted: `SNIPER_DAMAGE` 25→20 (dmg/game rose to 163, no gain); `SNIPER_COOLDOWN_TICKS` 12→16 (no change). Conclusion: no clean constant change is supported yet.
  - Open: CLOAK buff or keep as niche module (decision pending).

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
- `pnpm qa:release`

Workshop QA contract (keep stable or update the QA script alongside UI changes):
- `/workshop` must resolve/redirect to `/workshop/` (relative module imports depend on trailing slash).
- `scripts/qa-workshop.mjs` relies on these IDs existing: `runBtn`, `randomizeOpponentsBtn`, `scrub`, `tickLabel`, `runNotice`, `inspectStats`, `tickEventsAllBtn`, `tickEventsRawBtn`, `tickEventsFilterInput`, `tickEventsFilterStatus`, `tickEventsList`, `eventLog`.
- Treat `pnpm qa:workshop` as **required** when changing `deploy/workshop/*` or `scripts/qa-workshop.mjs`.

---

## Phase 0.3+ — Post-0.0.2 hardening (keep `rulesetVersion = 0.2.0`)

Goal: close out alignment work, reduce drift, and make the existing loop “boringly reliable” before adding new mechanics.

Concrete tasks
- [x] Close the remaining Phase 7 deploy parity gaps:
  - node-level deploy-engine replay parity test
  - build + deploy/app Workshop smoke in the release gate
  - actionable Playwright runtime diagnostics
- [x] Keep `pnpm sync:deploy` / `pnpm check:deploy` deterministic and documented.
- [ ] Keep future local-loop hardening additive while Phase 8 starts.

Acceptance criteria
- `pnpm qa:release` is green in a browser-capable environment.
- A replay generated twice with the same seed produces byte-identical replay JSON (or matches golden hash, once Phase 6 is complete).
- `pnpm check:deploy` passes and `pnpm sync:deploy` is a no-op after it runs.

QA checklist
- `pnpm qa:release`
- `pnpm -C packages/engine test:golden`

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
- [x] Node-level deploy-engine replay parity is covered by test.
- [x] The canonical local release gate now includes build + deploy/app Workshop parity smoke.
- [x] `qa:workshop` reports actionable browser-runtime dependency failures.

Acceptance criteria
- `pnpm check:deploy` fails on any drift and produces actionable output.
- Running `pnpm sync:deploy` followed by `pnpm check:deploy` is always green.
- `pnpm qa:release` is the single documented local sign-off path.

QA checklist
- `pnpm check:deploy`
- `pnpm check:deploy:imports`
- `pnpm qa:release`

---

## Phase 8 — Server: daily runner + submissions

Goal: start with a narrow sandbox runner, then expand to persistent submissions and scheduled daily competition.

### Phase 8A — sandbox runner MVP

Status: ✅ shipped in `apps/server`

Concrete tasks
- [x] Headless deterministic match runner:
  - accepts inline bot source + explicit loadout snapshots
  - runs the shared engine deterministically
  - outputs replay JSON + summary results
- [x] HTTP surface:
  - `GET /api/ruleset`
  - `POST /api/simulations`
  - `GET /api/matches/:matchId`
  - `GET /api/matches/:matchId/replay`
- [x] Storage boundary:
  - in-memory match/replay store for the first slice
  - explicit match lifecycle (`queued|running|complete|failed`)
- [x] Validation:
  - source normalization + size limits
  - compile errors surfaced as actionable `400` responses
  - loadout normalization preserved in participant snapshots

Acceptance criteria
- Given a fixed seed and identical bot sources, the server produces the same replay as local engine execution.
- Match metadata and replay retrieval work over HTTP.
- Server validation failures are explainable (actionable error messages).

QA checklist
- `pnpm -C apps/server test`
- `pnpm -C apps/server build`
- `pnpm test:all`
- `pnpm build:all`

### Phase 8B — server-backed Workshop simulations

Goal: connect the existing Workshop UI to the shipped sandbox server runner while preserving the current local run path.

Shipped daily/admin baseline:
- [x] Default `admin` / `admin` account is created on server boot.
- [x] Simple JSON database layer persists users, sessions, user bots, matches, and daily runs.
- [x] Landing page has a minimal login form.
- [x] `/admin` shows a minimal server sandbox for daily runs, daily matches, and points.
- [x] `POST /api/runs/daily` is admin-only.
- [x] Daily runs schedule all eligible saved/builtin bots across deterministic 4-bot combinations.
- [x] Daily run leaderboard includes points and matches played.
- [x] Server bots persist explicit loadouts and daily runs use saved bot loadouts.

Still open:
- [ ] Security hardening: move beyond the current simple local JSON database defaults before production.
  - User passwords should be stored with production-grade password hashing/encryption policy.
  - Sessions should use secure cookie settings and expiry.
  - The default `admin` / `admin` account must be removed or forced to rotate before public deployment.
- [ ] Add a normal user-facing account/bot management flow beyond the minimal admin tools.
- [ ] Add a Workshop “run on server” flow for the current local setup.

Concrete tasks
- [ ] Add a Workshop control/path for running a match through the server.
- [ ] Serialize the current 4-bot setup into the `/api/simulations` request shape:
  - `seed`
  - `tickCap`
  - participant `slot`
  - participant `displayName`
  - participant `sourceText`
  - participant explicit `loadout`
- [ ] Fetch the returned replay from `/api/matches/:matchId/replay`.
- [ ] Render the server replay in the existing replay viewer.
- [ ] Display server errors clearly:
  - invalid request
  - source size limits
  - compile errors with slot details
  - failed match lifecycle
- [ ] Keep Workshop-only inactive opponent slots local-only unless a server contract change is made deliberately.

Acceptance criteria
- The Workshop can run the same active 4-bot setup locally or through the server.
- Server replay JSON renders without schema changes.
- Server validation errors are actionable in the UI.
- Existing local Workshop behavior remains intact.

QA checklist
- `pnpm -C apps/server test`
- `pnpm -C apps/web test`
- `pnpm build`

### Later in Phase 8

- [ ] Harden persistent submissions/versioning beyond the current server baseline.
- [ ] Durable replay/match storage.
- [ ] Production-grade auth/session hardening + rate limiting.
- [x] Scheduled daily runs (once a day, `NOWT_DAILY_RUN_HOUR_UTC`, default 03:00 UTC; commit `412cf85`).
- [ ] Admin tooling for daily runs (manual trigger UI, run history).

## Phase 10 — Game expansion (proposed)

Rules for this phase
- Language and module changes that alter simulation results bump `rulesetVersion` (next: `0.4.0`) and need golden-replay updates.
- Every new feature ships with tests and a `Versions.md` entry.
- Balance changes go through `scripts/balance-weapons-duel.mjs` and `scripts/balance-report.mjs` before merging.

### 10.1 Bot language: sensor queries
- [ ] Add arena sensors: `DIST_TO_WALL()`, `MY_SECTOR()`, `ENEMY_COUNT()`, `ALLY_COUNT()` (if team modes land), `SECTOR_OF(<LOC>)`.
- [ ] Define each sensor in `BotInstructions.md` §2 with its exact return values and edge cases.
- [ ] Compiler: accept sensors in `IF (...)` conditions; reject them as targets with a clear compile error.
- [ ] Tests: sensor values at walls, corners, sector borders; determinism across seeds.
- Acceptance: a bot can write `IF (DIST_TO_WALL() < 5) DO MOVE_AWAY_FROM_WALL` and the match replays identically on every run.

### 10.2 Bot language: variables and memory
- [ ] Add spare registers (`V1..V4`) with `SET_V<n> <value>`, `ADD_V<n> <value>`, and read in conditions.
- [ ] Add event memory: `LAST_HIT_TICK()`, `LAST_HIT_SECTOR()`, `LAST_HIT_BY()` so a bot can remember where and by whom it was hit.
- [ ] Registers reset at match start and are included in replay bot state for debugging.
- [ ] Cap the number of register writes per tick at 1 (keeps one-instruction-per-tick rule intact).
- Acceptance: a bot can flee to its last safe sector after being hit twice in 10 ticks.

### 10.3 New modules (finish `docs/NewWeaponsProposal.md`)
- [ ] JETPACK (movement): short burst movement with energy cost and cooldown; counters slow-moving weapons (ROCKET, RAILGUN lines), loses to SAW at close range.
- [ ] DECOY (fake target): spawns a bot-shaped decoy that enemy `TARGET_CLOSEST` can pick; counters aimed weapons, loses to SHIELD/ARMOR builds that ignore targeting.
- [ ] SWARM: multiple small drones with limited lifetime; counters single-target weapons, loses to MINE and GRENADE area damage.
- [ ] Each module: ruleset constants, sim implementation, duel-harness numbers, one example bot in `examples/`.
- [ ] Update the module catalog in `packages/ruleset` and fix the stale module lists in `Ruleset.md` and `BotInstructions.md` in the same change.

### 10.4 Counter design rule
- [ ] Write the rule in `Ruleset.md` §A: every module must have at least one named counter it beats and one it loses to.
- [ ] Add a "counter matrix" check to the balance harness: for each module pair, a 1v1 duel with fixed loadouts; fail CI if any module wins more than 70% of its duels across seeds or loses 100%.
- [ ] Re-run the matrix on every balance change; publish the result table in `Versions.md`.
- Acceptance: no module is an always-win or always-lose in the matrix; the league top 5 contains at least 3 distinct loadout families.

### 10.5 Fork and edit
- [x] "Fork" action on any builtin or public player bot: copies source and loadout into the forker's account as a new bot with `forkedFrom` metadata.
- [x] Forked bots start as `pending` in the daily league until the owner saves a change.
- [x] Attribution shown on the bot page (original owner and bot name).
- [x] Permission: only public bots are forkable; players can make a bot private.
- Acceptance: a player can fork `bot11` from the Workshop, change one line, and save; the fork shows `forkedFrom: builtin/bot11`.

### 10.6 Replay viewer for daily results
- [x] Each daily run page lists the player's matches with win/loss and points.
- [x] Clicking a match opens the existing replay viewer for that server-run match (depends on Phase 8 "Render the server replay").
- [x] Add a "why did I lose" summary per match: first damage taken, last bot alive, final energy/ammo, and the bot's last 5 instructions executed.
- Acceptance: a player who lost a match can open the replay and see the tick where they took the most damage.

### 10.7 Durable storage
- [x] Move bots, replays, and daily results out of the local JSON file into a managed database (Postgres or the platform's DB; decide before coding).
- [x] Migration path: one-time import of the existing `.nowt/server-state.json`.
- [x] Keep the in-memory store for tests; add an integration test against the real database (`TEST_DATABASE_URL`).
- [x] Backup/export tool and restore (`apps/server/src/tools/backup.js`); steps in `DEPLOY.md` section 6.
- [x] Store replays as gzip+base64 with a size cap (`MAX_STORED_REPLAY_BYTES`, 2 MB compressed); old plain replays still load.
- [x] Retention: keep the newest `NOWT_REPLAY_RETENTION` sandbox replays (default 500, 0 = keep all). Older matches keep their result but lose their frames. Documented in `DEPLOY.md`.
- Acceptance: restart or redeploy the server and bots, runs, and replays are all still there.

### 10.8 Elo-style ranking
- [x] Replace raw points with an Elo or Glicko-style rating per bot, updated from each match result (4-player matches: use placement-based pairwise updates).
- [x] Start new bots at a provisional rating with high volatility; reduce volatility after a set number of matches.
- [x] Keep the old points for history; show rating and provisional flag on the leaderboard.
- [x] Unit tests with fixed inputs; a backfill script that recomputes ratings from stored results.
- [x] Acceptance: when the daily field size changes from 4 to 20 bots, a stronger bot's rating still rises faster than a weaker one's, verified with the seeded demo data.

### Suggested order
1. 10.7 Durable storage (everything else depends on stored results).
2. 10.8 Elo ranking (needs stored results; changes what "winning" means).
3. 10.6 Replay viewer for daily results (needs stored replays).
4. 10.5 Fork and edit (small, high player value).
5. 10.1 Sensor queries, then 10.2 variables (language, bumps ruleset to 0.4.0).
6. 10.4 Counter rule and 10.3 new modules (balance work, after the language is stable).

