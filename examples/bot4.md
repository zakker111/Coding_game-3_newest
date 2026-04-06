# Built-in bot: Slot-Driven Saw Diver (SAW + SHIELD)

**Suggested loadout**
- `SLOT1 = SAW`
- `SLOT2 = SHIELD`
- `SLOT3 = (empty)`

**Intended behavior**
- Constantly chases the closest living enemy (persistent goal).
- Demonstrates the **generic slot interface** instead of module-name sugar:
  - `USE_SLOT1`
  - `STOP_SLOT1`
  - `USE_SLOT2`
  - `STOP_SLOT2`
- Bursts the saw when it bumps or reaches melee range.
- Uses the shield reactively when bullets are nearby.
- Sidesteps when very close to avoid repeated bump-lock.

## Script

```text
;@slot1 SAW
;@slot2 SHIELD
;@slot3 EMPTY
; bot4 — Slot-Driven Saw Diver
; Loadout: SLOT1=SAW, SLOT2=SHIELD
; Summary: chase CLOSEST_BOT; drive SAW/SHIELD through USE_SLOTn / STOP_SLOTn; sidestep when too close.

SET_MOVE_TO_BOT CLOSEST_BOT

LABEL LOOP

; SAW burst window after a bump.
IF (BUMPED_BOT() && SLOT_READY(SLOT1) && !SLOT_ACTIVE(SLOT1)) DO USE_SLOT1 SELF
IF (BUMPED_BOT() && SLOT_READY(SLOT1) && !SLOT_ACTIVE(SLOT1)) DO SET_TIMER T1 4
IF (TIMER_DONE(T1) && SLOT_ACTIVE(SLOT1)) DO STOP_SLOT1

; If we get right on top of someone, turn the saw on even without a bump.
IF (DIST_TO_CLOSEST_BOT() <= 18 && SLOT_READY(SLOT1) && !SLOT_ACTIVE(SLOT1)) DO USE_SLOT1 SELF
IF (DIST_TO_CLOSEST_BOT() > 40 && SLOT_ACTIVE(SLOT1)) DO STOP_SLOT1

; If we're very close, briefly sidestep to avoid repeated bumps.
IF (DIST_TO_CLOSEST_BOT() <= 32 || BUMPED_BOT()) GOTO BACKOFF

; Shield when bullets are around (keep it on for at least 3 ticks).
IF ((BULLET_IN_SAME_SECTOR() || BULLET_IN_ADJ_SECTOR()) && SLOT_READY(SLOT2) && !SLOT_ACTIVE(SLOT2)) DO USE_SLOT2 SELF
IF ((BULLET_IN_SAME_SECTOR() || BULLET_IN_ADJ_SECTOR()) && SLOT_READY(SLOT2) && !SLOT_ACTIVE(SLOT2)) DO SET_TIMER T2 3
IF (TIMER_DONE(T2) && SLOT_ACTIVE(SLOT2) && !BULLET_IN_SAME_SECTOR() && !BULLET_IN_ADJ_SECTOR()) DO STOP_SLOT2

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
```
