# bot3 — The Rocket Soldier (ROCKET + SHIELD)

**Suggested loadout**
- `SLOT1 = ROCKET`
- `SLOT2 = SHIELD`
- `SLOT3 = (empty)`

**Intended behavior**
Fights at medium range (48–160 units) where rockets deal splash damage to clustered enemies. Raises the shield reactively when a bullet is closing in. Manages energy carefully since both the shield and rocket system need it. Repositions if enemies get too close for safe rocket fire.

Concepts demonstrated: AoE weapon spacing, reactive `SHIELD ON/OFF` with timers, energy management, `SET_MOVE_AWAY_FROM_BOT` when overcrowded.

## Script

```text
;@slot1 ROCKET
;@slot2 SHIELD
;@slot3 EMPTY
; bot3 — The Rocket Soldier
; Loadout: SLOT1=ROCKET, SLOT2=SHIELD
; Strategy: hold medium range for rocket splash; raise shield reactively vs bullets;
;           manage energy carefully since both modules need it.

SET_MOVE_TO_BOT CLOSEST_BOT

LABEL LOOP

; Raise shield when a bullet is incoming — keep it on for at least 4 ticks.
TARGET_CLOSEST_BULLET
IF (HAS_TARGET_BULLET() && DIST_TO_TARGET_BULLET() <= 72 && SLOT_READY(SLOT2) && !SLOT_ACTIVE(SLOT2)) DO SHIELD ON
IF (HAS_TARGET_BULLET() && DIST_TO_TARGET_BULLET() <= 72) DO SET_TIMER T2 4
IF (TIMER_DONE(T2) && SLOT_ACTIVE(SLOT2)) DO SHIELD OFF

; Energy check — shield needs reserves.
IF (ENERGY < 35 && POWERUP_EXISTS(ENERGY)) GOTO REFUEL

; Health check.
IF (HEALTH < 35 && POWERUP_EXISTS(HEALTH)) GOTO HEAL

; Target the weakest enemy — rockets at low-HP targets can secure kills.
TARGET_LOWEST_HEALTH
SET_MOVE_TO_TARGET

; Keep minimum distance — rockets deal splash; firing too close hurts us too.
IF (DIST_TO_CLOSEST_BOT() < 48) DO SET_MOVE_AWAY_FROM_BOT CLOSEST_BOT

; Fire when in effective range.
IF (HAS_TARGET_BOT() && SLOT_READY(SLOT1) && DIST_TO_TARGET_BOT() >= 48 && DIST_TO_TARGET_BOT() <= 160) DO USE_SLOT1 TARGET

GOTO LOOP

LABEL REFUEL
CLEAR_TARGET_BOT
IF (SLOT_ACTIVE(SLOT2)) DO SHIELD OFF
TARGET_POWERUP ENERGY
SET_MOVE_TO_TARGET
WAIT 4
CLEAR_MOVE
GOTO LOOP

LABEL HEAL
CLEAR_TARGET_BOT
TARGET_POWERUP HEALTH
SET_MOVE_TO_TARGET
WAIT 4
CLEAR_MOVE
SET_MOVE_TO_BOT CLOSEST_BOT
GOTO LOOP
```
