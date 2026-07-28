# bot6 — The Ghost (TELEPORT + SNIPER)

**Suggested loadout**
- `SLOT1 = TELEPORT`
- `SLOT2 = SNIPER`
- `SLOT3 = (empty)`

**Intended behavior**
Maintains sniper range and fires at the weakest enemy for maximum kill value. When enemies close in, it teleports to a corner sector to instantly reset positioning. Rotates through 4 corners using a register to stay unpredictable. Manages energy carefully since teleport has a cost.

Concepts demonstrated: `USE_SLOT1 SECTOR <N>` (teleport), `SNIPER` long cooldown, register-based state (`R1`), distance-based positioning, `SLOT_READY` for cooldown checks.

## Script

```text
;@slot1 TELEPORT
;@slot2 SNIPER
;@slot3 EMPTY
; bot6 — The Ghost
; Loadout: SLOT1=TELEPORT, SLOT2=SNIPER
; Strategy: hold sniper range (80–200 units); teleport to a corner sector when cornered;
;           rotate blink destinations via R1 to stay unpredictable.

; R1 tracks which corner we blink to next (1=sector 1, 2=3, 3=7, 4=9).
SET R1 1
SET_MOVE_TO_SECTOR 3

LABEL LOOP

; Health and ammo checks.
IF (HEALTH < 38 && POWERUP_EXISTS(HEALTH)) GOTO HEAL
IF (AMMO < 40 && POWERUP_EXISTS(AMMO)) GOTO RESUPPLY

; Emergency blink: if enemies are dangerously close and teleport is charged.
IF (DIST_TO_CLOSEST_BOT() <= 52 && SLOT_READY(SLOT1) && ENERGY >= 40) GOTO BLINK

; Target the weakest enemy — sniper shots should secure kills.
TARGET_LOWEST_HEALTH

; Fire when the sniper is ready and in range.
IF (HAS_TARGET_BOT() && SLOT_READY(SLOT2) && DIST_TO_TARGET_BOT() <= 200) DO USE_SLOT2 TARGET

; Maintain optimal sniping distance.
IF (DIST_TO_CLOSEST_BOT() > 200) DO SET_MOVE_TO_BOT CLOSEST_BOT
IF (DIST_TO_CLOSEST_BOT() < 80) DO SET_MOVE_AWAY_FROM_BOT CLOSEST_BOT

GOTO LOOP

LABEL BLINK
; Rotate through the 4 corners for unpredictable repositioning.
IF (R1 == 1) DO USE_SLOT1 SECTOR 1
IF (R1 == 2) DO USE_SLOT1 SECTOR 3
IF (R1 == 3) DO USE_SLOT1 SECTOR 7
IF (R1 == 4) DO USE_SLOT1 SECTOR 9
INC R1
IF (R1 > 4) DO SET R1 1
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
