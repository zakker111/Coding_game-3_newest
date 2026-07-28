# bot0 — The Skirmisher (starter bot)

**Suggested loadout**
- `SLOT1 = BULLET`
- `SLOT2 = (empty)`
- `SLOT3 = (empty)`

**Intended behavior**
The starter bot. Chases and shoots the closest enemy. Dodges incoming bullets with a quick sidestep. Detours to heal or resupply when low. Breaks out of bump-lock by retreating to the opposite zone.

Concepts demonstrated: `TARGET_CLOSEST`, `SET_MOVE_TO_TARGET`, `USE_SLOT1 TARGET`, `BULLET_IN_SAME_SECTOR`, `MOVE_AWAY_FROM_TARGET`, `IF ... GOTO`, `WAIT`.

## Script

```text
;@slot1 BULLET
;@slot2 EMPTY
;@slot3 EMPTY
; bot0 — The Skirmisher (starter)
; Loadout: SLOT1=BULLET
; Strategy: chase and shoot the closest bot; sidestep bullets; detour for health/ammo when low.

LABEL LOOP

; Break out of bump-lock before anything else.
IF (BUMPED_BOT() || DIST_TO_CLOSEST_BOT() <= 28) GOTO BACKOFF

; Dodge incoming bullets with a quick evasive step.
IF (BULLET_IN_SAME_SECTOR() || BULLET_IN_ADJ_SECTOR()) GOTO DODGE

; Emergency heal.
IF (HEALTH < 35 && POWERUP_EXISTS(HEALTH)) GOTO HEAL

; Resupply ammo when running low.
IF (AMMO < 50 && POWERUP_EXISTS(AMMO)) GOTO RESUPPLY

; Main loop: chase + shoot.
TARGET_CLOSEST
SET_MOVE_TO_TARGET
IF (HAS_TARGET_BOT() && SLOT_READY(SLOT1)) DO USE_SLOT1 TARGET
GOTO LOOP

LABEL BACKOFF
CLEAR_MOVE
IF (IN_ZONE(1)) DO SET_MOVE_TO_ZONE 4
IF (IN_ZONE(2)) DO SET_MOVE_TO_ZONE 3
IF (IN_ZONE(3)) DO SET_MOVE_TO_ZONE 2
IF (IN_ZONE(4)) DO SET_MOVE_TO_ZONE 1
WAIT 2
CLEAR_MOVE
GOTO LOOP

LABEL DODGE
TARGET_CLOSEST_BULLET
IF (HAS_TARGET_BULLET()) DO MOVE_AWAY_FROM_TARGET
CLEAR_TARGET_BULLET
GOTO LOOP

LABEL HEAL
CLEAR_TARGET_BOT
TARGET_POWERUP HEALTH
SET_MOVE_TO_TARGET
WAIT 4
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
