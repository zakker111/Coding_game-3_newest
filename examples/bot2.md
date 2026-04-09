# Built-in bot: Target Cycler (BULLET)

**Suggested loadout**
- `SLOT1 = BULLET`
- `SLOT2 = (empty)`
- `SLOT3 = (empty)`

**Intended behavior**
- Demonstrates **explicit target cycling**:
  - starts on `BOT1`
  - rotates with `TARGET_NEXT`
  - repairs the target when the current one dies via `TARGET_NEXT_IF_DEAD`
- Uses **immediate movement** (`MOVE_TO_TARGET`) instead of a persistent chase goal.
- If bullets are nearby, briefly dodges so it does not tunnel-vision forever.
- If a bot is **very close** (or we just bumped), briefly backs off before re-engaging.
- Shoots the selected target via `USE_SLOT1 TARGET`.

## Script

```text
;@slot1 BULLET
;@slot2 EMPTY
;@slot3 EMPTY
; bot2 — Target Cycler
; Loadout: SLOT1=BULLET
; Summary: rotate targets with TARGET_NEXT / TARGET_NEXT_IF_DEAD; use immediate movement toward the current target; dodge bullets; shoot the selected target.

SET_TARGET BOT1
SET_TIMER T1 6

LABEL LOOP

; If we're about to collide, sidestep within our current sector.
IF (DIST_TO_CLOSEST_BOT() <= 32 || BUMPED_BOT()) GOTO BACKOFF

; If enemy bullets are nearby, dodge for a tick.
IF (BULLET_IN_SAME_SECTOR() || BULLET_IN_ADJ_SECTOR()) GOTO DODGE_BULLETS

; Keep a valid target, and rotate periodically so the bot does not tunnel on one enemy forever.
TARGET_NEXT_IF_DEAD
IF (TIMER_DONE(T1)) DO TARGET_NEXT
IF (TIMER_DONE(T1)) DO SET_TIMER T1 6

IF (HAS_TARGET_BOT()) DO MOVE_TO_TARGET
IF (HAS_TARGET_BOT() && SLOT_READY(SLOT1)) DO USE_SLOT1 TARGET

GOTO LOOP

LABEL BACKOFF
; Break pursuit and step to the opposite zone in our current sector.
CLEAR_MOVE
IF (IN_ZONE(1)) DO SET_MOVE_TO_ZONE 4
IF (IN_ZONE(2)) DO SET_MOVE_TO_ZONE 3
IF (IN_ZONE(3)) DO SET_MOVE_TO_ZONE 2
IF (IN_ZONE(4)) DO SET_MOVE_TO_ZONE 1
WAIT 2
CLEAR_MOVE
GOTO LOOP

LABEL DODGE_BULLETS
; Quick evasive step: move to a different zone for 1 tick.
CLEAR_MOVE
IF (IN_ZONE(1)) DO SET_MOVE_TO_ZONE 2
IF (IN_ZONE(2)) DO SET_MOVE_TO_ZONE 4
IF (IN_ZONE(4)) DO SET_MOVE_TO_ZONE 3
IF (IN_ZONE(3)) DO SET_MOVE_TO_ZONE 1
WAIT 1
CLEAR_MOVE
GOTO LOOP
```
