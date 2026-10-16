# Built-in bot: Rail Sniper (RAILGUN + ARMOR)

**Suggested loadout**
- `SLOT1 = RAILGUN`
- `SLOT2 = EMPTY`
- `SLOT3 = ARMOR`

**Intended behavior**
- Line-clearing artillery: **RAILGUN** fires an instant piercing beam along the bot's facing direction — it hits up to 3 bots in a line (20 dmg first, 12 after) for 10 ammo per shot.
- Because the beam follows *facing*, not a homing reticle, this bot pins `CLOSEST_BOT` in its target register every tick — facing is derived from the target, so `USE_SLOT1 TARGET` lands the beam straight down the line at whoever it is hunting.
- ARMOR passively soaks damage — no energy management needed, so every spare unit goes into farming `AMMO`.
- Keeps mid-range: too close and enemies strafe out of the beam line; too far and the Bresenham ray thins out.

## Script

```text
;@slot1 RAILGUN
;@slot2 EMPTY
;@slot3 ARMOR
; bot11 — Rail Sniper
; Loadout: SLOT1=RAILGUN, SLOT3=ARMOR
; Summary: RAILGUN fires an instant piercing beam along the shooter's FACING direction,
; and facing is derived from the target register (see computeBotFacingDir) — so this bot
; pins CLOSEST_BOT as its target every tick and USE_SLOT1 TARGET lands the beam on it.
; Farm AMMO when dry; ARMOR soaks damage for free.

LABEL LOOP

; --- Ammo discipline: 10/shot, keep one spare round ---
IF (AMMO < 15 && POWERUP_EXISTS(AMMO)) GOTO RESUPPLY

; --- Pin prey: target register drives both movement AND railgun facing ---
TARGET_CLOSEST

; --- Keep ideal range ~40-90: back off if crowded, close in if very far ---
IF (HAS_TARGET_BOT() && DIST_TO_TARGET_BOT() <= 25) DO MOVE_AWAY_FROM_TARGET
IF (HAS_TARGET_BOT() && DIST_TO_TARGET_BOT() > 90) DO SET_MOVE_TO_TARGET

; --- Pull the trigger when a victim is locked and charged:
; USE_SLOT1 TARGET resolves the target register into a BOT selector,
; which orients the beam before it fires. ---
IF (HAS_TARGET_BOT() && SLOT_READY(SLOT1) && AMMO >= 15) DO USE_SLOT1 TARGET

WAIT 1
GOTO LOOP

LABEL RESUPPLY
TARGET_POWERUP AMMO
MOVE_TO_TARGET
IF (!POWERUP_EXISTS(AMMO) || AMMO >= 40) DO CLEAR_TARGET_POWERUP
IF (!POWERUP_EXISTS(AMMO) || AMMO >= 40) DO SET_MOVE_TO_BOT CLOSEST_BOT
GOTO LOOP
```
