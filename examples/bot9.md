# Built-in bot: Blink Teleporter (TELEPORT + SHIELD)

**Suggested loadout**
- `SLOT1 = TELEPORT`
- `SLOT2 = SHIELD`
- `SLOT3 = (empty)`

**Intended behavior**
- Hit-and-run duelist that **blinks across the arena** instead of walking. TELEPORT is an instant, energy-costed jump to a sector (`SECTOR_1..SECTOR_9`) or to the current movement target — perfect for closing distance on prey or escaping a bad spot.
- Chases the closest enemy normally; when they get far away and energy is banked, it teleports directly into their sector area to cut off the escape.
- Raises **SHIELD** just before arriving in a hot sector so the landing isn't fatal.
- Energy is the teleport fuel, so it aggressively farms `ENERGY` powerups and never spends itself below the jump cost.

## Script

```text
;@slot1 TELEPORT
;@slot2 SHIELD
;@slot3 EMPTY
; bot9 — Blink Teleporter
; Loadout: SLOT1=TELEPORT, SLOT2=SHIELD
; Summary: chase CLOSEST_BOT on foot; when ENERGY >= 50 and the target is far, USE_SLOT1 SECTOR_5 to blink to center control; SHIELD on approach; farm ENERGY powerups to refill the jump fuel.

LABEL LOOP

; --- Fuel check first: TELEPORT costs 30 energy per jump ---
IF (ENERGY < 50 && POWERUP_EXISTS(ENERGY)) GOTO REFUEL

; --- Defensive shield while closing distance ---
TARGET_CLOSEST_BULLET
IF (HAS_TARGET_BULLET() && DIST_TO_TARGET_BULLET() <= 40 && SLOT_READY(SLOT2) && !SLOT_ACTIVE(SLOT2)) DO SHIELD ON
IF (!HAS_TARGET_BULLET() || DIST_TO_TARGET_BULLET() > 60) DO SHIELD OFF

; --- Blink: long cooldown (14 ticks), so only jump when it wins a race ---
IF (DIST_TO_CLOSEST_BOT() >= 80 && ENERGY >= 50 && SLOT_READY(SLOT1)) DO USE_SLOT1 SECTOR_5

; --- Normal pursuit between jumps ---
SET_MOVE_TO_BOT CLOSEST_BOT

; --- Finish the fight up close with bumps once we've arrived ---
IF (DIST_TO_CLOSEST_BOT() <= 24) DO SHIELD OFF

WAIT 1
GOTO LOOP

LABEL REFUEL
TARGET_POWERUP ENERGY
MOVE_TO_TARGET
IF (!POWERUP_EXISTS(ENERGY) || ENERGY >= 70) DO CLEAR_TARGET_POWERUP
IF (!POWERUP_EXISTS(ENERGY) || ENERGY >= 70) DO SET_MOVE_TO_BOT CLOSEST_BOT
GOTO LOOP
```
