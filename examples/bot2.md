# Built-in bot: Chaser Shooter (BULLET)

**Suggested loadout**
- `SLOT1 = BULLET`
- `SLOT2 = (empty)`
- `SLOT3 = (empty)`

**Intended behavior**
- Demonstrates **explicit target selection** using `BOT_ALIVE(...)` + `SET_TARGET`:
  - target BOT1 if alive; else BOT3; else BOT4
- If bullets are nearby, briefly dodges (so a bullet bot doesn’t just tunnel-vision).
- If a bot is **very close** (or we just bumped), briefly backs off toward the center before re-engaging.
- If health is low and a HEALTH powerup exists, commits briefly to a healing run.
- If ammo is low and an AMMO powerup exists (and we’re not currently healing), commits briefly to an ammo run.
- Chases the selected target using a **persistent movement goal** (`SET_MOVE_TO_TARGET`).
- Shoots the target via `USE_SLOT1 TARGET`.

## Script

```text
;@slot1 BULLET
;@slot2 EMPTY
;@slot3 EMPTY
; bot2 — Chaser Shooter
; Loadout: SLOT1=BULLET
; Summary: choose a target (BOT1→BOT3→BOT4), chase it, shoot it; avoid bump-lock; detour for HEALTH/AMMO; dodge enemy bullets.

LABEL LOOP

; If we're about to collide, sidestep within our current sector.
IF (DIST_TO_CLOSEST_BOT() <= 32 || BUMPED_BOT()) GOTO BACKOFF

; If enemy bullets are nearby, dodge for a tick.
IF (BULLET_IN_SAME_SECTOR() || BULLET_IN_ADJ_SECTOR()) GOTO DODGE_BULLETS

; Heal / resupply detours.
; (Thresholds are tuned so this behavior is visible in short Workshop runs.)
IF (HEALTH < 70 && POWERUP_EXISTS(HEALTH)) GOTO HEAL
IF (AMMO < 80 && POWERUP_EXISTS(AMMO)) GOTO RESUPPLY

; Target the first alive enemy in priority order.
; (This script is intended to run in the BOT2 slot, so we intentionally skip BOT2.)
IF (BOT_ALIVE(BOT1)) DO SET_TARGET BOT1
IF (!BOT_ALIVE(BOT1) && BOT_ALIVE(BOT3)) DO SET_TARGET BOT3
IF (!BOT_ALIVE(BOT1) && !BOT_ALIVE(BOT3) && BOT_ALIVE(BOT4)) DO SET_TARGET BOT4

SET_MOVE_TO_TARGET

IF (HAS_TARGET_BOT() && SLOT_READY(SLOT1)) DO USE_SLOT1 TARGET

GOTO LOOP

LABEL BACKOFF
; Break pursuit and step to the opposite zone in our current sector.
CLEAR_MOVE
IF (IN_ZONE(1)) DO SET_MOVE_TO_ZONE 4
IF (IN_ZONE(2)) DO SET_MOVE_TO_ZONE 3
IF (IN_ZONE(3)) DO SET_MOVE_TO_ZONE 2
IF (IN_ZONE(4)) DO SET_MOVE_TO_ZONE 1
WAIT 2
CLEAR_MOVE
GOTO LOOP

LABEL DODGE_BULLETS
; Quick evasive step: move to a different zone for 1 tick.
CLEAR_MOVE
IF (IN_ZONE(1)) DO SET_MOVE_TO_ZONE 2
IF (IN_ZONE(2)) DO SET_MOVE_TO_ZONE 4
IF (IN_ZONE(4)) DO SET_MOVE_TO_ZONE 3
IF (IN_ZONE(3)) DO SET_MOVE_TO_ZONE 1
WAIT 1
CLEAR_MOVE
GOTO LOOP

LABEL HEAL
CLEAR_TARGET_BOT
TARGET_POWERUP HEALTH
SET_MOVE_TO_TARGET
WAIT 3
CLEAR_MOVE
GOTO LOOP

LABEL RESUPPLY
CLEAR_TARGET_BOT
TARGET_POWERUP AMMO
SET_MOVE_TO_TARGET
WAIT 3
CLEAR_MOVE
GOTO LOOP
```