# Bot Instruction List (v1)

> Canonical **stable v1 bot language** reference.
> For future-proof planning (lasers/snipers/teleport/grenades/mines/helpers) without bloating the opcode list, see `BotLanguageDesign.md`.

## Core execution rules (do not skip)

- **1 instruction per tick**: each bot executes exactly one runtime instruction per simulation tick at its current `pc`.
- **Invalid instruction**: if the current instruction is malformed/invalid at runtime, treat it as `NOP`, and **reset `pc` to `1` next tick** (per-bot; the match continues).
- **Labels are compile-time**: `LABEL <name>` does not consume a tick and is removed from the executable instruction list.
- **Death**: if `HEALTH == 0`, the bot is dead and is ignored by targeting/movement helpers (see `Ruleset.md`).

## What bots can do

- Branch (`GOTO`, `IF ... GOTO`, `IF ... DO ...`) and wait (`WAIT`, timers).
- Select targets (bot targets, bullet targets, and powerup-type targets).
- Move immediately (`MOVE`, `MOVE_TO_*`) or set a persistent navigation goal (`SET_MOVE_TO_*`).
- Use equipped modules (module-type sugar like `FIRE_BULLET`, or slot-addressed `USE_SLOTn` / `STOP_SLOTn`).

## What bots cannot do

- Execute >1 instruction per tick.
- Create randomness, read wall-clock time, or perform non-deterministic operations.
- Call arbitrary functions or define new functions/macros beyond `LABEL` targets.
- Mutate the game outside the provided instruction set (no spawning, no direct stat edits, etc.).

---

## 0) Source format (comments, blank lines, `pc`)

Preprocessing (v1):
- Blank lines: ignored.
- Comments: ignored if the first non-whitespace character is `;`.
- `LABEL <name>`: compile-time directive; removed from the executable list; used as a jump target.

`pc` model (v1):
- `pc` is **1-indexed** into the executable instruction list after preprocessing.
- For replay/UI, keep a mapping `pc -> originalSourceLine`.

Optional (non-semantic) UI metadata directives (still comments):
- `;@name <text>`
- `;@appearance <value>`
  - v1 suggestion: `#RRGGBB` (hex color)
  - future suggestion: `asset:<id>` or `hash:<contentHash>`

Loadout header directives (UI-derived; still comments):
- `;@slot1 <MODULE|EMPTY>`
- `;@slot2 <MODULE|EMPTY>`
- `;@slot3 <MODULE|EMPTY>`

Rules for these header directives (v1):
- If present, they must be the **first 3 non-blank lines** of the bot source.
- Workshop/UI should generate and maintain them; the editor treats them as **locked** (not user-editable).
- These directives are **UI-generated metadata**, not gameplay input.
  - The compiler ignores them as comments.
  - The simulation engine does **not** read these directives directly; only a match runner/UI may choose to parse them and pass a structured `loadout` into the engine.
  - In rulesetVersion `0.2.0`, the authoritative loadout comes from the match config (or Workshop structured state), not from these lines.
  - In `0.2.0`, the Workshop/UI may still round-trip these lines as a serialization of its structured `loadout` state (and replay exports may map that structured loadout into replay header `bots[].loadout`).
- If omitted: the loadout directives are **unspecified** (there is no directive-defined loadout).
  - For `rulesetVersion = 0.2.0`, if match input omits `loadout`, the engine default is `EMPTY/EMPTY/EMPTY` (`[null, null, null]`).
  - Match runners/UIs should pick an explicit default (if any) and pass it as structured `loadout` rather than relying on source heuristics.

---

## 0.5) Tokens / notation

### Value sets

- `<BOT>`: `BOT1 | BOT2 | BOT3 | BOT4`
- `<TYPE>`: `HEALTH | AMMO | ENERGY`
- `<REG>`: `R1 | R2 | R3 | R4`
- `<DIR>`: `UP | DOWN | LEFT | RIGHT | UP_LEFT | UP_RIGHT | DOWN_LEFT | DOWN_RIGHT`
- `<SECTOR>`: `1..9`
- `<ZONE>`: `1..4`
- `<SLOT>`: `SLOT1 | SLOT2 | SLOT3`
- `<TIMER>`: `T1 | T2 | T3`

### Targets

- `<LOC>`:
  - `SECTOR <SECTOR>` (sector center)
  - `SECTOR <SECTOR> ZONE <ZONE>` (zone center)

- `<BOT_TARGET>` (subset of `<TARGET>`):
  - `BOT1|BOT2|BOT3|BOT4|TARGET|CLOSEST_BOT|NEAREST_BOT|LOWEST_HEALTH_BOT|WEAKEST_BOT`

- `<TARGET>`:
  - `<BOT_TARGET> | <LOC> | SELF | NONE`

Notes:
- `NEAREST_BOT` is an alias of `CLOSEST_BOT`.
- `WEAKEST_BOT` is an alias of `LOWEST_HEALTH_BOT`.
- `TARGET` (as an argument token) means “use my current `targetBotId`”.
- Inline selectors (`CLOSEST_BOT`, `LOWEST_HEALTH_BOT`, etc.) are resolved deterministically when the instruction executes; they **do not** write the target register.
- A deferred aim-direction target form (`DIR ...`) is **not** part of stable v1 (see `BotLanguageDesign.md`).

Loadout notes (v1):
- The language supports 3 slots (`SLOT1..SLOT3`) and slot-addressed actions.
- **Current engine (`rulesetVersion = 0.2.0`)**: module availability comes only from the per-bot match-input `loadout` (or equivalent structured UI state). The engine does **not** infer modules from `sourceText` (no scanning for `SAW`/`SHIELD`), and it does not treat `;@slot*` directives as authoritative gameplay input.
- Workshop/UI may generate locked source headers (`;@slot1`, `;@slot2`, `;@slot3`) as the first 3 non-blank lines (see §0); these are UI-derived comments for UX/editor ergonomics and are not authoritative.
- **rulesetVersion `0.2.0` (current engine behavior):** explicit per-bot loadout is authoritative and comes from match config (or Workshop structured state).
  - If `loadout` is missing/omitted, it defaults to `EMPTY/EMPTY/EMPTY`.
  - Invalid loadouts are **deterministically normalized** (the match does not fail solely due to loadout shape/content):
    1. Coerce to 3 slots: take the first 3 entries; if fewer, pad with `EMPTY`.
    2. Unknown module ids → `EMPTY` (record `UNKNOWN_MODULE`).
    3. Deduplicate modules: keep the earliest occurrence; later duplicates → `EMPTY` (record `DUPLICATE`).
    4. Enforce weapon limit: keep only the earliest weapon among `{BULLET, SAW, GRENADE}`; later weapons → `EMPTY` (record `MULTI_WEAPON`).
  - Important: if a match runner omits `loadout`, bots will have `EMPTY/EMPTY/EMPTY` and slot-based module instructions will no-op.
  - UX contract: if `loadoutIssues` is non-empty, UIs/replay viewers should surface it as a **visible, non-blocking warning/error** (the match still runs).
- **rulesetVersion `0.1.0` (legacy; not current engine behavior):** per-bot loadouts were not a first-class match input; module capability was inferred from source scanning:
  - if the source contains token `SAW`: the bot is saw-capable
  - if the source contains token `SHIELD`: the bot is shield-capable
  - otherwise: `SLOT1=BULLET`, `SLOT2=EMPTY`, `SLOT3=EMPTY`

---

## 1) Aliases & determinism (v1)

Aliases are for readability and are deterministic.

### Compile-time name aliases (pure renames)

- `TARGET_NEAREST` → `TARGET_CLOSEST`
- `TARGET_CLOSEST_BOT` → `TARGET_CLOSEST`
- `TARGET_WEAKEST` → `TARGET_LOWEST_HEALTH`
- `TARGET_CLOSEST_POWERUP <TYPE>` → `TARGET_POWERUP <TYPE>`
- `MOVE_TO_CLOSEST_POWERUP <TYPE>` → `MOVE_TO_POWERUP <TYPE>`
- `MOVE_TO_NEAREST_BOT` → `MOVE_TO_CLOSEST_BOT`
- `MOVE_TO_WEAKEST_BOT` → `MOVE_TO_LOWEST_HEALTH_BOT`
- `MOVE_TO_WALL UP|DOWN|LEFT|RIGHT` → `MOVE_TO_ARENA_EDGE UP|DOWN|LEFT|RIGHT`
- `HOLD_POSITION` → `CLEAR_MOVE`
- `RETREAT_TO_SECTOR <SECTOR> [ZONE <ZONE>]` → `SET_MOVE_TO_SECTOR <SECTOR> [ZONE <ZONE>]`
- `FIRE_SLOT1 <TARGET>` → `USE_SLOT1 <TARGET>`
- `FIRE_SLOT2 <TARGET>` → `USE_SLOT2 <TARGET>`
- `FIRE_SLOT3 <TARGET>` → `USE_SLOT3 <TARGET>`
- `NEAREST_BOT` → `CLOSEST_BOT`
- `WEAKEST_BOT` → `LOWEST_HEALTH_BOT`

### Runtime-evaluated sugar (still deterministic)

- `MOVE_TO_ZONE <ZONE>` behaves like `MOVE_TO_SECTOR SECTOR() ZONE <ZONE>` (evaluates `SECTOR()` once when executed).
- `SET_MOVE_TO_ZONE <ZONE>` behaves like `SET_MOVE_TO_SECTOR SECTOR() ZONE <ZONE>` (evaluates `SECTOR()` once when executed).

---

## 2) Instruction set (quick reference)

### 2.1 Control flow

| Instruction | Effect |
|---|---|
| `LABEL <name>` | Compile-time label (not a runtime tick). |
| `GOTO <name>` | Jump to label. |
| `IF <EXPR> GOTO <name>` | If expression true, jump. |
| `IF <EXPR> DO <INSTR>` | If expression true, execute exactly one **non-control** instruction; else do nothing. |
| `NOP` | Do nothing. |

### 2.2 Timing

| Instruction | Type | Notes |
|---|---:|---|
| `WAIT <TICKS>` | blocking | While waiting, bot executes no other instructions (equivalent to repeated `NOP`). Recommended deterministic implementation: store `waitRemaining=<TICKS>` without advancing `pc`; decrement each tick; advance when reaches 0. |
| `SET_TIMER <TIMER> <TICKS>` | non-blocking | Overwrites remaining ticks. Timers decrement at the **start of each bot tick** (before instruction execution), to a minimum of 0. |
| `CLEAR_TIMER <TIMER>` | non-blocking | Sets remaining ticks to 0. |

---

## 3) Target selection

Bot state:
- `targetBotId` (optional)
- `targetBulletId` (optional)
- `targetPowerupType` (optional)

### 3.1 Bot target register writes

Tie-break rule for “closest” / “lowest health”: **lowest bot id wins**.

| Instruction | Effect |
|---|---|
| `SET_TARGET <BOT>` | `targetBotId = <BOT>` |
| `TARGET_CLOSEST` | Set `targetBotId` to closest alive bot. (Aliases: `TARGET_NEAREST`, `TARGET_CLOSEST_BOT`) |
| `TARGET_LOWEST_HEALTH` | Set `targetBotId` to alive bot with lowest health. (Alias: `TARGET_WEAKEST`) |
| `TARGET_NEXT` | Advance target to next bot (details in engine/rules). |
| `TARGET_NEXT_IF_DEAD` | Like `TARGET_NEXT`, but only if current target is dead/invalid. |

### 3.2 Bullet target register writes

Bullets are first-class entities with stable `bulletId` ordering.

Tie-break rule for `TARGET_CLOSEST_BULLET`: closest by Manhattan distance; ties break by **earliest creation order** (lowest numeric `bulletId`, e.g. `B1 < B2 < …`).

| Instruction | Effect |
|---|---|
| `TARGET_CLOSEST_BULLET` | Set `targetBulletId` to the closest enemy bullet. If none exist, clears `targetBulletId`. |

### 3.3 Powerup target register writes

Bots have global knowledge of powerup locations.

| Instruction | Effect |
|---|---|
| `TARGET_POWERUP <TYPE>` | `targetPowerupType = <TYPE>` |
| `TARGET_CLOSEST_POWERUP <TYPE>` | Alias of `TARGET_POWERUP <TYPE>` (kept for readability). |

Powerup target invalidation:
- `targetPowerupType` is a **type preference**, not an instance.
- If **no** powerup of that type exists anywhere:
  - `MOVE_TO_TARGET` and `MOVE_TO_POWERUP <TYPE>` are no-ops.
  - At end of tick, `targetPowerupType` is auto-cleared.

Priority:
- If both `targetBotId` and `targetPowerupType` are set, `MOVE_TO_TARGET` prefers the bot target unless you clear it.

### 3.4 Clearing targets

| Instruction | Effect |
|---|---|
| `CLEAR_TARGET_BOT` | Clear `targetBotId`. |
| `CLEAR_TARGET_BULLET` | Clear `targetBulletId`. |
| `CLEAR_TARGET_POWERUP` | Clear `targetPowerupType`. |
| `CLEAR_TARGET` | Clear all targets. |

---

## 4) Movement

General rules:
- Movement is continuous world units (see `ArenaPlan.md`).
- Per tick, at most one movement attempt occurs: either the executed instruction’s immediate move, or the active move-goal move.
- Speed cap per tick: `speedUnitsPerTick` (see `Ruleset.md` §1.2).

### 4.1 Immediate movement (this tick)

| Instruction | Effect |
|---|---|
| `MOVE <DIR>` | Request movement in one of 8 directions. Uses deterministic fixed-point normalization so diagonal movement still has length `<= speedUnitsPerTick`. |
| `MOVE_TO_SECTOR <SECTOR>` | Move toward sector center. |
| `MOVE_TO_SECTOR <SECTOR> ZONE <ZONE>` | Move toward zone center. |
| `MOVE_TO_ZONE <ZONE>` | Deterministic sugar: uses `SECTOR()` at execution time (see §1). |
| `MOVE_TO_BOT <BOT>` | Move toward that bot’s current position; if dead, no-op. |
| `MOVE_TO_POWERUP <TYPE>` | Move toward closest currently-existing powerup of that type (tie-break rules below). |
| `MOVE_TO_CLOSEST_POWERUP <TYPE>` | Alias of `MOVE_TO_POWERUP <TYPE>`. |
| `MOVE_TO_CLOSEST_BOT` | Move toward closest alive bot (ties: lowest bot id). Alias: `MOVE_TO_NEAREST_BOT`. |
| `MOVE_TO_LOWEST_HEALTH_BOT` | Move toward lowest-health alive bot (ties: lowest bot id). Alias: `MOVE_TO_WEAKEST_BOT`. |
| `MOVE_TO_ARENA_EDGE UP|DOWN|LEFT|RIGHT` | Move toward outer boundary in that direction; if already touching, no-op. |
| `MOVE_TO_WALL UP|DOWN|LEFT|RIGHT` | Alias of `MOVE_TO_ARENA_EDGE ...`. |
| `MOVE_TO_TARGET` | If valid `targetBotId`: like `MOVE_TO_BOT <targetBotId>`; else if valid `targetBulletId`: move away/toward uses bullet position; else if valid `targetPowerupType`: like `MOVE_TO_POWERUP <type>`; else no-op. |
| `MOVE_AWAY_FROM_TARGET` | Move away from the currently selected target. Resolution priority: `targetBotId` (alive) > `targetBulletId` (exists) > `targetPowerupType` (exists). |
| `MOVE_TO_TARGET_UNTIL_IN_RANGE <N>` | Set a persistent movement goal using `MOVE_TO_TARGET` resolution each tick, and auto-clear it once the resolved target is within Manhattan distance `<= N`. If no valid target resolves, the goal clears and no movement occurs. |
| `MOVE_AWAY_FROM_TARGET_UNTIL_RANGE <N>` | Set a persistent movement goal using `MOVE_AWAY_FROM_TARGET` resolution each tick, and auto-clear it once the resolved target is at Manhattan distance `>= N`. If already far enough, this is effectively a no-op. |

Direction vectors for `MOVE <DIR>` (components in `{-1,0,+1}`):
- `UP` → `(0, -1)`
- `DOWN` → `(0, 1)`
- `LEFT` → `(-1, 0)`
- `RIGHT` → `(1, 0)`
- `UP_LEFT` → `(-1, -1)`
- `UP_RIGHT` → `(1, -1)`
- `DOWN_LEFT` → `(-1, 1)`
- `DOWN_RIGHT` → `(1, 1)`

Powerup tie-breaks for `MOVE_TO_POWERUP <TYPE>` (deterministic):
1) shortest Manhattan distance (see §6)
2) lowest sector id
3) sector center beats zones
4) lowest zone id

### 4.2 Deterministic “move toward point” rule (v1)

Given current position `p=(x,y)` and target point `t=(tx,ty)`:
- `v=(vx,vy)=(tx-x, ty-y)`
- If `vx==0 && vy==0`: no movement
- Else using deterministic fixed-point math (no platform floats):
  - `dist2 = vx*vx + vy*vy`
  - If `dist2 <= speedUnitsPerTick^2`: `delta=(vx,vy)` (snap to point)
  - Else: `dist = sqrt(dist2)` (deterministic), `delta = (vx,vy) * speedUnitsPerTick / dist`

Discrete direction token (`dir`) used by `BUMPED_*_DIR(...)` and replay events:
- For `MOVE <DIR>`: `dir` is the requested `<DIR>`.
- For point/goal movement: derive `dir` from the sign of `(vx,vy)` deterministically:
  - `vy==0` → `LEFT|RIGHT`
  - `vx==0` → `UP|DOWN`
  - else one of `UP_LEFT|UP_RIGHT|DOWN_LEFT|DOWN_RIGHT`

### 4.3 Persistent navigation goals (move while doing other actions)

When a goal is set, the bot attempts to move toward it every tick (unless an immediate move instruction was executed that tick).

| Instruction | Effect |
|---|---|
| `SET_MOVE_TO_SECTOR <SECTOR>` | Set point goal: sector center. |
| `SET_MOVE_TO_SECTOR <SECTOR> ZONE <ZONE>` | Set point goal: zone center. |
| `SET_MOVE_TO_ZONE <ZONE>` | Deterministic sugar: uses `SECTOR()` at execution time (see §1). |
| `SET_MOVE_TO_BOT <BOT_TARGET>` | Follow a bot. If `<BOT_TARGET>` is `CLOSEST_BOT/NEAREST_BOT/LOWEST_HEALTH_BOT/WEAKEST_BOT`, it re-resolves each tick. If `TARGET`, follows `targetBotId`. If `BOT1..BOT4`, follows that bot until it dies. |
| `SET_MOVE_TO_POWERUP <TYPE>` | Re-resolves each tick to closest powerup of that type; clears when picked up; clears if none exist. |
| `SET_MOVE_TO_TARGET` | Follow `MOVE_TO_TARGET` resolution every tick. |
| `ORBIT_TARGET` | Set a persistent orbit goal around the current bot target. Current first version: clockwise orbit with a fixed default radius band; if no valid bot target exists, the goal clears and no movement occurs. |
| `RETREAT_TO_SECTOR <SECTOR>` | Alias of `SET_MOVE_TO_SECTOR <SECTOR>`. |
| `RETREAT_TO_SECTOR <SECTOR> ZONE <ZONE>` | Alias of `SET_MOVE_TO_SECTOR <SECTOR> ZONE <ZONE>`. |
| `CLEAR_MOVE` | Clear current movement goal. |
| `HOLD_POSITION` | Alias of `CLEAR_MOVE`. Clears any active movement goal and leaves the bot stationary unless a later move instruction or goal is set. |

Resolution order each tick (recommended):
1) if the executed instruction is an immediate movement instruction (§4.1), use it
2) else if a movement goal is active, move toward the goal
3) else no movement

Goal completion:
- Point goals (sector/zone centers): clear when reached (recommended: snap and clear if remaining distance `<= speedUnitsPerTick`).
- `SET_MOVE_TO_BOT` / `SET_MOVE_TO_TARGET`: clear when the resolved bot is dead/missing.
- `ORBIT_TARGET`: clear when there is no valid living bot target to orbit.
- `MOVE_TO_TARGET_UNTIL_IN_RANGE <N>`: clear when the resolved target is within Manhattan distance `<= N`.
- `MOVE_AWAY_FROM_TARGET_UNTIL_RANGE <N>`: clear when the resolved target is at Manhattan distance `>= N`.

Collisions:
- Movement can be clamped/canceled by walls or other bots (see `Ruleset.md` §1.2).
- Bump events (`BUMPED_WALL*`, `BUMPED_BOT*`) apply regardless of whether the move came from immediate move or a goal.

---

## 5) Module actions

> If the required module is not equipped, the instruction does nothing.

### 5.1 Module-type spellings (syntax sugar over slots)

| Instruction | Resource | Notes |
|---|---:|---|
| `FIRE_BULLET <BOT_TARGET>` | ammo | If `AMMO==0`, no-op. Bullets are continuous projectiles and may hit any bot they collide with (16×16 bot hitbox), not only the chosen target. |
| `SAW ON` / `SAW OFF` | energy | When ON, drains energy per tick; auto-OFF at `ENERGY==0`. |
| `SHIELD ON` / `SHIELD OFF` | energy | When ON, drains energy per tick; auto-OFF at `ENERGY==0`. Current engine (`rulesetVersion = 0.2.0`): mitigates bullet damage by **50%**. |

Armor note:
- `ARMOR` is a passive module (no active use).
- In rulesetVersion `0.2.0` (current engine behavior), if equipped in any slot:
  - mitigates **all incoming damage**: `amount := amount - floor(amount/3)`
  - applies a movement speed penalty: `speedUnitsPerTick = floor(12 * 3/4) = 9`
  - bullet mitigation ordering when both apply: apply `SHIELD` first, then `ARMOR`
- Slot semantics for passive modules (`ARMOR`) (v1 stable):
  - `SLOT_READY(<SLOT>)` is `true` if equipped in that slot.
  - `SLOT_ACTIVE(<SLOT>)` is always `false`.
  - `USE_SLOTn ...` and `STOP_SLOTn` are deterministic no-ops (and should not spend ammo/energy or start cooldowns).

Future-proofing note:
- In v1, these spellings are unambiguous because v1 forbids duplicate modules.
- If duplicates are ever allowed, module-type spellings without a slot should become a compile-time error or be removed in favor of `USE_SLOTn`.

### 5.2 Slot-addressed actions (future-proof primitives)

| Instruction | Effect |
|---|---|
| `USE_SLOT1 <TARGET>` | Use module in `SLOT1` with `<TARGET>`. |
| `USE_SLOT2 <TARGET>` | Use module in `SLOT2` with `<TARGET>`. |
| `USE_SLOT3 <TARGET>` | Use module in `SLOT3` with `<TARGET>`. |
| `STOP_SLOT1` | Request module in `SLOT1` to stop/cancel (toggles OFF; others may no-op). |
| `STOP_SLOT2` | Same for `SLOT2`. |
| `STOP_SLOT3` | Same for `SLOT3`. |

Target kinds accepted by `USE_SLOTn`:
- bot targets: `BOT1..BOT4`, `TARGET`, `CLOSEST_BOT/NEAREST_BOT`, `LOWEST_HEALTH_BOT/WEAKEST_BOT`
- location targets: `SECTOR <SECTOR>`, `SECTOR <SECTOR> ZONE <ZONE>`
- `SELF`, `NONE`

Wrong target kind:
- Deterministic no-op (no cost, no cooldown). Recommended replay/debug reason: `INVALID_TARGET_KIND`.

`STOP_SLOTn` stable contract (v1+):
- “Request to stop/cancel whatever the module in this slot is currently doing.”
- Toggles (SAW/SHIELD): turns OFF.
- Passive or instant modules: deterministic no-op.
  - Example: `ARMOR` has no active state to stop (`SLOT_ACTIVE(<SLOT>)` is always `false`), and `STOP_SLOTn` is a no-op even when `SLOT_READY(<SLOT>)` is `true` due to being equipped.
- Future modules: module defines what “stop” means; call must remain deterministic and should emit a replay/debug reason if it had no effect.

Compatibility aliases (v1):
- `FIRE_SLOT1 <TARGET>` (alias of `USE_SLOT1 <TARGET>`)
- `FIRE_SLOT2 <TARGET>` (alias of `USE_SLOT2 <TARGET>`)
- `FIRE_SLOT3 <TARGET>` (alias of `USE_SLOT3 <TARGET>`)

Current engine module behavior when used via `USE_SLOTn` / `FIRE_SLOTn`:
- **BULLET**: fires only at bot targets (`<BOT_TARGET>`); non-bot targets are `INVALID_TARGET_KIND` no-ops.
- **GRENADE**: throws only at bot targets (`<BOT_TARGET>`); non-bot targets are `INVALID_TARGET_KIND` no-ops. Grenades travel as projectiles, then explode after a short fuse and deal AoE damage in the destination sector and adjacent sectors.
- **SAW**: same as `SAW ON` (target ignored).
- **SHIELD**: same as `SHIELD ON` (target ignored).
- **ARMOR**: passive module; `USE_SLOTn ...` and `STOP_SLOTn` are deterministic no-ops.

Optional convenience:
- `FIRE_TARGET <SLOT>`: use the given slot against the current `targetBotId` (no valid bot target → no-op; target powerup → no-op).

---

## 6) Registers and expressions (for `IF ...`)

### 6.0 Register instructions

The language includes four small integer registers for bot-local state.

- Registers: `R1`, `R2`, `R3`, `R4`
- Initial value: `0`
- Range: `0..999`
- Arithmetic clamps into that range (no wraparound)

| Instruction | Effect |
|---|---|
| `SET <REG> <N>` | Set register to `N` (clamped to `0..999`). |
| `INC <REG>` | Add `1`. |
| `DEC <REG>` | Subtract `1`. |
| `ADD <REG> <N>` | Add `N`. |
| `SUB <REG> <N>` | Subtract `N`. |

Expression language is deterministic and C-like.

### 6.1 Operators / evaluation

- Comparisons: `== != < <= > >=`
- Boolean: `&& || !` (short-circuiting, left-to-right)
- Grouping: `(` `)`
- All numeric values are integers.
- All functions below are pure (no side effects).

### 6.2 Built-in identifiers (must be supported)

| Identifier | Type | Notes |
|---|---:|---|
| `HEALTH` | int | 0..100 |
| `AMMO` | int | 0..100 |
| `ENERGY` | int | 0..100 |
| `TARGET_HEALTH` | int | If no valid target bot: `0`. Use `HAS_TARGET_BOT()` to test validity. |
| `R1` | int | Bot-local register, initial value `0`. |
| `R2` | int | Bot-local register, initial value `0`. |
| `R3` | int | Bot-local register, initial value `0`. |
| `R4` | int | Bot-local register, initial value `0`. |

### 6.3 Built-in functions (must be supported)

Bot / target state:
- `HAS_TARGET_BOT()` → bool
- `HAS_TARGET_BULLET()` → bool
- `BOT_ALIVE(<BOT>)` → bool

Location (derived from continuous position; tie-break boundaries deterministically, recommended lowest id):
- `SECTOR()` → int (1..9)
- `ZONE()` → int (1..4)
- `IN_ZONE(<ZONE>)` → bool (alias of `ZONE() == <ZONE>`)

Sector proximity:
- `BOT_IN_SAME_SECTOR(<BOT>)` → bool
- `BOT_IN_ADJ_SECTOR(<BOT>)` → bool

Distances (world units; Manhattan):
- Manhattan distance = `abs(dx) + abs(dy)`
- Unless otherwise stated, distances are between entity centers (bots/powerups) or between bot center and a named point (sector/zone center).
- `DIST_TO_BOT(<BOT>)` → int
- `DIST_TO_TARGET_BOT()` → int (no valid target bot → `999`)
- `DIST_TO_TARGET_BULLET()` → int (no valid target bullet → `999`)
- `DIST_TO_CLOSEST_BOT()` → int (none alive → `999`)
- `COUNT_ALIVE_ENEMIES()` → int
- `ENEMIES_IN_RANGE(<N>)` → int
- `LOWEST_HEALTH_ENEMY_IN_RANGE(<N>)` → int (lowest health among alive enemies within Manhattan range `N`; `0` if none are in range)
- `DIST_TO_SECTOR(<SECTOR>)` → int
- `DIST_TO_SECTOR_ZONE(<SECTOR>, <ZONE>)` → int

Powerups (global knowledge):
- `POWERUP_EXISTS(<TYPE>)` → bool
- `DIST_TO_CLOSEST_POWERUP(<TYPE>)` → int (none exist → `999`)
- `DIST_TO_CLOSEST_POWERUP(ANY)` → int (distance to nearest powerup of any type; none exist → `999`)
- `HAS_TARGET_POWERUP()` → bool

Powerups (by location):
- `POWERUP_IN_SECTOR(<TYPE>, <SECTOR>)` → bool
- `POWERUP_IN_SECTOR_CENTER(<TYPE>, <SECTOR>)` → bool
- `POWERUP_IN_ZONE(<TYPE>, <SECTOR>, <ZONE>)` → bool

Powerups (local convenience):
- `POWERUP_IN_SAME_SECTOR(<TYPE>)` → bool
- `POWERUP_IN_SAME_ZONE(<TYPE>)` → bool

Bullets/projectiles:
- `BULLET_IN_SAME_SECTOR()` → bool
- `BULLET_IN_ADJ_SECTOR()` → bool

Arena edges / walls (outer boundary in v1):
- `DIST_TO_ARENA_EDGE(UP|DOWN|LEFT|RIGHT)` → int (distance from bot collision box; `0` means touching)
- `DIST_TO_WALL(UP|DOWN|LEFT|RIGHT)` → int (alias of `DIST_TO_ARENA_EDGE`)

Bumps (last-tick results):
- `BUMPED_WALL()` → bool
- `BUMPED_WALL_DIR(<DIR>)` → bool
- `BUMPED_BOT()` → bool
- `BUMPED_BOT_IS(<BOT>)` → bool
- `BUMPED_BOT_DIR(<DIR>)` → bool

Bump semantics:
- Bump flags represent the most recent bump event.
- Collision resolution happens during tick `t`; bump flags are readable by the bot during tick `t+1`.
- Bump state resets after being exposed to the bot (and/or written into replay).
- Bot-to-bot bumps apply to both bots (mover sees movement direction; other sees opposite).

Timers:
- `TIMER_REMAINING(<TIMER>)` → int
- `TIMER_ACTIVE(<TIMER>)` → bool
- `TIMER_DONE(<TIMER>)` → bool

Slot/module state:
- `HAS_MODULE(<SLOT>)` → bool
- `COOLDOWN_REMAINING(<SLOT>)` → int
- `SLOT_READY(<SLOT>)` → bool (has module and is usable now: cooldown==0 and enough ammo/energy; passive modules like `ARMOR` count as ready when equipped even though `USE_SLOTn` / `STOP_SLOTn` are no-ops)
- `SLOT_ACTIVE(<SLOT>)` → bool (toggle modules only; passive modules like `ARMOR` are always `false`)

---

## 7) Small example scripts (v1)

For longer built-in examples, see `examples/bot0.md` … `examples/bot6.md`.

### Example 1 — Aggressive shooter (chase + shoot nearest)

```text
; Assumes BULLET in SLOT1
SET_MOVE_TO_BOT CLOSEST_BOT

LABEL LOOP
IF (SLOT_READY(SLOT1)) DO USE_SLOT1 NEAREST_BOT
GOTO LOOP
```

### Example 2 — Powerup runner (panic-heal, otherwise roam)

```text
LABEL LOOP
IF (HEALTH < 25 && POWERUP_EXISTS(HEALTH)) DO MOVE_TO_POWERUP HEALTH
IF (HEALTH >= 25) DO MOVE_TO_SECTOR 5
GOTO LOOP
```

### Example 3 — Saw brawler (turn saw on after a bump, timed off)

```text
; Assumes SAW module is equipped
LABEL LOOP
MOVE_TO_CLOSEST_BOT
IF (BUMPED_BOT()) DO SAW ON
IF (BUMPED_BOT()) DO SET_TIMER T1 5
IF (TIMER_DONE(T1)) DO SAW OFF
GOTO LOOP
```

### Example 4 — Corner bunker (go to wall, then shoot)

```text
; Assumes BULLET in SLOT1
MOVE_TO_WALL LEFT
MOVE_TO_WALL UP

LABEL LOOP
IF (SLOT_READY(SLOT1)) DO FIRE_SLOT1 CLOSEST_BOT
GOTO LOOP
```

### Example 5 — Zone patrol shooter (cycle zones in current sector)

```text
; Assumes BULLET in SLOT1
LABEL LOOP
IF (IN_ZONE(1)) DO SET_MOVE_TO_ZONE 2
IF (IN_ZONE(2)) DO SET_MOVE_TO_ZONE 4
IF (IN_ZONE(4)) DO SET_MOVE_TO_ZONE 3
IF (IN_ZONE(3)) DO SET_MOVE_TO_ZONE 1
IF (SLOT_READY(SLOT1)) DO USE_SLOT1 WEAKEST_BOT
GOTO LOOP
```

### Example 6 — Maintain spacing with a range goal

```text
LABEL LOOP
TARGET_CLOSEST
MOVE_TO_TARGET_UNTIL_IN_RANGE 96
IF (SLOT_READY(SLOT1)) DO FIRE_SLOT1 TARGET
GOTO LOOP
```

### Example 7 — Simple mode flag with a register

```text
LABEL LOOP
IF (HEALTH < 30) DO SET R1 1
IF (HEALTH >= 30) DO SET R1 0
IF (R1 == 1 && POWERUP_EXISTS(HEALTH)) DO RETREAT_TO_SECTOR 9
IF (R1 == 0) DO MOVE_TO_CLOSEST_BOT
GOTO LOOP
```

### Example 8 — Orbit a chosen bot while waiting for an opening

```text
LABEL LOOP
SET_TARGET BOT3
ORBIT_TARGET
IF (SLOT_READY(SLOT1) && LOWEST_HEALTH_ENEMY_IN_RANGE(96) <= 25) DO FIRE_SLOT1 TARGET
GOTO LOOP
```
