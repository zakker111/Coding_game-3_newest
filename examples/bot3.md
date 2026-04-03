# Built-in bot: Corner Bunker (BULLET)

**Suggested loadout**
- `SLOT1 = BULLET`
- `SLOT2 = (empty)`
- `SLOT3 = (empty)`

**Intended behavior**
- Defaults to a fixed “home” location.
- If bullets are nearby, briefly dodges to avoid sitting in a firing lane.
- If a bot is **very close** (or we just bumped), briefly sidesteps within its current sector.
- If resources are low, sets a **powerup move goal** to the nearest relevant powerup.
- Uses `WAIT` to briefly **commit** to a powerup run (keeps walking toward the goal while not re-planning).
- Opportunistically fires using an **inline selector** (no target register).

## Script

```text
;@slot1 BULLET
;@slot2 EMPTY
;@slot3 EMPTY
; bot3 — Corner Bunker
; Loadout: SLOT1=BULLET
; Summary: hold a home corner; avoid bump-lock; dodge bullets; run to powerups when low (with a short WAIT); shoot NEAREST_BOT when close.

SET_MOVE_TO_SECTOR 1 ZONE 1

LABEL LOOP

; If we're about to collide, sidestep within our current sector.
IF (DIST_TO_CLOSEST_BOT() <= 32 || BUMPED_BOT()) GOTO BACKOFF

; If enemy bullets are nearby, dodge for a tick.
IF (BULLET_IN_SAME_SECTOR() || BULLET_IN_ADJ_SECTOR()) GOTO DODGE_BULLETS

; Pick a powerup goal (priority: health → ammo).
; (Thresholds are tuned so this behavior is visible in short Workshop runs.)
IF (HEALTH < 70 && POWERUP_EXISTS(HEALTH)) DO SET_MOVE_TO_POWERUP HEALTH
IF (AMMO < 80 && POWERUP_EXISTS(AMMO)) DO SET_MOVE_TO_POWERUP AMMO

; If we decided to go get a powerup, commit for 2 ticks while the goal keeps moving us.
; Note: WAIT is control-flow and cannot be nested under IF (...) DO ....
IF ((HEALTH < 70 && POWERUP_EXISTS(HEALTH)) || (AMMO < 80 && POWERUP_EXISTS(AMMO))) GOTO COMMIT_POWERUP

; Otherwise, go back home.
IF (HEALTH >= 70 && AMMO >= 80) DO SET_MOVE_TO_SECTOR 1 ZONE 1

; Only shoot when something is fairly close (helps conserve ammo).
IF (SLOT_READY(SLOT1) && DIST_TO_CLOSEST_BOT() <= 120) DO FIRE_SLOT1 NEAREST_BOT

GOTO LOOP

LABEL COMMIT_POWERUP
WAIT 2
GOTO LOOP

LABEL BACKOFF
; Step to the opposite zone in our current sector, then resume normal logic.
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
```