# Built-in bot: Shock Warden (PULSE + BULLET)

**Suggested loadout**
- `SLOT1 = PULSE`
- `SLOT2 = BULLET`
- `SLOT3 = SHIELD`

**Intended behavior**
- Crowd-control brawler: **PULSE** is a self-centered shockwave (radius 40) that costs 35 energy, knocks every nearby enemy back 12 units and **stuns them for 3 ticks** — they skip their instructions entirely.
- Fights dirty: waits until an enemy closes in, pops PULSE to freeze the field, then free-shoots the stunned target with **BULLET** while it can't dodge.
- Rebuilds energy between blasts on `ENERGY` powerups; runs **SHIELD** only when cornered at low tank so the pulse fund stays full.
- Great counter to rushers (bot10 flame) — knocked-back burners can't get inside cone range.

## Script

```text
;@slot1 PULSE
;@slot2 BULLET
;@slot3 SHIELD
; bot12 — Shock Warden
; Loadout: SLOT1=PULSE, SLOT2=BULLET, SLOT3=SHIELD
; Summary: farm ENERGY until the pulse fund (35+) is banked; when CLOSEST_BOT is within ~38 units, USE_SLOT1 to blast+stun them, then shoot the frozen target with BULLET. Shield only as a last-ditch wall.

LABEL LOOP

; --- Pulse costs 35 energy; without a charge there is nothing to do but farm ---
IF (ENERGY < 40 && POWERUP_EXISTS(ENERGY)) GOTO REFUEL

TARGET_CLOSEST

; --- Emergency shield when cornered AND healthy enough to pay both drains ---
IF (HAS_TARGET_BOT() && DIST_TO_TARGET_BOT() <= 20 && HEALTH <= 40 && SLOT_READY(SLOT3) && !SLOT_ACTIVE(SLOT3) && ENERGY >= 60) DO SHIELD ON
IF (DIST_TO_TARGET_BOT() > 30 || ENERGY < 45) DO SHIELD OFF

; --- Blast point-blank: stun + knockback, then punish with bullets.
; PULSE is self-centered — the USE_SLOT target token is ignored by the engine,
; so TARGET (the pinned victim) is a valid, readable trigger argument. ---
IF (HAS_TARGET_BOT() && DIST_TO_TARGET_BOT() <= 38 && SLOT_READY(SLOT1) && ENERGY >= 40) DO USE_SLOT1 TARGET

; --- Punish window: stunned targets cannot move for 3 ticks — shoot them ---
TARGET_CLOSEST
IF (HAS_TARGET_BOT() && SLOT_READY(SLOT2) && AMMO >= 10) DO USE_SLOT2 TARGET

SET_MOVE_TO_TARGET

WAIT 1
GOTO LOOP

LABEL REFUEL
SHIELD OFF
TARGET_POWERUP ENERGY
MOVE_TO_TARGET
IF (!POWERUP_EXISTS(ENERGY) || ENERGY >= 75) DO CLEAR_TARGET_POWERUP
IF (!POWERUP_EXISTS(ENERGY) || ENERGY >= 75) DO SET_MOVE_TO_BOT CLOSEST_BOT
GOTO LOOP
```
