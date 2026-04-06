# Built-in bot: Shielded Control Hunter (BULLET + ARMOR + SHIELD)

**Suggested loadout**
- `SLOT1 = BULLET`
- `SLOT2 = ARMOR`
- `SLOT3 = SHIELD`

**Intended behavior**
- Defaults to holding around the center (`SECTOR 5`).
- Uses `ARMOR` for passive durability while holding center.
- Demonstrates explicit target-state cleanup when switching plans:
  - `CLEAR_TARGET`
  - `CLEAR_TARGET_POWERUP`
- Uses `SLOT3 = SHIELD` through the generic slot interface for short defensive bursts.
- When low on health/ammo, targets that powerup type and **commits** for a few ticks using `MOVE_TO_TARGET`.
- Otherwise returns to center control and fires at the closest target.

## Script

```text
;@slot1 BULLET
;@slot2 ARMOR
;@slot3 SHIELD
; bot5 — Shielded Control Hunter
; Loadout: SLOT1=BULLET, SLOT2=ARMOR, SLOT3=SHIELD
; Summary: hold the center with ARMOR; clear/rebuild target state for powerup runs; use SLOT3 SHIELD reactively; return to center for combat.

; Default posture: drift toward the center.
SET_MOVE_TO_SECTOR 5

LABEL LOOP

; If bullets are nearby, pop SHIELD briefly through SLOT3.
IF ((BULLET_IN_SAME_SECTOR() || BULLET_IN_ADJ_SECTOR()) && SLOT_READY(SLOT3) && !SLOT_ACTIVE(SLOT3)) DO USE_SLOT3 SELF
IF ((BULLET_IN_SAME_SECTOR() || BULLET_IN_ADJ_SECTOR()) && SLOT_READY(SLOT3) && !SLOT_ACTIVE(SLOT3)) DO SET_TIMER T3 2
IF (TIMER_DONE(T3) && SLOT_ACTIVE(SLOT3) && !BULLET_IN_SAME_SECTOR() && !BULLET_IN_ADJ_SECTOR()) DO STOP_SLOT3

; If we're about to collide, step to a nearby zone briefly.
IF (DIST_TO_CLOSEST_BOT() <= 32 || BUMPED_BOT()) GOTO BACKOFF

; --- Emergency powerup logic (commit for 3 ticks) ---
; Low health → go to HEALTH.
; (Thresholds are tuned so this behavior is visible in short Workshop runs.)
IF (HEALTH < 70 && POWERUP_EXISTS(HEALTH) && TIMER_DONE(T1)) DO CLEAR_TARGET
IF (HEALTH < 70 && POWERUP_EXISTS(HEALTH) && TIMER_DONE(T1)) DO TARGET_POWERUP HEALTH
IF (HEALTH < 70 && POWERUP_EXISTS(HEALTH) && TIMER_DONE(T1)) DO SET_TIMER T1 3

; Low ammo (but not in the middle of a health run) → go to AMMO.
IF (!TIMER_ACTIVE(T1) && AMMO < 80 && POWERUP_EXISTS(AMMO) && TIMER_DONE(T2)) DO CLEAR_TARGET
IF (!TIMER_ACTIVE(T1) && AMMO < 80 && POWERUP_EXISTS(AMMO) && TIMER_DONE(T2)) DO TARGET_POWERUP AMMO
IF (!TIMER_ACTIVE(T1) && AMMO < 80 && POWERUP_EXISTS(AMMO) && TIMER_DONE(T2)) DO SET_TIMER T2 3
IF (TIMER_ACTIVE(T1) || TIMER_ACTIVE(T2)) GOTO POWERUP_RUN

; --- Combat logic ---
CLEAR_TARGET_POWERUP
TARGET_CLOSEST
SET_MOVE_TO_TARGET
IF (HAS_TARGET_BOT() && SLOT_READY(SLOT1)) DO FIRE_SLOT1 TARGET

GOTO LOOP

LABEL POWERUP_RUN
MOVE_TO_TARGET
IF ((TIMER_DONE(T1) && TIMER_DONE(T2)) || (!POWERUP_EXISTS(HEALTH) && !POWERUP_EXISTS(AMMO))) DO CLEAR_TARGET_POWERUP
IF ((TIMER_DONE(T1) && TIMER_DONE(T2)) || (!POWERUP_EXISTS(HEALTH) && !POWERUP_EXISTS(AMMO))) DO SET_MOVE_TO_SECTOR 5
GOTO LOOP

LABEL BACKOFF
SET_MOVE_TO_SECTOR 5 ZONE 1
WAIT 2
SET_MOVE_TO_SECTOR 5
GOTO LOOP
```
