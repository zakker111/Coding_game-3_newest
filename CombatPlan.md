# CombatPlan.md — Projectiles, Weapon Cooldowns, Resource Costs, Grenades, Mines (Draft)

This document defines **combat mechanics** that bots can trigger via slot modules (e.g., bullet weapons) while keeping the bot instruction set small.

It complements:
- `BotInstructions.md` (how bots issue actions)
- `Ruleset.md` (death + attribution + ordering)
- `FutureProofing.md` (how to extend modules)

---

## 1) Design goals

- Deterministic and replayable.
- Any “randomness” (spread, damage variance) must be derived deterministically from a seed + stable ids (see §5.1).
- High-speed projectiles must resolve intermediate collisions deterministically (see §5.2).
- Weapon behavior is **module-defined** (data + simulation code), not bot-defined.
- A single stable bot instruction (`USE_SLOTn`) can trigger many future weapons.
- Support modules that consume:
  - ammo
  - energy
  - (future) both ammo + energy
- Support multiple delivery archetypes:
  - **projectile** (slow bullets)
  - **hitscan** (sniper)
  - **timed explosive projectiles** (grenade: delay/fuse then explode)
  - **deployables** (mines, turrets, traps)

---

## 2) Module execution model (future-proof)

Each equipped slot behaves like a small deterministic state machine owned by the bot.

### 2.1 Per-slot state (recommended)

Store per bot, per slot:
- `cooldownRemaining` (ticks; integer >= 0)
- optional module-specific state:
  - toggles (on/off)
  - charges / stacks
  - burst queues / burst cadence counters (for SMGs, machine guns)
  - sustained-fire state (e.g., heat, spread ramp, lastShotTick)
  - spawned entity references (for helpers/minions)

### 2.2 Resource costs (vector)

Define module resource costs as a vector so we can add hybrid weapons:
- `costAmmo` (int >= 0)
- `costEnergy` (int >= 0)

Rule:
- `USE_SLOTn` succeeds only if **all required resources** are available.
- If successful, **all costs are deducted** together.
- If not enough resources, the attempt is a deterministic no-op:
  - no cost
  - no cooldown applied
  - replay/debug should record a reason (e.g., `NO_AMMO` / `NO_ENERGY`)

Toggle modules:
- may also define a per-tick drain (e.g., `drainEnergyPerTick` while active).

### 2.3 Cooldowns

A module may define:
- `cooldownOnUseTicks` (applies after a successful `USE_SLOTn`)

Rule:
- if `cooldownRemaining > 0`, `USE_SLOTn` is a no-op:
  - no cost
  - no cooldown change
  - replay/debug should record `COOLDOWN`
- when a use succeeds, set `cooldownRemaining = cooldownOnUseTicks`.
- at the end of each simulation tick, decrement down to `0`.

### 2.3.1 Invalid target kinds / invalid targets (stable rule)

Modules declare which target kinds they accept (see `FutureProofing.md` §4).

Rule (recommended, v1+):
- If the provided `<TARGET>` is not one of the module’s accepted target kinds, the attempt is a deterministic no-op:
  - no cost
  - no cooldown
  - replay/debug should record `INVALID_TARGET_KIND`
- If the target kind is correct but the specific target is invalid (e.g., targeted bot is dead/missing), the attempt is also a deterministic no-op and should record `INVALID_TARGET`.

### 2.4 Weapon parameters (data-driven; future)

To support many weapon “feels” (rifle vs SMG vs wavy bullets vs lasers) without new bot opcodes, weapons should be mostly configured by data.

Recommended common weapon fields (draft):
- `damageBase` (int)
- `damageVariance` (int; optional)
  - interpreted using deterministic RNG (§5.1)
- `delivery` (`PROJECTILE | HITSCAN | BEAM`)
- projectile-only:
  - `speedUnitsPerTick` (number > 0; **arena world units** per tick; integer or fixed-point)
  - `radiusUnits` (number >= 0; for collision/visuals; `0` means “point projectile”)
  - `trajectoryKind` (`LINEAR | WAVY | ...`)
  - `stopsOnFirstHit` (bool)
- burst-only:
  - `burstCount`, `burstIntervalTicks`
- laser/beam-only:
  - `rangeSectors`, `durationTicks`
  - `ignoresShield` (bool)

---

## 3) Bullet weapon (v1 projectile)

This defines the default `BULLET` module.

### 3.1 Fire semantics

When a bot successfully executes `USE_SLOTn <TARGET>` for a slot containing `BULLET`:
- v1 accepted target kind: **BOT** targets only (`BOT1..BOT4`, `TARGET`, `CLOSEST_BOT/NEAREST_BOT`, `LOWEST_HEALTH_BOT/WEAKEST_BOT`)
- if `<TARGET>` is not a bot-kind target (e.g., a `SECTOR ...` location target), the attempt is a deterministic no-op (see §2.3.1)

On a successful fire:
- pay `costAmmo` (and `costEnergy` if configured for future hybrid bullets)
- apply cooldown
- spawn a **bullet projectile entity**

### 3.2 Projectile entity fields (minimum)

A bullet is a continuous projectile entity.

- `bulletId` (monotonic, deterministic)
- `ownerBotId`
- `targetBotId` (optional; for metadata/debug)
- `pos` (continuous world position; `{ x, y }` in arena world units)
- `vel` (continuous world velocity; `{ x, y }` in world units per tick; integer/fixed-point)
- `radiusUnits` (number >= 0; `0` means “point projectile”)
- `ttlRemaining` (ticks)

### 3.3 Bullet direction (engine-internal; no player aim)

Bots have **no directional weapons**: there is no “aim” input.

When a bullet is fired:
- resolve `<TARGET>` to a concrete `targetBotId`
- compute:
  - `spawnPos` = the shooter bot’s current world position
  - `targetPos` = the target bot’s current world position **at the moment of firing**
- compute an initial direction vector toward the target position:
  - `dir = Normalize(targetPos - spawnPos)`
- set bullet velocity:
  - `vel = dir * speedUnitsPerTick`

Notes:
- `Normalize(...)` must be implemented deterministically (integer/fixed-point; no platform-dependent floats).
- The bullet’s direction is **locked at fire time** and does **not** update as the target moves.

(Authoritative wording lives in `Ruleset.md` §5.1.)

### 3.4 Projectile motion (continuous)

Each tick during projectile advancement:
- compute `fromPos = pos`
- compute `candidateToPos = pos + vel`
- treat bullet motion as the swept segment `fromPos → candidateToPos`
- resolve the **earliest** collision along that segment (if any), then:
  - if the earliest collision is a bot hit: apply damage and remove bullet
  - else if the earliest collision is the outer wall: remove bullet
  - else: set `pos = candidateToPos`

### 3.5 Walls

Locked (from `ArenaPlan.md` / `Todo.md`):
- bullets **stop at walls** (outer boundary in v1).

Recommended behavior:
- if a bullet’s motion segment would cross outside the arena bounds, compute the intersection point with the outer boundary, set `toPos = impactPos`, then remove the bullet and emit a replay event.

### 3.6 Hit resolution (continuous collision)

Locked direction:
- bullets can hit **any bot** they collide with (not only the intended target).

Collision model:
- each alive bot has a **16×16** axis-aligned hitbox (AABB) centered on its current world position (see `ArenaPlan.md` §3).
- the bullet collides when its swept segment intersects a bot hitbox.
- the bullet does **not** collide with its owner (`ownerBotId`) (prevents self-hits due to spawn overlap).

Deterministic victim selection (if multiple bots would be hit in one tick):
- choose the bot with the **earliest** time-of-impact along the segment
- tie-break (exact same impact time): lowest bot id

On hit:
- emit damage:
  - `source = BOT`, `sourceBotId = ownerBotId`, `kind = BULLET`
- remove the bullet after a hit (typical `stopsOnFirstHit = true`)

### 3.7 TTL

- `ttlRemaining` decrements each tick
- when it reaches 0, remove bullet

Suggested TTL for a 3×3 arena: 6–10 ticks (tunable).

---

## 4) Future weapon archetypes (draft)

This section introduces additional weapon modules **without changing any v1 locked core** (tick-based deterministic simulation, continuous bot/bullet positions, etc.).

### 4.1 Sniper (hitscan)

A sniper weapon resolves damage **instantly** rather than spawning a projectile.

Recommended properties:
- `delivery = HITSCAN`
- high `cooldownOnUseTicks`
- higher resource cost (ammo and/or energy)

Hit semantics (draft):
- on successful `USE_SLOTn <TARGET>` (sniper accepts BOT-kind targets):
  - immediately apply damage to the resolved target bot (if valid/alive)
  - emit a damage event:
    - `kind = BULLET` (or `SNIPER` if you want separate stats later)

### 4.2 Machine gun / SMG (burst projectile + sustained spread)

Goal: rapid-fire projectile output with increasing spread while a bot “keeps firing”, but still driven by the same `USE_SLOTn` instruction.

Recommended semantics (draft):
- a successful `USE_SLOTn <TARGET>` (SMG accepts BOT-kind targets) starts (or refreshes) a burst state for that slot.
- while the burst state is active, the slot may spawn additional bullets on future ticks **without additional bot instructions**.

Recommended module properties:
- `delivery = PROJECTILE`
- `burstCount` (int > 0; bullets per trigger)
- `burstIntervalTicks` (int >= 1; ticks between shots)
- `cooldownOnUseTicks` (applies when a burst is started)
- `sustainedResetTicks` (int >= 0; if no shots for this long, sustained spread state resets)
- `spreadMin` / `spreadMax` (module-defined; representation depends on chosen spread model)

Recommended per-slot state:
- `burstShotsRemaining` (int)
- `burstNextShotIn` (ticks until next queued shot; integer >= 0)
- `burstSequenceId` (monotonic per slot; increments each time a burst is started)
- `sustainedShots` (int; how many shots have been fired “recently”)
- `lastShotTick` (int)

Deterministic update requirement:
- if/when burst continuation is implemented, add a dedicated phase after “each bot executes 1 instruction” where slot state machines may emit queued shots.
- process in `BOT1..BOT4`, then `slot1..slotN` order, so replay does not depend on hash-map iteration.

Deterministic spread requirement:
- do not use a global PRNG stream that depends on unrelated simulation events.
- derive spread for each shot from stable inputs (see §5.1), e.g. `{matchSeed, ownerBotId, slotIndex, burstSequenceId, shotIndexWithinBurst}`.

Optional “wavy / unstable” bullet feel (future):
- an SMG/MG can additionally set projectile `trajectory = WAVY` (see §4.5) so bullets drift in a deterministic sine/triangle-wave pattern.
- amplitude/phase can be derived per-shot from the same stable inputs so the spray looks chaotic but remains replayable.

### 4.3 Rifle (single-shot fast projectile)

Goal: a “non-hitscan” weapon that still feels fast by moving many world units per tick.

Recommended properties:
- `delivery = PROJECTILE`
- `speedUnitsPerTick` significantly higher than the default bullet (fast projectile)
- `trajectory = LINEAR` (rifle rounds go straight; no wavy drift)
- low/no spread
- higher base damage and/or armor/shield interaction tweaks

Deterministic collision requirement:
- movement must use deterministic continuous collision (swept segment, or deterministic micro-segments for non-linear trajectories; see §5.2) so the projectile cannot tunnel through walls or bots.

### 4.4 Laser (beam / hitscan) that ignores shields

A laser weapon can be modeled as hitscan (like sniper) but with different damage semantics.

Recommended properties:
- `delivery = HITSCAN` (or `BEAM` if you later want a 1-tick persistent entity)
- typically energy cost instead of ammo

Damage model extension (future):
- add a damage property/flag that can be checked by defense modules:
  - `ignoresShield: true` (or `damageFlags: [IGNORES_SHIELD]`)
- shield mitigation (future module) must be defined so this flag is applied deterministically.
  - desired gameplay: lasers/beams can **pass through an active shield** (the shield does not absorb/reflect them).

### 4.5 Sine-wave / wavy projectiles (deterministic trajectory representation)

Some projectile weapons may want a “wavy” path. This must be represented in a fully deterministic, integer-friendly way (no platform-dependent floating point math).

Recommended representation:
- projectile stores:
  - `spawnSector`
  - `baseDir`
  - `ageTicks` (ticks since spawn; increments once per simulation tick)
  - `wavePeriodTicks` (int > 0)
  - `waveAmplitude` (fixed-point integer or small int sectors)
  - `wavePhaseIndex` (int; initial phase)
  - `lateralDir` (the direction orthogonal to `baseDir` chosen deterministically at spawn)

Deterministic “sine” options (decision needed):
- **A) Integer sine LUT:** engine code defines a fixed lookup table for supported periods, e.g. `sinLUT[period][t]` returning fixed-point integers in `[-SCALE..SCALE]`.
- **B) Triangle wave:** use an integer triangle wave (no LUT) if exact sine is unnecessary.

Mapping the continuous wave to grid steps (draft):
- compute `desiredLateralOffset(t)` as an integer number of sectors from the wave function (LUT or triangle).
- track `currentLateralOffset` since spawn.
- each movement sub-step:
  - if `currentLateralOffset != desiredLateralOffset(t)`, step 1 sector in `lateralDir` toward it.
  - else step 1 sector forward in `baseDir`.
- if the projectile has high `speedUnitsPerTick`, apply the above per deterministic micro-step (see §5.2).

---

## 5) Deterministic tick ordering (combat-focused)

Recommended high-level phases:
1) each bot executes 1 instruction (may spawn projectiles / deployables)
2) apply toggle drains (saw/shield)
3) advance projectiles (bullets/grenades/etc.)
4) resolve projectile hits
5) resolve explosions
6) pickups
7) death removal + win checks

Within phases:
- process bots in `BOT1..BOT4`
- process entities in id order (`bulletId`, `grenadeId`, `mineId` ascending)

### 5.1 Deterministic RNG for spread + damage variance (future; required)

If a module needs spread (SMG) or damage variance, it must be deterministic and replayable **without depending on global PRNG consumption order**.

Recommended approach: stateless per-event RNG
- define a `matchSeed` (already needed elsewhere).
- for each “random-like” decision, derive a 32-bit value from stable inputs, e.g.:
  - `u32 = Hash32(matchSeed, kind, ownerBotId, slotIndex, projectileId, shotIndexWithinBurst)`
- convert to outcomes using integer operations:
  - discrete choice: `choice = u32 % N`
  - integer variance: `delta = (u32 % (2*k + 1)) - k`
- avoid platform-dependent floating point; if you need fractional values, use fixed-point integers.

Replay requirement:
- either:
  - **A) Recompute** spread/variance in the viewer using the same hash algorithm (requires the algorithm to be treated as part of the ruleset), or
  - **B) Emit** the derived result explicitly in replay events (more future-proof if the algorithm may change).

### 5.2 Fast projectiles (deterministic continuous collision)

Any projectile with high `speedUnitsPerTick` must not be able to “tunnel” through walls or bot hitboxes.

Baseline rule (linear projectiles; recommended):
- treat each tick’s movement as a swept segment `fromPos → toPos`
- resolve the **earliest** intersection along that segment against:
  - outer walls
  - bot hitboxes (16×16 AABB)
- if an intersection occurs, clamp `toPos` to the impact point and resolve the hit/despawn deterministically

Non-linear trajectories (wavy/curved):
- if the trajectory cannot be expressed as a single segment per tick, approximate it using a fixed number of deterministic sub-steps per tick (micro-segments) and apply the same “earliest collision wins” rule.
- the sub-step count must be a fixed rule (or a rule derived only from stable projectile parameters), not dependent on frame rate or viewer settings.

Determinism notes:
- process projectiles in ascending id order.
- if multiple projectiles could hit the same bot in the same tick, projectile id order determines which damage applies first.
- if a single projectile’s segment intersects multiple bots, choose the earliest time-of-impact; tie-break by lowest bot id (see §3.6).
- projectile–projectile collisions are undefined/ignored unless explicitly introduced later.

---

## 6) Timed explosive projectile: Grenade (delayed bullet)

A grenade is a projectile that detonates after a fixed delay (fuse).

### 6.1 Grenade entity fields

- `grenadeId` (monotonic, deterministic)
- `ownerBotId`
- `sector` (current)
- `dir` (initial direction)
- `fuseRemaining` (ticks)
- `ttlRemaining` (ticks)

### 6.2 Movement + fuse update

Recommended deterministic update per tick:
1) grenade attempts to move 1 sector along `dir`
   - if blocked by a wall: grenade stops and remains in its current sector
2) decrement `fuseRemaining`
3) if `fuseRemaining == 0`: detonate and remove grenade
4) decrement `ttlRemaining`; if it reaches 0, remove grenade (failsafe)

### 6.3 Detonation (AoE)

Locked v1 AoE shape:
- **radius = 1 sector**
  - center: grenade sector (distance 0)
  - ring: adjacent sectors (distance 1)

Locked v1 falloff:
- bots in the **center sector** take **more** damage than bots in adjacent sectors.

Module-defined numbers:
- `damageCenter`
- `damageAdjacent`

Attribution:
- `source = BOT`, `sourceBotId = ownerBotId`, `kind = OTHER` (or `EXPLOSION` later)

Deterministic ordering:
- apply explosion damage in `BOT1..BOT4` order.

---

## 7) Deployable: Mines

A mine is a persistent entity placed into the arena that detonates after a bot hits it.

### 7.1 Placement model (still to decide)

Choose one deterministic placement rule:
- **A) Drop-at-feet (simplest):** mine spawns in the bot’s current sector.
- **B) Drop adjacent:** mine spawns in the sector the bot is moving toward / facing (requires defining “facing”).
- **C) Place by target sector:** extend targeting to allow `USE_SLOTn SECTOR <N>`.

### 7.2 Mine entity fields

- `mineId` (monotonic, deterministic)
- `ownerBotId`
- `sector`
- `armRemaining` (ticks; arming delay)
- `ttlRemaining` (ticks)

### 7.3 Arming + trigger

Baseline:
- mine does nothing while `armRemaining > 0`
- once armed, mine detonates when a bot enters its sector ("hits it")

Trigger targeting (still to decide):
- **A) Any bot triggers** (including owner)
- **B) Enemies only trigger** (owner immune)

### 7.4 Detonation (AoE)

Locked v1 AoE shape:
- **radius = 1 sector**
  - center: mine sector (distance 0)
  - ring: adjacent sectors (distance 1)

Locked v1 falloff:
- bots in the **mine sector** take **more** damage than bots in adjacent sectors.

Module-defined numbers:
- `damageCenter`
- `damageAdjacent`

Attribution:
- `source = BOT`, `sourceBotId = ownerBotId`, `kind = OTHER` (or `MINE` later)

Deterministic ordering:
- if multiple mines trigger in the same tick: resolve in `mineId` ascending order
- for a given mine explosion, apply damage in `BOT1..BOT4` order

---

## 8) Force effects (future; draft)

This section outlines a deterministic way to add "forces" later (knockback, pull, recoil, slows) while keeping the simulation replayable.

Design constraints:
- no platform-dependent floating point physics (use integer/fixed-point)
- forced motion must resolve using the same wall/bot collision rules as normal movement (see `Ruleset.md` §1.2)

Recommended force primitives (add later if desired):
- **Knockback**: translate a bot away from a source point by `forceUnits` (world units).
- **Pull**: translate a bot toward a source point by `forceUnits`.
- **Slow**: temporarily reduce a bot’s `speedUnitsPerTick` for `durationTicks`.
- **Recoil**: apply knockback to the shooter when it fires.

Deterministic ordering (recommended):
- resolve force effects in a dedicated phase after explosions but before pickups
- apply in `BOT1..BOT4` order
- if a forced move would hit the outer wall: clamp at the wall and (optionally) apply `BUMP_WALL` damage; if it would overlap another bot: cancel the forced move (same as normal movement)

Replay requirements:
- add explicit events (so UI does not infer):
  - `FORCE_APPLIED { botId, kind: KNOCKBACK|PULL|SLOW, fromPos, toPos, magnitudeUnits, sourceRef? }`

---

## 9) Decisions to lock next

1) Bullet default numbers for v1 (placeholders are fine):
- `costAmmo` per shot: 1 / 2 / 5
- `cooldownOnUseTicks`: 0 / 1 / 3 / 5
- `ttlRemaining`: 6 / 8 / 10

2) Mine placement model: **A / B / C** (see §7.1)

3) Mine trigger targeting: **A / B** (see §7.3)

4) Damage event kinds:
- keep using `OTHER` for explosions, or
- add explicit kinds like `EXPLOSION` and `MINE`

5) Deterministic RNG scheme for spread/variance (see §5.1):
- stateless hash per event (recommended), vs
- global PRNG stream with a strictly specified consumption order

6) High-speed projectile semantics (see §5.2):
- confirm “sub-step then hit-check” is the rule
- decide whether the replay must emit every sub-step move, or only spawn + final hit/outcome

7) Wavy projectile wave function (see §4.5):
- integer sine LUT vs triangle wave
- how to choose `lateralDir` at spawn (fixed rule vs deterministic RNG derived from stable ids)

8) Laser ignore-shields flag (see §4.4):
- field name (`ignoresShield` vs `damageFlags`)
- whether it ignores only shields or also other defenses
