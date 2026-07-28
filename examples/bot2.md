# bot2 — The Sniper (SNIPER + ARMOR)

**Suggested loadout**
- `SLOT1 = SNIPER`
- `SLOT2 = ARMOR`
- `SLOT3 = (empty)`

**Intended behavior**
Holds the middle distance (64–160 units). Fires high-damage sniper shots at the weakest enemy to secure kills. Uses `ARMOR` to absorb incidental hits while repositioning. Kites away when enemies close in and waits out the long sniper cooldown.

Concepts demonstrated: `DIST_TO_CLOSEST_BOT()`, `DIST_TO_TARGET_BOT()`, kiting with `SET_MOVE_AWAY_FROM_BOT`, `SLOT_READY`, long-cooldown weapon management.

## Script

```text
;@slot1 SNIPER
;@slot2 ARMOR
;@slot3 EMPTY
; bot2 — The Sniper
; Loadout: SLOT1=SNIPER, SLOT2=ARMOR (passive)
; Strategy: hold sniping range (64–160 units); fire at lowest-health targets to secure kills;
;           kite when enemies close in; armor absorbs hits during repositioning.

SET_MOVE_TO_SECTOR 3

LABEL LOOP

; Heal when low — armor doesn't make us invincible.
IF (HEALTH < 40 && POWERUP_EXISTS(HEALTH)) GOTO HEAL

; Sniper ammo is expensive — resupply early.
IF (AMMO < 45 && POWERUP_EXISTS(AMMO)) GOTO RESUPPLY

; Kite: if enemies get too close, back off to restore firing distance.
IF (DIST_TO_CLOSEST_BOT() < 64) GOTO KITE

; Close the gap if the fight is too far away.
IF (DIST_TO_CLOSEST_BOT() > 180) DO SET_MOVE_TO_BOT CLOSEST_BOT

; Target the weakest enemy for maximum kill probability per shot.
TARGET_LOWEST_HEALTH

; Fire when ready and the target is within effective range.
IF (HAS_TARGET_BOT() && SLOT_READY(SLOT1) && DIST_TO_TARGET_BOT() <= 180) DO USE_SLOT1 TARGET

GOTO LOOP

LABEL KITE
CLEAR_MOVE
SET_MOVE_AWAY_FROM_BOT CLOSEST_BOT
WAIT 4
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
