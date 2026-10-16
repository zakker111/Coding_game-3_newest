# Built-in bot: Flame Close-Quarters (FLAMER + SHIELD)

**Suggested loadout**
- `SLOT1 = FLAMER`
- `SLOT2 = EMPTY`
- `SLOT3 = SHIELD`

**Intended behavior**
- Brutal rusher: walks straight at the closest enemy and holds **FLAMER** on once they are inside its short cone range — continuous 4 dmg/tick to everything in front, no ammo needed, only energy.
- FLAMER drains 2 energy per tick while active, so it toggles off when nothing is in range and bails to `ENERGY` powerups when the tank runs low.
- Runs **SHIELD** ON while closing distance so incoming BULLET/GRENADE trades don't kill it before the fire starts.
- A living flame aura also breaks attacker cloaks — good counter to bot13.

## Script

```text
;@slot1 FLAMER
;@slot2 EMPTY
;@slot3 SHIELD
; bot10 — Flame Close-Quarters
; Loadout: SLOT1=FLAMER, SLOT3=SHIELD
; Summary: chase CLOSEST_BOT; shield up on approach; FLAMER ON whenever an enemy is within ~30 units in front; disengage for ENERGY when the tank is dry.

LABEL LOOP

; --- Energy discipline: flame costs 2/tick, keep a reserve for one more burn ---
IF (ENERGY < 25 && POWERUP_EXISTS(ENERGY)) GOTO REFUEL

; --- Pick prey and walk at it ---
TARGET_CLOSEST
SET_MOVE_TO_TARGET

; --- Shield ON while closing (only if we can pay the drain) ---
IF (DIST_TO_CLOSEST_BOT() <= 60 && SLOT_READY(SLOT3) && !SLOT_ACTIVE(SLOT3) && ENERGY >= 40) DO SHIELD ON

; --- Burn when something is in arm's reach (FLAMER ON keeps streaming every tick) ---
IF (DIST_TO_CLOSEST_BOT() <= 30 && SLOT_READY(SLOT1) && !SLOT_ACTIVE(SLOT1)) DO FLAMER ON
IF (DIST_TO_CLOSEST_BOT() > 34 && SLOT_ACTIVE(SLOT1)) DO FLAMER OFF

; --- Drop shield when the tank gets low or nobody is near ---
IF (ENERGY < 30 || DIST_TO_CLOSEST_BOT() > 70) DO SHIELD OFF

WAIT 1
GOTO LOOP

LABEL REFUEL
SHIELD OFF
IF (SLOT_ACTIVE(SLOT1)) DO FLAMER OFF
TARGET_POWERUP ENERGY
MOVE_TO_TARGET
IF (!POWERUP_EXISTS(ENERGY) || ENERGY >= 60) DO CLEAR_TARGET_POWERUP
IF (!POWERUP_EXISTS(ENERGY) || ENERGY >= 60) DO SET_MOVE_TO_BOT CLOSEST_BOT
GOTO LOOP
```
