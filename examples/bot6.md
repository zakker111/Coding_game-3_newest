# Built-in bot: Energy Saw Skirmisher (SAW + SHIELD)

**Suggested loadout**
- `SLOT1 = SAW`
- `SLOT2 = SHIELD`
- `SLOT3 = (empty)`

**Intended behavior**
- Aggressive chaser that uses **SAW bursts** after a bump or when very close.
- Uses **bullet-target-aware SHIELD bursts** when enemy shots get close.
- If energy gets low, targets an `ENERGY` powerup and **commits** to refueling for a few ticks.
- Sidesteps when very close to avoid repeated bump-lock.

## Script

```text
;@slot1 SAW
;@slot2 SHIELD
;@slot3 EMPTY
; bot6 — Energy Saw Skirmisher
; Loadout: SLOT1=SAW, SLOT2=SHIELD
; Summary: chase CLOSEST_BOT; bump/close→SAW burst; bullets→SHIELD burst; low ENERGY→TARGET_POWERUP ENERGY.

SET_MOVE_TO_BOT CLOSEST_BOT

LABEL LOOP

; --- Energy management (commit 4 ticks to refuel) ---
IF (ENERGY < 25 && POWERUP_EXISTS(ENERGY) && TIMER_DONE(T3)) DO TARGET_POWERUP ENERGY
IF (ENERGY < 25 && POWERUP_EXISTS(ENERGY) && TIMER_DONE(T3)) DO SET_TIMER T3 4
IF (TIMER_ACTIVE(T3)) GOTO REFUEL

; --- SAW burst (after bump / at very close range) ---
IF ((BUMPED_BOT() || DIST_TO_CLOSEST_BOT() <= 18) && TIMER_DONE(T1) && SLOT_READY(SLOT1) && !SLOT_ACTIVE(SLOT1)) DO SAW ON
IF ((BUMPED_BOT() || DIST_TO_CLOSEST_BOT() <= 18) && TIMER_DONE(T1)) DO SET_TIMER T1 5
IF (TIMER_DONE(T1) && SLOT_ACTIVE(SLOT1)) DO SAW OFF

; Turn SAW off if we're no longer close.
IF (DIST_TO_CLOSEST_BOT() > 40 && SLOT_ACTIVE(SLOT1)) DO SAW OFF

; --- SHIELD burst (when the closest bullet gets dangerous) ---
TARGET_CLOSEST_BULLET
IF (HAS_TARGET_BULLET() && DIST_TO_TARGET_BULLET() <= 48 && TIMER_DONE(T2) && SLOT_READY(SLOT2) && !SLOT_ACTIVE(SLOT2)) DO SHIELD ON
IF (HAS_TARGET_BULLET() && DIST_TO_TARGET_BULLET() <= 48 && TIMER_DONE(T2)) DO SET_TIMER T2 3
IF (TIMER_DONE(T2) && SLOT_ACTIVE(SLOT2) && (!HAS_TARGET_BULLET() || DIST_TO_TARGET_BULLET() > 64)) DO SHIELD OFF

; If we're about to collide, sidestep briefly to avoid repeated bumps.
IF (DIST_TO_CLOSEST_BOT() <= 32 || BUMPED_BOT()) GOTO BACKOFF

GOTO LOOP

LABEL BACKOFF
; Step to the opposite zone in our current sector, then resume chase.
IF (IN_ZONE(1)) DO SET_MOVE_TO_ZONE 4
IF (IN_ZONE(2)) DO SET_MOVE_TO_ZONE 3
IF (IN_ZONE(3)) DO SET_MOVE_TO_ZONE 2
IF (IN_ZONE(4)) DO SET_MOVE_TO_ZONE 1
WAIT 2
SET_MOVE_TO_BOT CLOSEST_BOT
GOTO LOOP

LABEL REFUEL
; When refueling, conserve energy by turning toggles off, then walk the target.
IF (SLOT_ACTIVE(SLOT1)) DO SAW OFF
IF (SLOT_ACTIVE(SLOT2)) DO SHIELD OFF
MOVE_TO_TARGET

; If we refilled or the powerup disappeared, go back to chasing.
IF (ENERGY >= 60 || !POWERUP_EXISTS(ENERGY) || TIMER_DONE(T3)) DO CLEAR_TIMER T3
IF (ENERGY >= 60 || !POWERUP_EXISTS(ENERGY) || TIMER_DONE(T3)) DO SET_MOVE_TO_BOT CLOSEST_BOT
GOTO LOOP
```
