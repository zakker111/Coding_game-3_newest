# BotLanguageDesign.md — Making `BotInstructions` Fun + Future-Proof (vNext Planning)

This document proposes how to evolve `BotInstructions.md` so it remains **small, teachable, and deterministic**, while supporting a growing catalog of slot modules:
- lasers / beams
- sniper rifles (hitscan)
- grenades (timed explosives)
- mines (deployables)
- teleports
- helper/minion spawners

The key idea is to keep the **instruction set stable** and put most “variety” into **data-driven module behaviors**.

Related docs:
- `BotInstructions.md` (current v1 language)
- `FutureProofing.md` (slot/module extensibility strategy)
- `CombatPlan.md` (cooldowns, projectiles, explosives)
- `ReplayViewerPlan.md` (how replays + debugging should work)

---

## 1) What makes the language fun (player experience)

A fun bot language usually has:

1) **Clear mental model**
   - 1 instruction per tick
   - predictable execution order

2) **Enough “state” to build strategies**
   - timers (already planned)
   - *optionally* small registers (for memory/state machines)

3) **Great observability**
   - replays show *what happened* and *why* (cooldown, no ammo, invalid target)
   - code line highlighting and execution trace

4) **Lots of module variety** without language bloat
   - add 100 weapons without adding 100 opcodes

---

## 2) Keep `BotInstructions.md` split into two layers

### 2.0) Planned “locked loadout headers” (Workshop ergonomics)

To make loadouts discoverable and to keep matches reproducible, the Workshop will represent the selected loadout as the first 3 non-blank lines of the bot source (comments):
- `;@slot1 <MODULE|EMPTY>`
- `;@slot2 <MODULE|EMPTY>`
- `;@slot3 <MODULE|EMPTY>`

These are **UI-generated and locked** (not user-editable). The compiler ignores them as comments.
When explicit loadouts are implemented, the match config can use these directives to populate `loadout` (or the UI can pass `loadout` directly).

Default (if omitted): all slots `EMPTY`.

### 2.1 Layer A — Stable VM / language core (rarely changes)

`BotInstructions.md` should remain the source of truth for:
- control flow
- timing (WAIT + non-blocking timers)
- movement + targeting registers
- generic slot activation (`USE_SLOTn`, `STOP_SLOTn`)
- expressions/predicates (sensing)

### 2.2 Layer B — Module catalog (changes often)

Module definitions should live in a separate evolving document (or data schema), e.g. `Modules.md` later.

### 2.3 Persistent movement goals (quality-of-life)

If you want bots to **navigate while still attacking** (less repetitive scripts), keep one-step movement instructions, but also support a **movement goal** state:
- a single instruction sets a goal (sector/bot/powerup)
- the engine attempts 1 step per tick toward that goal until cleared/complete

This is now specified in `BotInstructions.md` (§3.1).

A module definition includes:
- costs: `costAmmo`, `costEnergy` (vector)
- cooldown: `cooldownOnUseTicks`
- delivery: `PROJECTILE | HITSCAN | BEAM` (plus simulation-side behaviors like deployables/spawns)
- capability flags (examples): `ignoresShield`, `piercesArmor`, `hasSplash`, `isBurst`, `hasSpread`
- supported `targetKinds`: `BOT | LOCATION | NONE` (and optionally `DIRECTION` later)
- damage/effect numbers

This keeps the language stable while gameplay grows.

---

## 3) Unify module activation around `USE_SLOTn`

In **v1** (see `BotInstructions.md`), slot activation is already:
- `USE_SLOTn <TARGET>` where `<TARGET>` includes bot targets + location targets + `SELF|NONE`

Directional aiming via an **aim-direction target** form (`DIR ...`) is **deferred** (no directional weapons are planned near-term).

To support teleport, mines, grenades, and other “non-bot” targeting, we need a **future-proof target grammar** that stays small and deterministic. (`DIR ...` can be added later without changing `USE_SLOTn`.)

### 3.1 Recommended vNext target union

Standardize `<TARGET>` as a small tagged union so new modules don’t require new “targeting instructions”.

Target kinds (stable):

- **BOT**:
  - `BOT1|BOT2|BOT3|BOT4`
  - `TARGET` (current target bot register)
  - `CLOSEST_BOT`
  - `SELF`

- **LOCATION**:
  - `SECTOR <N>` (1..9, sector center)
  - `SECTOR <N> ZONE <Z>` (`Z` = 1..4, zone center)
  - future sugar:
    - `POWERUP HEALTH|AMMO|ENERGY|ANY` (resolve to the closest currently valid powerup location of that type)
    - `RANDOM_POSITION` (must resolve deterministically from stable replay inputs; recommended to ship first as random sector/zone center rather than arbitrary coordinates)

- **NONE**:
  - `NONE`

Deferred extension (optional; only needed if/when directional weapons are introduced):

- **DIRECTION** (aim independent of a bot/location; useful for directional beams, cones, “fire forward”, etc.):
  - `DIR UP|DOWN|LEFT|RIGHT|UP_LEFT|UP_RIGHT|DOWN_LEFT|DOWN_RIGHT` (recommended to match movement directions)
  - future: can extend to analog headings if the movement model ever needs it

Then:
- `USE_SLOTn <TARGET>` becomes the canonical activation form.
- v1 compatibility: treat `USE_SLOTn <BOT_TARGET>` as a subset of `<TARGET>`.

### 3.2 Why this matters

- Grenade launchers may want a bot target or a sector target.
- Mines typically don’t need a bot target.
- Teleport needs a location target and benefits from powerup/random-location sugar.
- Helper/minion spawners often need `NONE` or `SELF`.

---

## 4) Add **module introspection** (to avoid wasted ticks) without adding many opcodes

If bots can’t check cooldown/resources, they will waste many ticks spamming actions.
That’s less fun and harder to debug.

Instead of adding one predicate per module mechanic, expose a tiny, extensible query surface.

Recommended *expression* functions:

- `SLOT_QUERY(<SLOT>, <KEY>)` → int
  - returns `0` if the key is unsupported by the current ruleset/module
  - common keys: `COOLDOWN_REMAINING`, `ACTIVE`, `CHARGES`, `BURST_REMAINING`

- `SLOT_HAS_CAP(<SLOT>, <CAP>)` → bool
  - capability flags are module-defined but standardized (examples):
    - `DELIVERY_PROJECTILE`, `DELIVERY_HITSCAN`, `DELIVERY_BEAM`
    - `IGNORES_SHIELD`, `PIERCES_ARMOR`, `HAS_SPLASH`, `IS_BURST`, `HAS_SPREAD`

Optional convenience aliases (compile down to the above; purely sugar):
- `HAS_MODULE(<SLOT>)` → `SLOT_HAS_CAP(slot, HAS_MODULE)` or a dedicated common key
- `COOLDOWN_REMAINING(<SLOT>)` → `SLOT_QUERY(slot, COOLDOWN_REMAINING)`
- `SLOT_READY(<SLOT>)` → `SLOT_QUERY(slot, READY)` (or `COOLDOWN_REMAINING == 0` plus resources)
- `SLOT_ACTIVE(<SLOT>)` → `SLOT_QUERY(slot, ACTIVE) > 0`

Notes:
- These functions do not give bots control over mechanics; they only reveal state.
- The engine remains authoritative.
- Decide early whether unknown `<KEY>/<CAP>` is a compile-time error (stricter, typo-safe) or a runtime `0/false` (more extensible).

### 4.1 Per-slot internal module state (simulation-side pattern)
New weapon behaviors should be representable as *module instance state* rather than new language features.

Examples (all simulation-side; bots can only *read* via `SLOT_QUERY` if you choose to expose the key):
- burst MG: `burstRemaining`, `burstSpacingTicks`
- recoil/spread weapons: `recoil`, `spread`
- beams: `active`, `rampTicks` / `heat`

The language surface stays the same: bots still just `USE_SLOTn <TARGET>`.

### 4.2 Recommended tactical movement helpers (future sugar over persistent move goals)

These are the highest-value movement additions if you want bots to manage spacing and positioning without forcing every player to hand-write the same loops.

Recommended helpers:

- `MOVE_TO_TARGET_UNTIL_IN_RANGE <n>`
  - move toward the current target bot until `DIST_TO_TARGET() <= n`
  - then clear the movement goal automatically

- `MOVE_AWAY_FROM_TARGET_UNTIL_RANGE <n>`
  - move away from the current target bot until `DIST_TO_TARGET() >= n`
  - then clear the movement goal automatically

- `HOLD_POSITION`
  - clear current movement intent and remain anchored until a later instruction changes it

- `ORBIT_TARGET`
  - move around the current target bot instead of directly toward or away from it
  - recommended first version: fixed default orbit radius and deterministic direction

- `RETREAT_TO_SECTOR <n>`
  - set a persistent retreat goal toward a specific sector anchor
  - useful for heal/regroup/rearm behavior

Design rule:
- these should compile down to the same move-goal machinery already proposed in §2.3, not to bespoke physics paths

### 4.3 Recommended competitive sensing helpers (future)

These are the most useful next sensing additions for richer arena decisions:

- `ENEMIES_IN_RANGE(n)` → int
  - count alive enemy bots within range `n`

- `COUNT_ALIVE_ENEMIES()` → int
  - count alive enemy bots globally

- `DIST_TO_CLOSEST_POWERUP(ANY|HEALTH|AMMO|ENERGY)` → int
  - return the distance to the nearest currently spawned powerup of the requested kind

- `LOWEST_HEALTH_ENEMY_IN_RANGE(n)` → bool / selector candidate
  - recommended first version: predicate that answers whether a valid low-health enemy exists in range
  - if direct target acquisition is wanted later, add a paired target instruction instead of overloading the predicate

- `DRONE_COUNT()` → int
  - recommended as sugar for a generic helper count such as `OWNED_COUNT(HEAL_DRONE)`
  - especially useful if the repair-drone module is added

---

## 5) Optional: add tiny bot-local registers (for richer strategies)

Timers alone can implement many strategies, but registers make scripting feel more like programming.

Conservative option:
- Add 3–4 integer registers: `R1..R4` (range `0..999`)
- treat these as the first official bot-local **variables**
- if a friendlier naming layer is desired later, `VAR1..VAR4` can be syntax sugar over the same registers

Minimal instruction set:
- `SET R1 <INT>`
- `INC R1`
- `DEC R1`
- `ADD R1 <INT>`
- `SUB R1 <INT>`

Expression access:
- `R1`, `R2`, `R3`, `R4` usable inside `IF (...)`.

Determinism:
- values are integers
- overflow clamps or wraps (must be documented if added)

If you want to keep v1 ultra-simple, omit registers and lean on timers + label state machines.
If you want slightly richer strategy without turning the language into a full programming language, a good compromise is:
- integer variables (`R1..R4`)
- optional flag sugar (`F1..F4`) compiled to `0/1` registers
- no arrays, no strings, no user-defined functions

---

## 6) Facing/orientation (enables better weapons + placement)

Some mechanics get easier and more tactical if bots have a deterministic “facing”:
- directional lasers
- dropping mines “in front”
- dashes

Three compatible models:

- **A) No facing** (simplest): abilities either use bot target or sector target.
- **B) Derived facing**: facing = last successful move direction.
- **C) Explicit facing**: add `FACE <DIR>` instruction.

---

## 7) How common future modules map to the language

### 7.1 Laser / beam weapon

Mechanics (module-defined):
- fast targeted energy line weapon
- delivery: `HITSCAN`, `BEAM`, or a very fast linear projectile (implementation choice)
- cost: energy only
- cooldown: medium
- targeting:
  - bot target (`BOT` kind)
- defense interaction:
  - ignores armor
  - active shield deflects it
- client-side presentation:
  - render as a visible line/beam rather than a bullet sprite for readability

Language interaction:
- `USE_SLOTn TARGET` / `USE_SLOTn BOT2`
- optional predicates: `SLOT_QUERY(SLOTn, READY)`
- if directional beams are ever added later, that should be a separate extension, not a requirement for the first laser version

### 7.2 Sniper rifle

Mechanics:
- `HITSCAN`
- high cooldown
- high ammo or hybrid cost

Language interaction:
- `USE_SLOTn BOTx` / `USE_SLOTn TARGET`

### 7.3 Grenade launcher

Mechanics:
- delivery: `PROJECTILE`
- projectile effect: explodes on impact or after `fuseTicks`
- AoE radius=1 sector with falloff (per `CombatPlan.md`)

Language interaction:
- `USE_SLOTn BOTx` or `USE_SLOTn SECTOR 5`

### 7.4 Mines

Mechanics:
- `DEPLOYABLE`
- uses ammo to place
- has an arming delay plus a fuse / lifetime timer
- explodes if:
  - a bot enters/hits its sector after arming,
  - its fuse expires,
  - it is hit by bullet or laser
- AoE radius=1 sector with falloff
- targetable/destructible deployable, which implies future replay/debug visibility for mine entities

Language interaction:
- `USE_SLOTn NONE` (drop at feet), or
- `USE_SLOTn SECTOR <N>` (if you allow targeted placement)

### 7.5 Reflector

Mechanics:
- defensive utility module
- recommended as toggle or short-duration active effect
- primary job: reflect or redirect incoming projectile weapons
- should be a natural counter to bullet-heavy metas

Language interaction:
- `USE_SLOTn SELF`
- `STOP_SLOTn`

### 7.6 Repair drone module

Mechanics:
- uses ammo to spawn small orbiting heal drones
- drones heal the owner in pulses / phases
- drones are destructible by bullet hits
- living drones consume owner energy over time
- if owner energy reaches 0, remaining drones vanish

Language interaction:
- `USE_SLOTn SELF`
- optional `STOP_SLOTn` if you want bots to dismiss drones early
- recommended sensing support:
  - `DRONE_COUNT()`
  - generic helper counts such as `OWNED_COUNT(HEAL_DRONE)`

### 7.7 Teleport

Mechanics:
- location utility effect
- cost: half the bot’s full energy bar per use
- cooldown: medium/high
- accepted targets:
  - `SECTOR <N>`
  - future zone/location targets
  - powerup targets
  - deterministic random destination

Language interaction:
- `USE_SLOTn SECTOR <N>`
- future:
  - `USE_SLOTn POWERUP HEALTH|AMMO|ENERGY|ANY`
  - `USE_SLOTn RANDOM_POSITION`

### 7.8 Burst MG / rifle (burst + recoil/spread)

Mechanics:
- delivery: `HITSCAN` (or `PROJECTILE` if bullets have travel time)
- `isBurst`: fires multiple shots after one `USE_SLOTn` while `burstRemaining > 0`
- `hasRecoil` / `hasSpread`: accuracy is a function of the module’s internal `recoil/spread` state

Language interaction:
- still just `USE_SLOTn TARGET` (or `BOTx`)
- bots can optionally adapt via introspection:
  - `SLOT_QUERY(SLOTn, BURST_REMAINING)`
  - `SLOT_QUERY(SLOTn, COOLDOWN_REMAINING)`

### 7.9 Wavy projectile weapon (trajectory variety without new language)

Mechanics:
- delivery: `PROJECTILE`
- trajectory parameters are module-defined: `LINEAR | WAVY | ARC | HOMING | ...`
  - “wavy” is just a projectile param (e.g., amplitude/period), not a new instruction

Language interaction:
- `USE_SLOTn TARGET` or `USE_SLOTn SECTOR <N>` depending on the module’s `targetKinds`

---

## 8) Replay + debugging requirements that the language should enable

To make the instruction set feel good, the replay should explain failures.

For any `USE_SLOTn` attempt, include in replay trace:
- executed/no-op
- reason (cooldown, no ammo, no energy, invalid target, no module)

This directly supports the “what went wrong?” browser experience.

---

## 9) Recommended next edits to `BotInstructions.md` (planning)

When you’re ready to evolve the spec, the next safe edits are:

1) Add generic introspection (`SLOT_QUERY`, `SLOT_HAS_CAP`) and keep any named predicates as sugar.
2) Optionally add facing model (B or C) if you want directional weapons.
3) (Deferred) Add **direction targets** for aiming if you introduce directional weapons:
   - allow `USE_SLOTn DIR UP|DOWN|LEFT|RIGHT|UP_LEFT|UP_RIGHT|DOWN_LEFT|DOWN_RIGHT`
   - keep existing v1 `<TARGET>` (bots + locations + `SELF|NONE`) unchanged
4) Optionally add registers if you want deeper programming strategies.
5) Add tactical movement helpers:
   - `MOVE_TO_TARGET_UNTIL_IN_RANGE <n>`
   - `MOVE_AWAY_FROM_TARGET_UNTIL_RANGE <n>`
   - `HOLD_POSITION`
   - `ORBIT_TARGET`
   - `RETREAT_TO_SECTOR <n>`
6) Add focused competitive sensing helpers:
   - `ENEMIES_IN_RANGE(n)`
   - `COUNT_ALIVE_ENEMIES()`
   - `DIST_TO_CLOSEST_POWERUP(ANY|HEALTH|AMMO|ENERGY)`
   - `LOWEST_HEALTH_ENEMY_IN_RANGE(n)`
   - `DRONE_COUNT()`

---

## 10) Decisions to lock (pick one per row)

1) Direction aiming targets:
- **A)** keep v1 `<TARGET>` (bots + locations + `SELF/NONE`; **no** `DIR ...`) (recommended while there are no directional weapons)
- **B)** add `DIR UP|DOWN|LEFT|RIGHT` as a new `<TARGET>` kind (deferred; only needed for directional weapons)

2) Slot/module introspection:
- **A)** no introspection (bots may waste ticks)
- **B)** add a few named predicates only (`COOLDOWN_REMAINING`, `SLOT_READY`, `SLOT_ACTIVE`)
- **C)** add generic `SLOT_QUERY` + `SLOT_HAS_CAP` and treat named predicates as sugar (recommended)

3) Unknown introspection keys/caps behavior:
- **A)** compile-time error (typo-safe; less extensible)
- **B)** runtime `0/false` (more extensible; must be good in replay/debug)

4) Facing model:
- **A)** no facing
- **B)** derived facing from last successful move
- **C)** explicit `FACE <DIR>` instruction

5) Bot-local registers:
- **A)** none (timers only)
- **B)** add `R1..R4` with minimal ops
  - recommended interpretation: these are the first supported bot-local **variables**

6) Tactical movement sugar:
- **A)** keep only low-level movement and require players to hand-build spacing loops
- **B)** add the helpers in §4.2 (recommended)

7) Competitive sensing helpers:
- **A)** keep only current low-level predicates
- **B)** add the helpers in §4.3 while keeping generic counters underneath (recommended)
