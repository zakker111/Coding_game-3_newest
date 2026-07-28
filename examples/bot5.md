# bot5 — The Mine Trapper (MINE + REPAIR_DRONE)

**Suggested loadout**
- `SLOT1 = MINE`
- `SLOT2 = REPAIR_DRONE`
- `SLOT3 = (empty)`

**Intended behavior**
Patrols the central sectors (5 → 2 → 4 → 6 → 8) dropping mines at each stop. Keeps a repair drone orbiting for passive healing. When enemies get close, it kites them back through the seeded mine field. Dismisses the drone and grabs energy powerups when reserves run low.

Concepts demonstrated: `USE_SLOT1 NONE` (mine placement), `USE_SLOT2 SELF` (repair drone), `DRONE_COUNT()`, `STOP_SLOT2`, patrol routing with sector checks, kiting tactics.

## Script

```text
;@slot1 MINE
;@slot2 REPAIR_DRONE
;@slot3 EMPTY
; bot5 — The Mine Trapper
; Loadout: SLOT1=MINE, SLOT2=REPAIR_DRONE
; Strategy: patrol the central cross (sectors 5→2→4→6→8) dropping mines at each stop;
;           keep a repair drone active for passive healing; kite enemies into the mine field.

SET_MOVE_TO_SECTOR 5

LABEL LOOP

; Keep one repair drone orbiting when energy allows.
IF (SLOT_READY(SLOT2) && DRONE_COUNT() == 0 && ENERGY > 55) DO USE_SLOT2 SELF

; Low energy: dismiss drone and grab a refuel.
IF (ENERGY < 30 && SLOT_ACTIVE(SLOT2)) DO STOP_SLOT2
IF (ENERGY < 30 && POWERUP_EXISTS(ENERGY)) GOTO REFUEL

; Health backup: drone doesn't always keep up.
IF (HEALTH < 35 && POWERUP_EXISTS(HEALTH)) GOTO HEAL

; Kite approaching enemies — lead them back over the mines.
IF (DIST_TO_CLOSEST_BOT() <= 52) GOTO KITE

; Drop a mine every 8 ticks to seed the patrol path.
IF (SLOT_READY(SLOT1) && TIMER_DONE(T1)) DO USE_SLOT1 NONE
IF (SLOT_READY(SLOT1) && TIMER_DONE(T1)) DO SET_TIMER T1 8

; Patrol the central cross: 5 → 2 → 4 → 6 → 8 → 5.
IF (SECTOR() == 5) DO SET_MOVE_TO_SECTOR 2
IF (SECTOR() == 2) DO SET_MOVE_TO_SECTOR 4
IF (SECTOR() == 4) DO SET_MOVE_TO_SECTOR 6
IF (SECTOR() == 6) DO SET_MOVE_TO_SECTOR 8
IF (SECTOR() == 8) DO SET_MOVE_TO_SECTOR 5

GOTO LOOP

LABEL KITE
; Move away from the threat and let the mines do the work.
SET_MOVE_AWAY_FROM_BOT CLOSEST_BOT
WAIT 3
GOTO LOOP

LABEL REFUEL
IF (SLOT_ACTIVE(SLOT2)) DO STOP_SLOT2
TARGET_POWERUP ENERGY
SET_MOVE_TO_TARGET
WAIT 4
CLEAR_MOVE
GOTO LOOP

LABEL HEAL
TARGET_POWERUP HEALTH
SET_MOVE_TO_TARGET
WAIT 4
CLEAR_MOVE
GOTO LOOP
```
