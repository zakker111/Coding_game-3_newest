# Built-in bot: Ghost Assassin (CLOAK + SNIPER)

**Suggested loadout**
- `SLOT1 = CLOAK`
- `SLOT2 = SNIPER`
- `SLOT3 = EMPTY`

**Intended behavior**
- Stealth sniper: **CLOAK** (30 energy, 24-tick cooldown) makes the bot invisible to enemy targeting tokens for 10 ticks — `TARGET_CLOSEST`, aimed bullets and snipers can no longer acquire it.
- Stalks the **LOWEST_HEALTH_BOT** unseen, then takes hitscan **SNIPER** shots at range. Firing breaks cloak instantly, so every shot is a committed ambush: cloak → close → snipe → drift away while enemies re-acquire.
- No shield/armor by design: survivability comes from being untargetable. Farms `ENERGY` to keep the cloak fund full between kills.
- Good demo of cloak counterplay — watch opponents' tracers go past the shimmering token while cloaked.

## Script

```text
;@slot1 CLOAK
;@slot2 SNIPER
;@slot3 EMPTY
; bot13 — Ghost Assassin
; Loadout: SLOT1=CLOAK, SLOT2=SNIPER
; Summary: drop CLOAK when an enemy is near or wounded prey exists, hunt LOWEST_HEALTH_BOT (else CLOSEST), snipe with BULLET-cheap discipline on AMMO; refuel ENERGY between kills. Firing breaks cloak — that is the intended rhythm.

LABEL LOOP

; --- Cloak fund: 30 per drop, keep enough to vanish after the next shot ---
IF (ENERGY < 35 && POWERUP_EXISTS(ENERGY)) GOTO REFUEL

; --- Pick prey: finish the wounded, else whoever is closest ---
IF (HAS_LOWEST_HEALTH_BOT()) DO TARGET_LOWEST_HEALTH
IF (!HAS_TARGET_BOT()) DO TARGET_CLOSEST

; --- Go dark when prey is in sniper range so their return fire can't lock us ---
IF (HAS_TARGET_BOT() && DIST_TO_TARGET_BOT() <= 80 && SLOT_READY(SLOT1) && ENERGY >= 35 && !SLOT_ACTIVE(SLOT1)) DO USE_SLOT1 TARGET

; --- Ambush shot: instant hitscan; firing ends the cloak window ---
IF (HAS_TARGET_BOT() && SLOT_READY(SLOT2) && AMMO >= 12) DO USE_SLOT2 TARGET

; --- Kiting: hold ~50 units of distance from the target ---
IF (HAS_TARGET_BOT() && DIST_TO_TARGET_BOT() <= 35) DO MOVE_AWAY_FROM_TARGET
IF (HAS_TARGET_BOT() && DIST_TO_TARGET_BOT() > 70) DO SET_MOVE_TO_TARGET

WAIT 1
GOTO LOOP

LABEL REFUEL
TARGET_POWERUP ENERGY
MOVE_TO_TARGET
IF (!POWERUP_EXISTS(ENERGY) || ENERGY >= 65) DO CLEAR_TARGET_POWERUP
IF (!POWERUP_EXISTS(ENERGY) || ENERGY >= 65) DO SET_MOVE_TO_BOT CLOSEST_BOT
GOTO LOOP
```
