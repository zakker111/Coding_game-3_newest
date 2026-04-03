# ArenaPlan.md — Arena, Walls, and Movement (Design Draft)

This document captures the current plan for the arena and wall interactions.

It is aligned with:
- `Todo.md`
- `BotInstructions.md`
- `DailyCompetition.md`

---

## 1) Arena topology (locked)

- The arena is a **3×3 grid of sectors** numbered:

  - `1 2 3`
  - `4 5 6`
  - `7 8 9`

- Standard match format is **4 bots** (`BOT1..BOT4`).
- Default spawn positions for 4-bot matches (locked): arena corners
  - spawn points are specified using sector/zone anchors and initialized at the corresponding anchor **center position**
  - `BOT1 → SECTOR 1 ZONE 1` (top-left)
  - `BOT2 → SECTOR 3 ZONE 2` (top-right)
  - `BOT3 → SECTOR 7 ZONE 3` (bottom-left)
  - `BOT4 → SECTOR 9 ZONE 4` (bottom-right)

Client-only testing note (optional, post-v1):
- The client may support **1v1 testing** by spawning only 2 bots in two corners (e.g., `SECTOR 1 ZONE 1` and `SECTOR 9 ZONE 4`).
- This is a UI/testing feature; server daily matches remain 4-bot.

### 1.1 World units: sectors + zones (locked)

- Each **sector** contains **zones `1..4`** arranged as a 2×2 grid:
  - `1 2`
  - `3 4`
- Each **zone** is **32×32 world units**.
- Each **sector** is therefore **64×64 world units**.
- The full arena is:
  - **width = 3 × 64 = 192 world units**
  - **height = 3 × 64 = 192 world units**

### 1.2 Coordinate mapping (sector/zone → world)

Assume world coordinates:
- origin `(0,0)` at the **top-left** of the arena
- `+x` to the right, `+y` downward

Sector mapping:
- `sectorRow = floor((sectorId - 1) / 3)`
- `sectorCol = (sectorId - 1) % 3`
- `sectorOrigin = (sectorCol * 64, sectorRow * 64)`

Zone mapping inside a sector:
- zone `1` → offset `(0, 0)`
- zone `2` → offset `(32, 0)`
- zone `3` → offset `(0, 32)`
- zone `4` → offset `(32, 32)`

Therefore:
- `zoneOrigin = sectorOrigin + zoneOffset`

### 1.3 Anchor points (sector center + zone centers)

We treat a "location" used by bot scripts and powerups as one of these deterministic reference points:

- **Sector center** (`SECTOR s`):
  - `sectorCenter = sectorOrigin + (32, 32)`

- **Zone center** (`SECTOR s ZONE z`):
  - `zoneCenter = zoneOrigin + (16, 16)`

These anchors are used for:
- bot movement targets (`MOVE_TO_SECTOR …`, `MOVE_TO_ZONE …`)
- powerup spawn points
- UI labeling/sensing (deriving sector/zone regions from `pos`)

Bots themselves are **continuous** (`pos = {x,y}`), so they are not restricted to sitting exactly on anchor points.

### 1.4 Powerup spawn anchors

Powerups can spawn at deterministic location anchors:
- **sector center**: `SECTOR <SECTOR>`
- **zone center**: `SECTOR <SECTOR> ZONE <ZONE>`

So each sector has **5** possible powerup locations (center + 4 zones), and the arena has **45**.

The **spawn timers/logic** are specified in `Ruleset.md`.

### 1.5 Client-side render sizing

The UI may scale world units to screen pixels.

Recommended v1 approach:
- Treat the world as **192×192 units**.
- Choose a `scale` factor for rendering (e.g., 2×, 3×, 4×) based on available screen size.
- Derived sizes:
  - `zoneRenderPx = 32 * scale`
  - `sectorRenderPx = 64 * scale`
  - `arenaRenderPx = 192 * scale`

If you still want a clamp, apply it to **`sectorRenderPx`** or **`arenaRenderPx`** rather than redefining world units.

---

## 2) Walls (gameplay)

You confirmed walls are part of gameplay:
- bots can **bump into walls**
- on bump:
  - bot takes a **small amount of damage**
  - the bot’s attempted movement for that tick is **clamped at the wall** (it does not pass through or reflect)
  - the UI/replay viewer should show a small **bounce** effect (purely rendering; see `ArenaVisualPlan.md` §5.7)

### 2.1 Wall layout

At minimum, walls include:
- an **outer boundary** around the 3×3 arena

Sector boundaries and zone boundaries are **visual grid lines** in v1, not blocking walls.
- This matches the "no doors" model (we are not modeling door openings).

Future:
- you can introduce internal blocking walls later, but then you’ll need a data-driven wall layout and likely a door/opening mechanic.

---

## 3) Collision representation (continuous, zone-aware)

Locked geometry:
- each bot has a **16×16 collision box**
  - treated as an axis-aligned bounding box (AABB)
  - centered at the bot’s continuous position `pos = { x, y }`
- each **zone** is **32×32**

v1 semantics:
- bots have a continuous `pos = {x,y}` in arena world units
  - world coordinate system is defined in §1.2 (`(0,0)` top-left; `+x` right; `+y` down)
  - positions are **deterministic numeric state** (recommended: integer fixed-point; see `Ruleset.md`)
- sectors/zones are **regions** (not discrete occupancy cells)
  - a bot is considered “in sector/zone” based on its **center position** `pos`
  - `sectorCol = floor(x / 64)`, `sectorRow = floor(y / 64)`
  - `zoneCol = floor((x % 64) / 32)`, `zoneRow = floor((y % 64) / 32)`
  - zone id = `1 + zoneCol + 2*zoneRow`

Outer wall constraints:
- the arena bounds are `[0,192] × [0,192]`
- to keep the full 16×16 bot hitbox inside the arena, bot center positions are clamped to:
  - `x ∈ [8, 184]`
  - `y ∈ [8, 184]`

---

## 4) Movement model (continuous positions; tick-based)

The simulation remains **tick-based**, but movement updates bot positions continuously.

Authoritative state:
- each alive bot has `pos = {x,y}` (continuous)
- sector/zone centers remain **deterministic reference points** for:
  - bot movement targets (`MOVE_TO_SECTOR …` / `MOVE_TO_ZONE …`)
  - powerup spawns
  - UI labeling/sensing (“in sector”, “in zone”, “dist to wall”, etc.)

Per-tick movement resolution (high-level):
- each tick, a bot may produce a movement request (from its instruction or persistent goal)
- the request becomes a candidate translation by up to `speedUnitsPerTick` (see `Ruleset.md`)
- the engine applies deterministic collision resolution:
  - bot-vs-wall: clamp to arena bounds (hitbox-aware)
  - bot-vs-bot: prevent overlap (stable resolution order `BOT1..BOT4`)
- bump events (`BUMP_WALL`, `BUMP_BOT`) are emitted as part of this resolution (see `Ruleset.md`)

Rendering note (client/viewer):
- gameplay remains tick-based and deterministic
- the UI/replay viewer may interpolate `pos` between tick snapshots for readability while playing

---

## 5) Recommended next step

Commit to continuous positions in v1, but keep the movement/collision rules intentionally simple:
- straight-line movement with 8-way direction support (cardinal + diagonal)
- deterministic fixed-point arithmetic (no platform floats)
- stable, documented collision resolution order (`BOT1..BOT4`)

If later you want richer “physics” (swept collision, elastic bounce, pushing), that can be a major ruleset change without changing the sector/zone reference system.

---

## 6) Open parameters

- `wallBumpDamage` (small integer; ruleset parameter, see `Ruleset.md`)
- **Bullets vs walls (locked v1):** bullets **stop at walls** and are **removed immediately** (emit replay event `BULLET_DESPAWN reason=WALL`).
- Doors:
  - **Locked:** there are **no doors**.



