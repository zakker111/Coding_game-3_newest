# Built-in bot: Long-Range Sniper (SNIPER + SHIELD)

**Suggested loadout**
- `SLOT1 = SNIPER`
- `SLOT2 = SHIELD`
- `SLOT3 = (empty)`

**Intended behavior**
- Kite-and-shoot skirmisher: keeps distance and picks off enemies with **SNIPER** hitscan shots (instant hit, no bullet travel — great against fast movers).
- Prefers **LOWEST_HEALTH_BOT** targets to finish off wounded bots; falls back to `CLOSEST_BOT` when nobody is hurt.
- Sniping costs ammo per shot, so it hoards ammo above a threshold and runs for `AMMO` powerups when the reserve gets low.
- Raises **SHIELD** only when an enemy bullet closes in (snipers trade poorly in shootouts at range zero).
- Backs away when enemies get too close instead of trading bumps.

## Script

```text
;@slot1 SNIPER
;@slot2 SHIELD
;@slot3 EMPTY
; bot7 — Long-Range Sniper
; Loadout: SLOT1=SNIPER, SLOT2=SHIELD
; Summary: keep distance; SNIPER the LOWEST_HEALTH_BOT (else CLOSEST_BOT); SHIELD against incoming bullets; run for AMMO when the reserve is low.

LABEL LOOP

; --- Ammo discipline: SNIPER costs ammo per shot, keep a reserve ---
IF (AMMO < 40 && POWERUP_EXISTS(AMMO)) GOTO RESUPPLY

; --- Pick a victim: wounded first (TARGET_LOWEST_HEALTH also drives movement) ---
TARGET_LOWEST_HEALTH

; --- Defensive SHIELD burst when a bullet gets dangerous ---
TARGET_CLOSEST_BULLET
IF (HAS_TARGET_BULLET() && DIST_TO_TARGET_BULLET() <= 40 && SLOT_READY(SLOT2) && !SLOT_ACTIVE(SLOT2)) DO SHIELD ON
IF (!HAS_TARGET_BULLET() || DIST_TO_TARGET_BULLET() > 60) DO SHIELD OFF

; --- Fire the sniper (hitscan, 10-tick cooldown, gated on ammo) ---
IF (HAS_TARGET_BOT() && SLOT_READY(SLOT1) && AMMO >= 50) DO USE_SLOT1 TARGET

; --- Maintain range: back off if enemies crowd in ---
IF (DIST_TO_CLOSEST_BOT() <= 48) GOTO BACKOFF

WAIT 1
GOTO LOOP

LABEL BACKOFF
SET_MOVE_AWAY_FROM_BOT CLOSEST_BOT
WAIT 3
SET_MOVE_TO_BOT CLOSEST_BOT
GOTO LOOP

LABEL RESUPPLY
SHIELD OFF
TARGET_POWERUP AMMO
MOVE_TO_TARGET
IF (!POWERUP_EXISTS(AMMO) || AMMO >= 60) DO CLEAR_TARGET_POWERUP
IF (!POWERUP_EXISTS(AMMO) || AMMO >= 60) DO SET_MOVE_TO_BOT CLOSEST_BOT
GOTO LOOP
```
