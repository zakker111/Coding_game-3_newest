# Built-in bot: Armored Grenade Controller (GRENADE + ARMOR + REPAIR_DRONE)

**Suggested loadout**
- `SLOT1 = GRENADE`
- `SLOT2 = ARMOR`
- `SLOT3 = REPAIR_DRONE`

**Intended behavior**
- Defaults to holding around the center (`SECTOR 5`).
- Uses `ARMOR` for passive durability while holding center.
- Demonstrates explicit target-state cleanup when switching plans:
  - `CLEAR_TARGET`
  - `CLEAR_TARGET_POWERUP`
- Uses `SLOT3 = REPAIR_DRONE` through the generic slot interface for sustain while holding center.
- When low on health/ammo/energy, targets that powerup type and **commits** for a few ticks using `MOVE_TO_TARGET`.
- Otherwise returns to center control and lobs grenades at the closest target.

## Script

```text
;@slot1 GRENADE
;@slot2 ARMOR
;@slot3 REPAIR_DRONE
; bot5 — Armored Grenade Controller
; Loadout: SLOT1=GRENADE, SLOT2=ARMOR, SLOT3=REPAIR_DRONE
; Summary: hold the center with ARMOR; clear/rebuild target state for HEALTH/AMMO/ENERGY runs; use SLOT3 REPAIR_DRONE for sustain; return to center for grenade pressure.

; Default posture: drift toward the center.
SET_MOVE_TO_SECTOR 5

LABEL LOOP

; Keep one repair drone orbiting while we control the center.
IF (SLOT_READY(SLOT3) && DRONE_COUNT() == 0) DO USE_SLOT3 SELF

; If energy gets low while a drone is active, dismiss it and refuel.
IF (ENERGY < 35 && SLOT_ACTIVE(SLOT3)) DO STOP_SLOT3

; If we're about to collide, step to a nearby zone briefly.
IF (DIST_TO_CLOSEST_BOT() <= 32 || BUMPED_BOT()) GOTO BACKOFF

; --- Emergency powerup logic (commit for 3 ticks) ---
; Low health → go to HEALTH.
; (Thresholds are tuned so this behavior is visible in short Workshop runs.)
IF (HEALTH < 70 && POWERUP_EXISTS(HEALTH) && TIMER_DONE(T1)) DO CLEAR_TARGET
IF (HEALTH < 70 && POWERUP_EXISTS(HEALTH) && TIMER_DONE(T1)) DO TARGET_POWERUP HEALTH
IF (HEALTH < 70 && POWERUP_EXISTS(HEALTH) && TIMER_DONE(T1)) DO SET_TIMER T1 3

; Low energy (after drone upkeep) → go to ENERGY.
IF (!TIMER_ACTIVE(T1) && ENERGY < 60 && POWERUP_EXISTS(ENERGY) && TIMER_DONE(T2)) DO CLEAR_TARGET
IF (!TIMER_ACTIVE(T1) && ENERGY < 60 && POWERUP_EXISTS(ENERGY) && TIMER_DONE(T2)) DO TARGET_POWERUP ENERGY
IF (!TIMER_ACTIVE(T1) && ENERGY < 60 && POWERUP_EXISTS(ENERGY) && TIMER_DONE(T2)) DO SET_TIMER T2 3

; Low ammo (but not in the middle of a health run or energy run) → go to AMMO.
IF (!TIMER_ACTIVE(T1) && ENERGY >= 60 && AMMO < 80 && POWERUP_EXISTS(AMMO) && TIMER_DONE(T2)) DO CLEAR_TARGET
IF (!TIMER_ACTIVE(T1) && ENERGY >= 60 && AMMO < 80 && POWERUP_EXISTS(AMMO) && TIMER_DONE(T2)) DO TARGET_POWERUP AMMO
IF (!TIMER_ACTIVE(T1) && ENERGY >= 60 && AMMO < 80 && POWERUP_EXISTS(AMMO) && TIMER_DONE(T2)) DO SET_TIMER T2 3
IF (TIMER_ACTIVE(T1) || TIMER_ACTIVE(T2)) GOTO POWERUP_RUN

; --- Combat logic ---
CLEAR_TARGET_POWERUP
TARGET_CLOSEST
SET_MOVE_TO_TARGET
IF (HAS_TARGET_BOT() && SLOT_READY(SLOT1)) DO USE_SLOT1 TARGET

GOTO LOOP

LABEL POWERUP_RUN
MOVE_TO_TARGET
IF ((TIMER_DONE(T1) && TIMER_DONE(T2)) || (!POWERUP_EXISTS(HEALTH) && !POWERUP_EXISTS(AMMO) && !POWERUP_EXISTS(ENERGY))) DO CLEAR_TARGET_POWERUP
IF ((TIMER_DONE(T1) && TIMER_DONE(T2)) || (!POWERUP_EXISTS(HEALTH) && !POWERUP_EXISTS(AMMO) && !POWERUP_EXISTS(ENERGY))) DO SET_MOVE_TO_SECTOR 5
GOTO LOOP

LABEL BACKOFF
SET_MOVE_TO_SECTOR 5 ZONE 1
WAIT 2
SET_MOVE_TO_SECTOR 5
GOTO LOOP
```
