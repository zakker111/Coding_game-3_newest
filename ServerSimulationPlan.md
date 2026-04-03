# ServerSimulationPlan.md — Server-Side Battle Simulation (Deterministic Daily Runner)

This document describes how the server should **simulate battles deterministically**, store results/replays, and expose them via API.

It complements:
- `ServerPlan.md` (overall server responsibilities + entity model + endpoints)
- `ArenaPlan.md` (arena topology + sectors/zones)
- `Ruleset.md` (damage attribution, collisions, powerup spawning)
- `BotInstructions.md` (bot VM semantics)
- `CombatPlan.md` (weapons: cooldowns, bullets, grenades, mines)
- `DailyCompetition.md` (daily competition format)

---

## 1) High-level server responsibilities

The server must:

1) **Accept bot submissions** (source text) and validate/compile them.
   - v1 server uses a fixed default loadout for all bots (see `ServerPlan.md`).
2) **Run headless simulations** for daily matches with a deterministic match runner.
3) **Store match artifacts**:
   - results (placements, stats)
   - replay payloads (events + optional checkpoints)
   - version references (ruleset version + bot code hashes)
4) **Serve results and replays** to clients.

Non-goals for v1:
- real-time multiplayer gameplay
- trusting client-side simulation for authoritative outcomes

---

## 2) Determinism contract (non-negotiable)

A match outcome must be reproducible from stored inputs.

### 2.1 Inputs that define a match

A match is fully determined by:
- `ruleset_version`
- `match_seed`
- the 4 participants’ bot code snapshots
  - v1: `{ botId, source_hash, source_text }`
  - future: `{ botVersionId }` (or `{ botId, botVersion, source_hash, compiledIrHash }`)
- spawn placement (derived from seed or explicitly stored)

### 2.2 Banned sources of nondeterminism

- wall-clock time
- system RNG
- iteration over unordered hash maps
- floating point physics unless fixed-point/integerized and strictly specified

### 2.3 Stable ordering rules

The engine must use stable, documented ordering:
- bots update in `BOT1..BOT4` order
- entities update in ascending id order (bullets/grenades/mines/powerups)
- multi-victim AoE damage applies in `BOT1..BOT4` order

---

## 3) Match lifecycle on the server

### 3.1 Daily run creation

At the start of each day:
1) Create a `DailyRun` record with:
   - `run_date`
   - `ruleset_version`
   - `run_seed`
   - `status = planned`
2) Snapshot the participating bots for that run.
   - v1: snapshot `{ botId, source_hash, source_text }` so mid-day edits can’t affect the run.
   - future: snapshot immutable `BotVersion` ids.

### 3.2 Match generation

Generate matches deterministically from `run_seed`:
- choose participants
- assign each match a `match_seed`
- assign spawn slots (`BOT1..BOT4`)

Store each `Match` row with `status = queued`.

### 3.3 Match execution

A match worker:
1) loads the `Match` row + referenced bot code snapshots (v1) or bot versions (future)
2) loads the ruleset implementation pinned to `ruleset_version`
3) executes the simulation to completion (last bot alive) or to a rules-driven end (`tickCap` / `STALEMATE`)
4) writes results + replay
5) marks match as `complete` (or `failed` with error metadata)

### 3.4 One-off (Workshop) simulations

In addition to daily scheduled matches, the same runner supports ad-hoc “sandbox” matches launched from the Workshop UI:
- `POST /api/simulations` creates a `Match` with `kind = sandbox` and enqueues it.
- The runner executes it using the same determinism contract and replay schema as daily matches.
- The client then loads the replay via `GET /api/matches/:matchId/replay`.

---

## 4) Worker architecture (recommended)

For small initial scale (≈10 bots, ≈10 matches/day), you can run **API + worker in a single process** and still keep the architecture compatible with future split services.

---

## 5) Simulation engine boundary

Recommended:
- implement the simulation engine as a **pure library** shared by client and server
- the server remains authoritative by controlling inputs and storing canonical artifacts

A minimal engine interface:
- `initMatch({ rulesetVersion, matchSeed, bots[] }) -> state`
- `step(state) -> { state, events[] }` (one tick)
- `runToEnd(state, tickCap) -> { finalState, events[], stats }`
  - `runToEnd` must stop early if the match ends by rules (`Ruleset.md`: last bot alive / `tickCap` / `STALEMATE`).

---

## 6) Tick loop specification (server-side)

This must align with `Todo.md` and the rules documents.

Implemented tick phases (must match `packages/engine/src/sim/runMatchToReplay.js`):

1) **Bot VM instruction phase** (`BOT1..BOT4`)
   - each alive bot executes exactly 1 instruction
   - emit `BOT_EXEC`
   - bullet spawns (and `BULLET_SPAWN`) happen here when a bot successfully fires

2) **Toggle drains**
   - apply energy drains for active toggles:
     - `SAW`: `energy -= 1` (auto-off at `energy == 0`)
     - `SHIELD`: `energy -= 1` (auto-off at `energy == 0`)

3) **Movement + collision resolution**
   - bot positions are continuous (`pos = {x,y}`) with integer updates
   - stable processing order: `BOT1..BOT4`
   - collision stepping uses integer Bresenham points (see `Ruleset.md` §1.2.1)
   - emit movement/bump events:
     - `BOT_MOVED`, `BUMP_WALL`, `BUMP_BOT`
   - apply bump damage immediately (and emit `DAMAGE` / `BOT_DIED` immediately if it kills)

4) **SAW melee damage**
   - apply saw damage for `sawActive` bots (and emit `DAMAGE` / `BOT_DIED` as needed)

5) **Projectile updates (bullets)**
   - advance bullets, resolve hits/walls/TTL
   - emit `BULLET_MOVE`, `BULLET_HIT`, `BULLET_DESPAWN`, `DAMAGE`, and `BOT_DIED` as applicable

6) **Pickups**
   - process bots in `BOT1..BOT4` order
   - if bot AABB overlaps a powerup anchor point, pick it up
   - emit `POWERUP_PICKUP`, `POWERUP_DESPAWN reason=PICKUP`, and `RESOURCE_DELTA`

7) **End-of-tick maintenance**
   - decrement weapon cooldowns
   - copy per-tick bump flags into `*LastTick` so they are visible on the next tick
   - powerup TTL despawn (`POWERUP_DESPAWN reason=RULES`)
   - powerup spawn timer + spawn (`POWERUP_SPAWN`)
   - clear a bot’s preferred powerup type if that type no longer exists

8) **Match end condition check**
   - detect last bot alive / all dead / stalemate / tick cap
   - emit `MATCH_END` on the tick that ends the match

---

## 7) Bot VM execution (server-side concerns)

On submission:
- parse + validate source
- resolve labels
- compile to a compact deterministic IR/opcode form

Runtime fault policy (locked):
- invalid/malformed instruction at runtime => treat as `NOP`
- bot `pc` resets to `1` next tick

Resource + cooldown enforcement:
- `USE_SLOTn` succeeds only if:
  - slot exists
  - module is ready (`cooldownRemaining == 0`)
  - resources are sufficient (ammo/energy vector)

---

## 8) Replay and audit trail

Replays are critical to user trust.

Minimum replay fields:
- replay header: `ruleset_version`, `match_seed`, per-slot `{ botId, source_hash }` (and v1: `source_text` snapshot), spawn assignments
- per tick:
  - executed instruction trace per bot
  - events (see `ReplayViewerPlan.md`):
    - movement/bump events using bot `fromPos/toPos` (continuous world positions)
    - powerup spawns/pickups (powerups may use `loc` anchors)
    - damage + deaths
    - projectile events

---

## 9) Storage model (server)

Recommended division:
- DB tables store metadata + stats
- object storage stores replay blobs once replays get large

Key requirement:
- every stored replay references `ruleset_version` so future rules changes do not rewrite history.

---

## 10) Decisions required to implement (pick one option per row)

1) Scheduling:
- A) OS cron + HTTP/CLI trigger
- B) in-app scheduler

2) Queue:
- A) DB polling queue
- B) Redis queue

3) Replay storage:
- A) DB (only if small)
- B) object store

4) Auth:
- A) session cookies
- B) JWT
