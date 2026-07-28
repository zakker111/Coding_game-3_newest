# bot1 — The Executioner (BULLET + ARMOR)

**Suggested loadout**
- `SLOT1 = BULLET`
- `SLOT2 = ARMOR`
- `SLOT3 = (empty)`

**Intended behavior**
Hunts the weakest enemy relentlessly. The passive `ARMOR` module absorbs ~33% of all incoming damage, letting this bot trade hits aggressively and only retreat when truly critical. Finishes off wounded bots before they escape.

Concepts demonstrated: `TARGET_LOWEST_HEALTH`, passive `ARMOR` module, aggressive resource thresholds, re-acquisition after a kill.

## Script

```text
;@slot1 BULLET
;@slot2 ARMOR
;@slot3 EMPTY
; bot1 — The Executioner
; Loadout: SLOT1=BULLET, SLOT2=ARMOR (passive — always reduces incoming damage by ~33%)
; Strategy: hunt the lowest-health enemy; trade hits using armor durability;
;           only retreat when critically injured; re-acquire instantly after a kill.

LABEL LOOP

; Armor means we can fight low — but not this low.
IF (HEALTH < 30 && POWERUP_EXISTS(HEALTH)) GOTO EMERGENCY_HEAL

; Ammo resupply when nearly dry.
IF (AMMO < 25 && POWERUP_EXISTS(AMMO)) GOTO RESUPPLY

; Focus-fire the weakest enemy — highest kill probability per shot.
TARGET_LOWEST_HEALTH
SET_MOVE_TO_TARGET
IF (HAS_TARGET_BOT() && SLOT_READY(SLOT1)) DO USE_SLOT1 TARGET

; Re-acquire immediately if the current target dies.
IF (!HAS_TARGET_BOT()) DO TARGET_LOWEST_HEALTH

GOTO LOOP

LABEL EMERGENCY_HEAL
CLEAR_TARGET_BOT
TARGET_POWERUP HEALTH
SET_MOVE_TO_TARGET
; Armor makes us durable — commit a few ticks to ensure we reach the pickup.
WAIT 5
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
