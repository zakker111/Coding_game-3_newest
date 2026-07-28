# bot4 — The Saw Brawler (SAW + SHIELD)

**Suggested loadout**
- `SLOT1 = SAW`
- `SLOT2 = SHIELD`
- `SLOT3 = (empty)`

**Intended behavior**
Dives into melee range and activates the saw for sustained close-range damage. Raises the shield reactively when bullets get close. Manages energy carefully since both modules drain it — breaks off to refuel rather than running dry mid-fight.

Concepts demonstrated: `SAW ON/OFF`, `SHIELD ON/OFF`, bump detection, `DIST_TO_CLOSEST_BOT()`, energy management with toggle modules, `TIMER_DONE`/`SET_TIMER`.

## Script

```text
;@slot1 SAW
;@slot2 SHIELD
;@slot3 EMPTY
; bot4 — The Saw Brawler
; Loadout: SLOT1=SAW, SLOT2=SHIELD
; Strategy: dive to melee range; burst saw on contact; shield incoming bullets;
;           break off to refuel when energy is critically low.

SET_MOVE_TO_BOT CLOSEST_BOT

LABEL LOOP

; Energy crisis — both modules need energy. Refuel before we're helpless.
IF (ENERGY < 28) GOTO REFUEL

; Shield: raise when a bullet is closing in.
TARGET_CLOSEST_BULLET
IF (HAS_TARGET_BULLET() && DIST_TO_TARGET_BULLET() <= 56 && SLOT_READY(SLOT2) && !SLOT_ACTIVE(SLOT2)) DO SHIELD ON
IF (HAS_TARGET_BULLET() && DIST_TO_TARGET_BULLET() <= 56) DO SET_TIMER T2 3
IF (TIMER_DONE(T2) && SLOT_ACTIVE(SLOT2)) DO SHIELD OFF

; Health check.
IF (HEALTH < 28 && POWERUP_EXISTS(HEALTH)) GOTO HEAL

; SAW: activate when in melee range or after a bump — run it for 6 ticks.
IF ((DIST_TO_CLOSEST_BOT() <= 24 || BUMPED_BOT()) && SLOT_READY(SLOT1) && !SLOT_ACTIVE(SLOT1)) DO SAW ON
IF ((DIST_TO_CLOSEST_BOT() <= 24 || BUMPED_BOT())) DO SET_TIMER T1 6
IF (TIMER_DONE(T1) && SLOT_ACTIVE(SLOT1)) DO SAW OFF

; Turn saw off if the enemy escaped — conserve energy.
IF (DIST_TO_CLOSEST_BOT() > 48 && SLOT_ACTIVE(SLOT1)) DO SAW OFF

; Sidestep when bump-locked and saw is off.
IF (BUMPED_BOT() && !SLOT_ACTIVE(SLOT1)) GOTO BACKOFF

SET_MOVE_TO_BOT CLOSEST_BOT
GOTO LOOP

LABEL BACKOFF
IF (IN_ZONE(1)) DO SET_MOVE_TO_ZONE 4
IF (IN_ZONE(2)) DO SET_MOVE_TO_ZONE 3
IF (IN_ZONE(3)) DO SET_MOVE_TO_ZONE 2
IF (IN_ZONE(4)) DO SET_MOVE_TO_ZONE 1
WAIT 2
SET_MOVE_TO_BOT CLOSEST_BOT
GOTO LOOP

LABEL REFUEL
IF (SLOT_ACTIVE(SLOT1)) DO SAW OFF
IF (SLOT_ACTIVE(SLOT2)) DO SHIELD OFF
IF (POWERUP_EXISTS(ENERGY)) DO TARGET_POWERUP ENERGY
IF (POWERUP_EXISTS(ENERGY)) DO SET_MOVE_TO_TARGET
WAIT 4
CLEAR_MOVE
SET_MOVE_TO_BOT CLOSEST_BOT
GOTO LOOP

LABEL HEAL
IF (SLOT_ACTIVE(SLOT1)) DO SAW OFF
TARGET_POWERUP HEALTH
SET_MOVE_TO_TARGET
WAIT 4
CLEAR_MOVE
SET_MOVE_TO_BOT CLOSEST_BOT
GOTO LOOP
```
