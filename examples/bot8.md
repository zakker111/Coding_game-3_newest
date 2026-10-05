# Built-in bot: Rocket Barrager (ROCKET + ARMOR)

**Suggested loadout**
- `SLOT1 = ROCKET`
- `SLOT2 = ARMOR`
- `SLOT3 = (empty)`

**Intended behavior**
- Mid-range pressure bot that fires **ROCKET** salvos at the closest enemy. Rockets are heavy projectiles with splash behavior — expensive in ammo, so this bot times its volleys instead of spamming.
- Uses **ARMOR** passively to survive the fights rockets start (mitigates damage with a small speed penalty — acceptable because this bot doesn't chase hard).
- Only commits a rocket when the target is in a comfortable band: not point-blank (wastes the shot on self-risk), not out at the far edge (easier to dodge).
- Runs for `AMMO` powerups when reserves drop; returns to hunting afterward.

## Script

```text
;@slot1 ROCKET
;@slot2 ARMOR
;@slot3 EMPTY
; bot8 — Rocket Barrager
; Loadout: SLOT1=ROCKET, SLOT2=ARMOR
; Summary: hunt CLOSEST_BOT under ARMOR; fire ROCKET volleys at mid range (24..90 units) gated by SLOT_READY and an ammo reserve; resupply AMMO when low.

; ARMOR is passive once slotted — no ON/OFF needed, but we keep it explicit for teaching value.
LABEL LOOP

; --- Choose the hunt target ---
TARGET_CLOSEST

; --- Resupply check: rockets cost a lot of ammo per shot ---
IF (AMMO < 30 && POWERUP_EXISTS(AMMO)) GOTO RESUPPLY

; --- Volley logic: fire only in the sweet spot, respecting the 12-tick cooldown ---
IF (HAS_TARGET_BOT() && SLOT_READY(SLOT1) && DIST_TO_TARGET_BOT() >= 24 && DIST_TO_TARGET_BOT() <= 90 && AMMO >= 40) DO USE_SLOT1 TARGET

; --- Close-in bail: don't trade bumps while reloading ---
IF (DIST_TO_CLOSEST_BOT() <= 20) GOTO BACKOFF

WAIT 1
GOTO LOOP

LABEL BACKOFF
SET_MOVE_AWAY_FROM_BOT CLOSEST_BOT
WAIT 2
SET_MOVE_TO_BOT CLOSEST_BOT
GOTO LOOP

LABEL RESUPPLY
TARGET_POWERUP AMMO
MOVE_TO_TARGET
IF (!POWERUP_EXISTS(AMMO) || AMMO >= 60) DO CLEAR_TARGET_POWERUP
IF (!POWERUP_EXISTS(AMMO) || AMMO >= 60) DO SET_MOVE_TO_BOT CLOSEST_BOT
GOTO LOOP
```
