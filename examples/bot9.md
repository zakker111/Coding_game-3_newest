# Built-in bot: Blink Teleporter (TELEPORT + BULLET)

**Suggested loadout**
- `SLOT1 = TELEPORT`
- `SLOT2 = BULLET`
- `SLOT3 = SHIELD`

**Intended behavior**
- Hit-and-run duelist that **blinks across the arena** instead of walking. TELEPORT is an instant, energy-costed jump to a sector (`SECTOR_1..SECTOR_9`) or to the current movement target — perfect for closing distance on prey or escaping a bad spot.
- Chases the closest enemy normally; when they get far away and energy is banked, it teleports directly into their sector area to cut off the escape.
- Fires **BULLET** at whatever it blinks onto — a pure-movement build deals no damage and can never win a league fight, so TELEPORT needs a finisher.
- Energy is the teleport fuel, so it aggressively farms `ENERGY` powerups and never spends itself below the jump cost.

## Script

```text
;@slot1 TELEPORT
;@slot2 SHIELD
;@slot3 BULLET
; bot9 — Blink Teleporter
; Loadout: SLOT1=TELEPORT, SLOT2=SHIELD, SLOT3=BULLET
; Balance note: the original TELEPORT+SHIELD build survived well but recorded 0 kills / 8 dmg out in the league — blink-and-shield has no damage source. TELEPORT+BULLET gives it a way to actually win fights. The bubble lives on SLOT2 so the refuel branch's SHIELD ON/OFF gates still reference it.
; Summary: chase CLOSEST_BOT on foot; when ENERGY >= 50 and the target is far, USE_SLOT1 SECTOR_5 to blink to center control; shoot the closest enemy with BULLET; farm ENERGY powerups to refill the jump fuel.

LABEL LOOP

; --- Fuel check first: TELEPORT costs 25 energy per jump ---
IF (ENERGY < 40 && POWERUP_EXISTS(ENERGY)) GOTO REFUEL

; --- Blink: cooldown 10 ticks, so only jump when it wins a race ---
IF (DIST_TO_CLOSEST_BOT() >= 80 && ENERGY >= 40 && SLOT_READY(SLOT1)) DO USE_SLOT1 SECTOR_5

; --- Finish the fight: shoot the closest enemy between jumps.
; USE_SLOT3 TARGET only fires at the *target register*, which SET_MOVE_TO_TARGET
; overwrites with powerups while refueling — pin CLOSEST every tick instead. ---
TARGET_CLOSEST
IF (HAS_TARGET_BOT() && SLOT_READY(SLOT3) && AMMO >= 10) DO USE_SLOT3 TARGET

; --- Normal pursuit between shots/jumps (follow the current target every tick) ---
SET_MOVE_TO_TARGET

WAIT 1
GOTO LOOP

LABEL REFUEL
TARGET_POWERUP ENERGY
MOVE_TO_TARGET
; --- Shield ON while walking to the pad: we are defenseless mid-refuel, and
; SHIELD only drains energy while active — spend it here, not during jumps. ---
IF (SLOT_READY(SLOT2) && !SLOT_ACTIVE(SLOT2) && ENERGY >= 45) DO SHIELD ON
IF (!POWERUP_EXISTS(ENERGY) || ENERGY >= 70) DO CLEAR_TARGET_POWERUP
IF (!POWERUP_EXISTS(ENERGY) || ENERGY >= 70) DO SHIELD OFF
IF (!POWERUP_EXISTS(ENERGY) || ENERGY >= 70) DO SET_MOVE_TO_BOT CLOSEST_BOT
GOTO LOOP
```
