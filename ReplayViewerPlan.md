# ReplayViewerPlan.md — Battle Picker + Replay Viewer (Client-first, Server-ready)

This document defines the **replay UX** and **replay data contract** needed to:
- visually watch what happened (bullets, grenades, mines, bumps)
- inspect per-bot code execution (tick + current instruction)
- let registered users review server-run matches from the browser

It is written **client-first** (local simulations), but designed so the same UI works with **server-provided replays** later.

It complements:
- `UIPlan.md`
- `ArenaPlan.md`
- `ServerSimulationPlan.md`
- `Ruleset.md`
- `CombatPlan.md`

---

## 1) UX goals

- **Battle picker / match history**: list and open past matches.
- **Deterministic playback**: the UI is a pure view over replay data.
- **Tick-based but smooth**: simulation/replay data is tick-indexed, but while playing the viewer can interpolate motion within a tick for readability.
- **Debugging-first**:
  - show tick number
  - show which bot instruction executed
  - show why an action happened / no-op happened
- **Visual correctness**:
  - sector + zone grid visible
  - bullets moving smoothly as continuous projectiles
  - grenade fuse + detonation
  - mine placement, arming, trigger, detonation
  - wall bumps + bot bumps
  - powerup spawns + pickups

---

## 2) Screens (client)

### 2.1 Match History (Battle Picker) (post-v1)

v1 note:
- The v1 Workshop only needs an **in-memory replay for the most recent run**.
- A persistent replay library / match history UI is post-v1 (can be added without changing simulation rules).

Entry points (post-v1):
- after finishing a local match: **Save Replay** / **View Replay**
- top nav: **Matches**

List item fields (minimum):
- match id
- timestamp
- mode:
  - v1 workshop preview uses `1v1v1v1` (4 bots)
  - optional client-only debug mode (post-v1): `1v1`
- participant display names + appearance (v1: color; future: image/GIF)
- placement / winner
- quick actions: **Open**, **Delete** (local-only)

### 2.2 Replay Viewer (Match Screen)

Core regions (align with `UIPlan.md`):
- arena viewport (3×3 sectors, each with 2×2 zones)
- right inspection panel (bot list + code, with optional instruction reference/help)
- bottom timeline (ticks)
- optional event log

Playback controls (v1 minimum):
- play/pause
- step +1
- step -1 (only if the replay storage strategy supports reverse seeking)
- scrub to tick
- speed presets

Inspection:
- clicking a bot focuses it in the right panel
- highlight executed line (`pc`) at the current tick
- show per-tick result (executed/no-op/error) + reason

### 2.3 Viewer state model + deep-linking (recommended)

Treat the viewer as a pure function of:
- `(replayData, playheadTick, selectedBotId)`

Recommended URL params (so refresh/share works):
- `tick` (playhead)
- `bot` (selected bot)
- `speed` (playback)
- `follow` (for live runs)

Live simulation mode (local runner):
- support **Follow Live** (auto-advance playhead to newest tick)
- if the user scrubs back, disable Follow Live automatically
- provide **Jump to Live** button

---

## 3) Replay data contract (format)

A replay should support 2 independent requirements:
- **visual state** at tick `t`
- **debug trace** explaining how that state happened

### 3.1 Header (required)

Compatibility rules (reader + writer):
- Replay readers must **ignore unknown header fields** (forward-compatible).
- Fields documented as optional may be omitted in older schema/ruleset versions; readers must apply the defaults described below.
- For `rulesetVersion >= 0.2.0` (including `0.2.0`), replay writers are expected to include `bots[].loadout` and may include `bots[].loadoutIssues` (recommended when non-empty).

Current repo contract (engine output):
- `schemaVersion = "0.2.0"`
- `rulesetVersion = "0.2.0"`

- `schemaVersion`
- `rulesetVersion`
- `ticksPerSecond` (so “1× playback” can mean real time for that ruleset version)
- `matchSeed`
- `tickCap`
  - meaning: the **last valid tick index available in this replay**
  - for current engine output, this may be **less than** the requested input tick limit if the match ended early
- `bots[]`:
  - `slotId` (`BOT1..BOT4`)
    - **Important:** this is the **match slot id** (deterministic engine identifier), not a user bot identity.
    - Future-proofing: stable bot identity/version live in `botRef` fields below.
  - `displayName`
  - `appearance` (presentation-only; must not affect determinism)
    - v1 required (placeholder): `{ kind: "COLOR", color: "#RRGGBB" }`
    - future (images/gifs):
      - `{ kind: "IMAGE", fallbackColor: "#RRGGBB", avatarRef: { assetId?, contentHash?, url? } }`
      - `fallbackColor` is used when the image cannot be loaded.
      - `avatarRef` is an immutable-ish reference the viewer can resolve via:
        - server asset registry (`assetId`)
        - content-addressed storage (`contentHash`)
        - or a direct URL (`url`) when appropriate
    - Replay size rule: **do not embed large image bytes** in the replay. Replays should carry only fallbacks + refs.
  - `loadout` (rulesetVersion-specific module loadout; 3 slots)
    - encoding: `[slot1, slot2, slot3]` (SLOT1..SLOT3), where each entry is a module id (`"<MODULE_ID>"`) or `null` (EMPTY slot)
    - for `rulesetVersion >= 0.2.0` (including `0.2.0`):
      - **expected to be present** in the replay header and should already be the engine’s **resolved/normalized** loadout
      - viewer compatibility rule: if a replay omits `loadout`, the viewer must treat it as **all empty**: `[null, null, null]`
      - do not do source-text scanning for `rulesetVersion >= 0.2.0`
    - **legacy (`rulesetVersion = 0.1.0`)**:
      - replays typically omit `loadout` because explicit per-bot loadouts did not exist
      - viewer may derive a *display* loadout from `sourceText` (if present):
        - `slot1 = (sourceText contains token "SAW" ? "SAW" : "BULLET")`
        - `slot2 = (sourceText contains token "SHIELD" ? "SHIELD" : null)`
        - `slot3 = null`
      - This is a **viewer-only fallback** for old replays; it does not imply source scanning is part of the current engine (`rulesetVersion >= 0.2.0`).
      - if `sourceText` is not available (common for some server-run matches), default the display loadout to: `["BULLET", null, null]`
  - `loadoutIssues` (optional but recommended; informational only)
    - used by `rulesetVersion >= 0.2.0` when the engine had to normalize/coerce an invalid loadout
    - for `rulesetVersion = 0.2.0`:
      - expected to be present when non-empty
      - may be omitted when empty (viewer default must be `[]`)
    - when present:
      - `Array<{ kind: 'UNKNOWN_MODULE'|'DUPLICATE'|'MULTI_WEAPON', slot: 1|2|3, module?: string }>`
      - `slot` refers to the 1-based slot index in `[slot1, slot2, slot3]`
    - if omitted, the viewer should default to an empty list: `[]`
    - viewer UX: show a **visible, non-blocking warning/error** indicator on the bot (e.g. in the bot list) and surface the issue list in the bot inspector (e.g. under a “Loadout” section); do not refuse to load the replay
  - `sourceText` (or `sourceHash` + URL)
  - future (server / library):
    - `botRef`: `{ botId, botVersion?, sourceHash?, compiledIrHash? }`
      - `botId` here is the stable identity (e.g. `alice/greedy`, `builtin/chaser-shooter`)
      - `botVersion` is an immutable snapshot identifier (server assigned)

(See `BotModelPlan.md` for the full identity/version model.)

### 3.2 Two storage strategies

#### A) Full state per tick (simplest v1)

- store a full `state` snapshot every tick

Pros:
- simplest UI seeking
- reverse stepping is trivial (step -1 just loads tick-1)

Cons:
- large payloads

#### B) Event log + checkpoints (recommended)

- store:
  - initial state
  - checkpoints every N ticks (e.g., 25–50)
  - per-tick event lists

Pros:
- efficient

Cons:
- UI needs reconstruction logic
- reverse stepping requires checkpoints (otherwise you must replay events from the start)

Client-first recommendation:
- start with **A** for local testing
- move to **B** once replays get large / server storage matters

### 3.3 Tick semantics (must be explicit)

To keep rendering, scrubbing, and "what happened on tick t" consistent across clients:

- Convention (recommended for v1):
  - `state[0]` represents the **initial pre-tick state**.
  - `events[0]` is `[]`.
  - for `t >= 1`, `state[t]` represents the **end-of-tick state** for tick `t`.
  - for `t >= 1`, `events[t]` are the ordered events that occurred **during tick `t`** to transform `state[t-1] → state[t]`.

Notes:
- Tick `0` is the initial state before any tick processing (so `state[0]` is "start of match").
- `replay.tickCap` is the last valid playhead tick in the replay, so viewers should expect `state.length === events.length === tickCap + 1`.
- Under this convention, viewers that render purely from `state[t]` will match "after resolution" visuals (moves applied, bullets advanced, hits applied, pickups applied, deaths resolved).
- The per-tick event list remains the canonical explanation/debug log for how `state[t]` was reached.
- Compatibility rule for bot state fields:
  - viewers must ignore unknown `state[t].bots[]` fields
  - for `rulesetVersion >= 0.2.0`, replay writers may include optional debug fields such as `targetBulletId`
  - if `targetBulletId` is omitted, viewers should treat it as `null`

Rendering note (smooth playback; required for v1 Workshop/replay viewer):
- For tick `t`, treat `state[t-1]` as the **start-of-tick** state and `state[t]` as the **end-of-tick** state.
- While playing, compute an intra-tick progress `p ∈ [0,1]` and interpolate *positions* from `start → end`.
  - Keep non-positional state (HP/ammo/energy, deaths, pickups) snapped to tick boundaries.
- When converting world positions to pixels, use integer scale + DPR and round final positions to integer CSS pixels for crisp/pixel-perfect rendering (see `ArenaVisualPlan.md` §2.6).
- When paused/scrubbing/stepping, render at `p=1` (end-of-tick) so the playhead tick matches `state[t]`.

---

## 4) Event types needed for correct visualization

The UI should not infer combat; it should render what the replay says.

Event ordering + compatibility:
- The per-tick `events[]` list is ordered. When multiple events happen in the same tick (e.g., burst shots), the array order is the canonical sequence the viewer should use.
- Unknown event types should be ignored (so older viewers can still open newer replays).

Tick field convention:
- Events are stored under `events[t]`, so the **tick is implied** by the container.
- Individual event objects may include `tick` for redundancy/debugging, but it is optional and must match the container tick.

### 4.1 Bot execution trace

- `BOT_EXEC`:
  - `botId`
  - `tick` (optional; redundant; must match the container tick)
  - `pcBefore`, `pcAfter`
  - `instrText` (or `instrIndex`)
  - `result`: `EXECUTED | NOP | ERROR`
  - `reason` (optional): a stable enum (see below)

Trace conventions (current engine behavior; keep consistent with `packages/engine/src/sim/runMatchToReplay.js` + `packages/replay/src/index.d.ts`):
- **Invalid/malformed instruction** (runtime policy in `BotInstructions.md`):
  - treat as no-op for gameplay
  - set `result = NOP`
  - set `reason = INVALID_INSTR`
  - set `pcAfter = 1` (the post-tick state has `pc = 1`)
- **Valid instruction that no-ops** due to cooldown/resources/invalid target/etc.:
  - set `result = NOP`
  - set `reason` accordingly
  - `pcAfter` advances as normal (unless the instruction defines special control-flow)

Note:
- The `ERROR` value remains in the schema for forward compatibility, but the current engine emits `NOP` for invalid instructions.

Current engine `reason` values (`rulesetVersion = 0.2.0`):
- `INVALID_INSTR`
- `NO_MODULE`
- `NO_EFFECT` (valid instruction but no gameplay effect, e.g. using/stopping a non-usable/passive module)
- `COOLDOWN`
- `NO_AMMO`
- `NO_ENERGY`
- `INVALID_TARGET_KIND`
- `INVALID_TARGET`

Compatibility note:
- viewers should ignore unknown future `reason` strings additively, but `INVALID_LOC` is **not** currently emitted by the shipped engine

### 4.2 Positions (`pos`) and anchor locations (`loc`)

**Bots are represented with continuous world positions**. Projectiles (bullets) are continuous and always use world positions.

Powerups may still use deterministic **anchor locations** (`loc`) for compact replay encoding (spawn/pickup points).

#### Continuous positions (`pos`) (bots + projectiles)

Encode a continuous position as:
- `pos = { x, y }` in **arena world units** (see `ArenaPlan.md` / `UIPlan.md` sizing), where `(0,0)` is the arena top-left and `(192,192)` is the arena bottom-right outer wall.
- `pos` is continuous: bots do not snap to grid intersections/anchor points. (Some movement *targets* may be described as “go to sector/zone center”, but the resulting positions remain continuous.)
- Bounds convention:
  - Outer wall is at `x=0`, `x=192`, `y=0`, `y=192`.
  - **Bots** (16×16 hitbox centered at `pos`) should have centers clamped to `x ∈ [8,184]`, `y ∈ [8,184]` (see `ArenaPlan.md`).
  - **Projectiles** may use the full `0..192` range and are removed on wall impact.

Rendering conventions:
- Bots should always have `pos` in `state[t]`.
- When paused/scrubbing/stepping, render exactly `state[t].bots[].pos`.
- For hit/collision visuals/explanations, treat each bot as having a **16×16** axis-aligned hitbox (AABB) centered at the bot’s world position.

Derived region (for UI overlays/tooltips; not an authoritative gameplay position encoding):
- Given `pos`, the viewer may compute `sector (1..9)` and `zone (1..4)` by grid partitioning:
  - `sectorCol = clamp(floor(x / 64), 0, 2)`
  - `sectorRow = clamp(floor(y / 64), 0, 2)`
  - `sector = sectorRow * 3 + sectorCol + 1`
  - `inSectorX = x - sectorCol * 64`, `inSectorY = y - sectorRow * 64`
  - `zoneCol = clamp(floor(inSectorX / 32), 0, 1)`
  - `zoneRow = clamp(floor(inSectorY / 32), 0, 1)`
  - `zone = zoneRow * 2 + zoneCol + 1`

#### Anchor locations (`loc`) (powerups)

Encode an anchor location as:
- `loc = { sector: 1..9, zone: 0..4 }`
  - `zone=0` means sector center
  - `zone=1..4` means zone center

Rendering conventions:
- If an entity includes both `loc` and `pos`, the viewer should prefer `pos` for rendering.
- If an entity has only `loc`, the viewer should derive a render position by mapping the anchor to its world-space center (sector/zone center).

### 4.3 Movement + bumps

- `BOT_MOVED`:
  - `botId`
  - `fromPos` (a `pos`; see §4.2)
  - `toPos` (a `pos`; see §4.2)
  - `dir` (optional; `UP|DOWN|LEFT|RIGHT|UP_LEFT|UP_RIGHT|DOWN_LEFT|DOWN_RIGHT`)
  - `tick` (optional; redundant; must match the container tick)

Semantics:
- Emit `BOT_MOVED` when the bot’s resolved position changes during the tick.
- In tick `t`, `fromPos` should match the bot position in `state[t-1]`, and `toPos` should match the bot position in `state[t]`.
- If `dir` is present it is the bot’s chosen move direction for the tick.

- `BUMP_WALL`: `botId`, `dir`, `damage` (`dir` is `UP|DOWN|LEFT|RIGHT|UP_LEFT|UP_RIGHT|DOWN_LEFT|DOWN_RIGHT`)
- `BUMP_BOT`: `botId`, `otherBotId`, `dir` (`dir` is `UP|DOWN|LEFT|RIGHT|UP_LEFT|UP_RIGHT|DOWN_LEFT|DOWN_RIGHT`)

Semantics:
- Bump events are the canonical signal for “collision / blocked movement” feedback.
- A bump does not by itself define the bot’s final position; the authoritative end-of-tick position is still `state[t].bots[].pos`.

Rendering note (required for v1):
- While playing, the viewer should apply a small deterministic “bounce” visual effect during tick `t` using the bump `dir` (see `ArenaVisualPlan.md` §5.7). When paused/scrubbing (render `p=1`), the bounce offset is `0`.

Determinism note:
- If multiple bump events for the same `botId` exist in `events[t]`, the viewer should use the **last** one in event order for the bounce direction.

### 4.4 Powerups

Timing note:
- `POWERUP_SPAWN` happens during end-of-tick maintenance (after pickups). A powerup spawned on tick `t` is first eligible to be picked up on tick `t+1`.

- `POWERUP_SPAWN`:
  - `powerupId`, `powerupType`, `loc`
- `POWERUP_PICKUP`:
  - `botId`, `powerupId`, `powerupType`, `loc`
- `POWERUP_DESPAWN`:
  - `powerupId`, `reason` (`PICKUP|RULES`)

Note:
- In events, the `type` field is reserved for the event discriminator (e.g. `"POWERUP_SPAWN"`), so the powerup's kind is carried as `powerupType`.

### 4.5 Resources

- `RESOURCE_DELTA`: `botId`, `ammoDelta`, `energyDelta`, `healthDelta`, `cause`
  - current engine `cause` values:
    - `SHOOT`
    - `SAW_DRAIN`
    - `SHIELD_DRAIN`
    - `PICKUP_HEALTH`
    - `PICKUP_AMMO`
    - `PICKUP_ENERGY`

### 4.6 Projectiles (bullets; continuous)

Bullets are continuous projectiles and must be represented with world positions.

Optional fields (not required in v1) support future weapons/features:
- burst fire sequences (group shots fired as a burst)
- non-linear trajectories (e.g., wavy)

- `BULLET_SPAWN`:
  - required: `bulletId`, `ownerBotId`, `pos`, `vel`
    - `pos`: `{ x, y }` (world units; see §4.2)
    - `vel`: `{ x, y }` (world units per tick; integer/fixed-point)
  - optional:
    - `radiusUnits` (number >= 0; `0` means point projectile)
    - `targetBotId` (debug/metadata)
    - `targetPos` (debug/metadata; target bot world position at fire time)
    - `weaponId` (module id or weapon name, e.g. `BULLET_MK1`)
    - `burst` (burst grouping; omitted for non-burst shots):
      - `burstId` (string)
      - `shotIndex` (0-based)
      - `shotsInBurst` (int)
    - `speedUnitsPerTick` (number > 0; informational; if present, should match `|vel|`)
    - `trajectory` (viewer hint; if omitted, treat as linear):
      - `kind`: `LINEAR | WAVY`
      - `amplitudeUnits` (number; for `WAVY`)
      - `periodTicks` (number; for `WAVY`)
      - `phase` (number; for `WAVY`)

- `BULLET_MOVE`:
  - required: `bulletId`, `fromPos`, `toPos`
  - semantics:
    - this describes the bullet’s resolved motion during the tick (after collision resolution)
    - if the bullet hit a bot or wall during the tick, `toPos` should be the impact point

- `BULLET_HIT`:
  - required: `bulletId`, `victimBotId`, `damage`
  - optional:
    - `hitPos` (world position of impact; if omitted, viewers may assume it equals the tick’s `BULLET_MOVE.toPos`)

- `BULLET_DESPAWN`:
  - required: `bulletId`, `reason` (`TTL|WALL|HIT`)
  - optional:
    - `pos` (world position where it despawned; if omitted, viewers may assume it equals the most recent `toPos`)

### 4.6.1 Beams / lasers (future)

Beams are hitscan or short-duration line attacks. They are rendered as a line for the tick(s) they are active.

- `BEAM_FIRE`:
  - `beamId`, `ownerBotId`
  - `fromPos`, `dir`, `rangeSectors`
  - `durationTicks` (int; `0` or `1` for instantaneous)
  - `ignoresShield` (optional boolean; when true, the viewer should explain that shield mitigation was bypassed)

Damage caused by a beam should still be represented via `DAMAGE` events (see §4.9), ideally with a `sourceRef` pointing to the `beamId`.

### 4.7 Grenades

- `GRENADE_SPAWN`: `grenadeId`, `ownerBotId`, `sector`, `dir`, `fuse`
- `GRENADE_MOVE`: `grenadeId`, `fromSector`, `toSector`
- `GRENADE_FUSE_TICK`: `grenadeId`, `fuseRemaining`
- `GRENADE_DETONATE`:
  - `grenadeId`, `centerSector`
  - `damageCenter`, `damageAdjacent`

### 4.8 Mines

- `MINE_PLACE`: `mineId`, `ownerBotId`, `sector`, `armTicks`
- `MINE_ARMED`: `mineId`
- `MINE_TRIGGER`: `mineId`, `triggerBotId`
- `MINE_DETONATE`:
  - `mineId`, `centerSector`
  - `damageCenter`, `damageAdjacent`

### 4.9 Damage + deaths

- `DAMAGE`:
  - required: `victimBotId`, `amount`, `source`, `kind`
  - optional:
    - `sourceBotId` (present for bot-caused damage, including bullets/saw/bot-bump)
    - `sourceRef`: `{ type, id }` (links damage back to an entity or relationship)

Current engine emission notes:
- `source` is currently a string and may be one of:
  - `"ENV"` (wall bump)
  - `"BOT"` (bot bump / ramming)
  - `"BULLET"`
  - `"SAW"`
- `kind` is currently a string and is typically:
  - `"BUMP_WALL"` for wall bumps
  - `"BUMP_BOT"` for bot bumps
  - `"DIRECT"` for weapon hits

- `BOT_DIED`:
  - `victimBotId`, `creditedBotId?`

## 5) Client data sources (now vs later)

### 5.1 Now (client-only)

- run local simulation
- store replays in:
  - IndexedDB (recommended)
  - or localStorage for tiny payloads

Recommended local persistence UX:
- when a match finishes, show a **Save Replay** dialog:
  - default name like: `Local Match — YYYY-MM-DD HH:mm`
  - actions: Save / Discard / Export JSON
- maintain a lightweight replay index for listing:
  - `{ replayId, createdAt, mode, participants, winner, tickCount, rulesetVersion }`
- allow **Import replay** (JSON file) to insert into local library

### 5.2 Later (server)

- user logs in
- match list loads from server (pagination)
- replay downloads from server (or via signed object-storage URL)
- client caches recently opened replays

---

## 6) Minimal server API (future-ready)

These endpoints are enough to power the browser replay UX (including “show me replays for a specific bot”):

- `GET /api/matches`
  - returns match list summaries visible to the current user (or public matches, depending on auth policy)
  - supports optional filters (server may support either/both):
    - `botId=<botId>` (preferred; stable server bot id)
    - `owner=<username>&botName=<name>` (human-friendly identifier)
  - pagination (recommended, forward-compatible): `limit`, `cursor`

- `GET /api/matches/:matchId`
  - returns metadata + participants + result

- `GET /api/matches/:matchId/replay`
  - fetch replay by match id
  - returns replay JSON (small v1)
  - or returns `{ url }` for object storage

---

## 7) UI implementation notes

- Rendering should be driven by replay state/events, not by re-running logic in the UI.
- Use the same coordinate system as `UIPlan.md` / `ArenaPlan.md` (sector + zone grid).
- Provide an event log panel that can be filtered by:
  - bot
  - tick range
  - event types (moves, bumps, damage, pickups, spawns)
- Deep-link viewer state in URLs (recommended): `tick`, `bot`, `speed`, `follow`.

---

## 8) Decisions needed to proceed

1) Replay storage for the first client prototype:
- A) full state per tick
- B) event log + checkpoints

2) Source code display:
- A) embed bot source in replay
- B) store source separately and reference via hash/url
