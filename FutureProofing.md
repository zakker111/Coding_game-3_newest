# FutureProofing.md — Future-Proofing Bot Instructions + Slot Modules

This document outlines how to keep the bot language **stable** while allowing many new weapons, utilities, and “pet/minion” style mechanics in the future.

It complements:
- `BotInstructions.md` (player-facing language)
- `Ruleset.md` (simulation rules)

---

## 1) Problem statement

We want to add new gameplay modules over time:
- new weapons (different projectile patterns, AoE, mines, beams)
- new defenses (variants of shields)
- utility modules (teleport, dash, scan)
- **spawn modules** (e.g., small helper bots that orbit, heal, intercept bullets)

If each new module requires adding new bespoke bot instructions, the instruction set will:
- grow too fast
- get inconsistent
- become harder to validate/sandbox
- make older replays/scripts harder to preserve

We need an extensibility layer.

---

## 2) Core strategy: keep the VM instruction set small; make modules data-driven

### 2.0 Authoritative catalog ownership (implemented workspace rule)
The authoritative module/loadout contract should live in the neutral workspace package:
- `packages/ruleset` (`@coding-game/ruleset`)

That package owns:
- `rulesetVersion`
- recognized `ModuleId` values
- the module catalog/metadata
- deterministic loadout normalization

This split is intentional:
- `@coding-game/ruleset` = global catalog + rules
- `packages/engine` = simulation behavior for each shipped module
- server storage = per-user inventory ownership / unlocks
- Workshop = UI defaults like starter loadouts

That keeps future module additions mechanical:
1. add/update the catalog in `@coding-game/ruleset`
2. implement deterministic engine behavior
3. add tests

### 2.1 Stable instruction “spine”
Keep these categories stable (rarely change):
- control flow (`LABEL`, `GOTO`, `IF ...`)
- deterministic timing (`WAIT`, timers)
- movement (`MOVE`, `MOVE_TO_*`)
- targeting registers
- **generic slot use** (see §3)

### 2.2 Modules are simulation-side “plugins”
New content is added primarily by:
- defining a new **module type** (e.g., `DRONE_SPAWNER`)
- implementing its deterministic behavior in the simulation engine
- defining its resource usage (ammo/energy), cooldowns, and effects in data

The bot language stays stable if module *variety* is expressed via a small set of **capability flags** + data parameters, rather than new instructions.

Recommended module schema fields (high-level):
- activation: `INSTANT | TOGGLE | PASSIVE`
- costs (vector): `costAmmo`, `costEnergy`
- cooldown: `cooldownOnUseTicks`
- optional drains while active: `drainEnergyPerTick`

#### Capability flags (stable surface)
These are the “shape” of a module. New modules should primarily be expressible by combining these fields.

- `delivery`: `PROJECTILE | HITSCAN | BEAM`
  - `PROJECTILE`: entities with travel time (supports patterns like wavy/homing)
  - `HITSCAN`: instantaneous line check
  - `BEAM`: sustained effect while active (damage/drain per tick)

- `targetKinds`: set of supported target kinds (see §4)
  - `BOT`, `LOCATION`, `NONE` (and optionally `DIRECTION` later if directional weapons are introduced)

- defensive interaction flags (examples):
  - `ignoresShield`
  - `piercesShield`
  - `ignoresArmor`
  - `piercesArmor`
  - `deflectsProjectiles`
  - `stopsOnFirstHit` (false implies pierce-through entities)

- AoE / collateral flags (examples):
  - `hasSplash`
  - `splashRadiusSectors`
  - `friendlyFire`

- optional weapon “feel” flags (examples):
  - `hasRecoil`
  - `hasSpread`
  - `isBurst`
  - `isChargeUp`

Behavior kind (examples, simulation-side):
- deployables: `DEPLOYABLE` (mines, turrets, traps)
- spawns: `SPAWN_HELPER`

See `CombatPlan.md` for projectile + cooldown details.

The bot language does **not** need a new opcode for each module.

---

## 3) Extensibility layer: slot-addressed `USE_SLOTn` + `STOP_SLOTn`

### 3.1 Slot actions
Treat slot-addressed actions as the long-term compatibility surface:
- `USE_SLOT1 <TARGET>`
- `USE_SLOT2 <TARGET>`
- `USE_SLOT3 <TARGET>`
- `STOP_SLOT1|STOP_SLOT2|STOP_SLOT3`

Meaning:
- `USE_SLOTn` triggers the **default/primary action** of the module equipped in that slot.
- `STOP_SLOTn` disables/toggles off a module if it has an “on” state.

This makes adding modules mostly a matter of implementing how that module responds to `USE`/`STOP`.

### 3.2 Keep module-type commands as “syntax sugar” (optional)
Player-friendly commands like `SAW ON` / `SHIELD ON` can remain for the first few modules.
But internally the compiler can treat them as sugar for `USE_SLOTn` / `STOP_SLOTn`.

This allows:
- a beginner-friendly language
- plus a stable low-level core

### 3.3 Per-slot internal state (deterministic patterns)
To support “new weapon behaviors” (burst MG, recoil/spread, beams with ramp-up, wavy projectiles) without new opcodes, each equipped module instance should own a small deterministic state blob.

Pattern:
- state is stored per bot *per slot* (not global)
- state is reset when a module is swapped out
- state is updated only by the simulation (bot code can’t write it directly)
- state updates must be deterministic and tick-based

Recommended common fields (apply to most modules):
- `cooldownRemainingTicks`
- `active` (for toggle/beam-like modules)
- `charges` / `chargeTicks` (if using a charge-up model)

Recommended weapon-feel fields (module-defined but standardized names):
- `burstRemaining` (burst MG)
- `burstWindupTicks` / `burstSpacingTicks`
- `recoil` (accumulated recoil)
- `spread` (current spread cone)
- `lastUseTick`

Determinism note:
- if a module needs randomness (e.g., spread sampling), the RNG scheme must be deterministic and treated as part of the ruleset.
- `CombatPlan.md` recommends **stateless per-event hashing** (often easiest for replay stability).
- A per-slot PRNG stream seeded from `(matchSeed, botId, slotIndex)` is also possible, but only if the consumption/advance rules are strictly specified.

---

## 4) Future-proof targeting: standardize targets

To support many kinds of abilities, define a stable target model.

Standardize targets as a small tagged union. This is the key to adding new weapons (burst MG, rifles, beams, wavy projectiles) without adding new “targeting” opcodes.

Recommended target kinds (stable):
- `BOT`: a bot entity
  - tokens: `BOT1..BOT4`, `TARGET`, `CLOSEST_BOT`, `SELF`
- `LOCATION`: a board location
  - tokens: `SECTOR 1..9`, `SECTOR 1..9 ZONE 1..4`
  - (later, if ever needed: `POS x y`)
- `NONE`: explicit “no target”
  - token: `NONE`

Deferred extension (optional; only needed if/when directional weapons are introduced):
- `DIRECTION`: an aim direction independent of a bot/location
  - tokens (recommended to match movement directions): `DIR UP|DOWN|LEFT|RIGHT|UP_LEFT|UP_RIGHT|DOWN_LEFT|DOWN_RIGHT`
  - `DIR ...` targets are not part of the stable v1 language (see `BotInstructions.md` notation).
  - future: can extend to analog headings if the movement model ever needs it

Rules:
- each module declares `targetKinds` it supports (see §2.2) and the engine validates/normalizes the provided target
- `USE_SLOTn` may ignore targets that do not apply, but should still be deterministic and should provide a replay/debug reason when a target is invalid

This prevents having to add unique “target forms” per weapon.

### 4.1 Future-proof module introspection (optional; avoid opcode explosion)
Bots will want to know whether a slot is usable (cooldown/resources) and sometimes adapt to what a module *is* (beam vs projectile, pierces armor, etc.).

To avoid adding one predicate per module/weapon feature, prefer a small generic introspection surface:
- `SLOT_QUERY(<SLOT>, <KEY>)` → int (0 if unsupported)
- `SLOT_HAS_CAP(<SLOT>, <CAP>)` → bool

Where:
- `<KEY>` is a small stable set of common state fields (`COOLDOWN_REMAINING`, `ACTIVE`, `CHARGES`, `BURST_REMAINING`, ...)
- `<CAP>` maps directly to module capability flags (see §2.2), e.g. `DELIVERY_BEAM`, `PIERCES_ARMOR`, `IGNORES_SHIELD`

Design constraint for future-proofing:
- unknown `<KEY>`/`<CAP>` must be handled deterministically.
- The project must pick one policy **per ruleset/DSL version**:
  - compile-time error (typo-safe, stricter)
  - runtime `0/false` (more extensible) + replay/debug warning

---

## 5) Future-proof sensing: add generic counters before bespoke predicates

Spawn modules (helper bots/minions) create new entity types.
Instead of adding many one-off predicates, prefer generic primitives like:
- `OWNED_COUNT(<ENTITY_KIND>)`
- `ENEMY_COUNT(<ENTITY_KIND>)`
- `DIST_TO_CLOSEST(<ENTITY_KIND>)`

Recommended player-facing sugar on top of those primitives:
- `DRONE_COUNT()` → `OWNED_COUNT(HEAL_DRONE)`
- `COUNT_ALIVE_ENEMIES()`
- `ENEMIES_IN_RANGE(n)`
- `DIST_TO_CLOSEST_POWERUP(ANY|HEALTH|AMMO|ENERGY)`
- `LOWEST_HEALTH_ENEMY_IN_RANGE(n)`

Then layer convenience predicates later if needed.

---

## 6) Minions / helper bots design (future)

Model helpers as first-class simulation entities:
- `entityId`, `kind`, `ownerBotId`
- deterministic movement pattern (orbit/seek)
- deterministic effect (heal, shield, intercept)
- optional `hp` / `hitPoints` so helpers can be destroyed by attacks
- optional `energyDrainPerTick` so helpers vanish if the owner can no longer support them

Important design constraints:
- helpers must have deterministic update order (entity id ascending)
- their resource drain (e.g., "heals but consumes owner energy") is explicit and tick-based

Bot interaction:
- bots use `USE_SLOTn` to spawn/command helpers
- bots use generic counters to decide when to spawn/stop them

Recommended first helper module:
- `REPAIR_DRONE`
  - costs ammo to spawn
  - creates small orbiting drones around the owner
  - drones heal in pulses / phases
  - drones are destroyed if hit by bullets
  - remaining drones vanish if owner energy reaches 0
  - ideal player-facing counter: `DRONE_COUNT()`

---

## 7) Versioning and backwards compatibility

To keep old scripts/replays meaningful:
- every bot version stores:
  - `ruleset_version`
  - compiled IR hash
- every replay references:
  - `ruleset_version`
  - bot version hashes

When adding a new module type:
- increase ruleset version
- do not change the meaning of old instructions
- prefer additive changes

---

## 8) Practical near-term recommendations

- Introduce `USE_SLOTn` as the canonical extensibility instruction.
- Standardize `<TARGET>` kinds early (`BOT`, `LOCATION`, `DIRECTION`, `NONE`) so new module targeting stays additive.
- Keep existing `FIRE_SLOTn` as an alias/sugar for compatibility and readability.
- Add a small generic introspection surface (`SLOT_QUERY`, `SLOT_HAS_CAP`) rather than many bespoke opcodes.
- Add a thin layer of high-value tactical sugar on top of the stable core:
  - range-management movement helpers
  - enemy-count / powerup-distance helpers
  - small deterministic bot-local variables
- Prefer new module work to be implemented via module behavior + data, not new opcodes.
- When new opcodes are unavoidable, treat them as sugar that compiles down to a stable internal IR.
