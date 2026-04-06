# Built-in bot: Immediate-Move Bunker (BULLET)

**Suggested loadout**
- `SLOT1 = BULLET`
- `SLOT2 = (empty)`
- `SLOT3 = (empty)`

**Intended behavior**
- Defaults to a fixed “home” location.
- Demonstrates **immediate movement** instructions instead of persistent move goals:
  - `MOVE_TO_SECTOR`
  - `MOVE_TO_POWERUP`
- If bullets are nearby, briefly targets the closest bullet, moves away from it, and clears the bullet target.
- If a bot is **very close** (or we just bumped), briefly steps deeper into its home sector.
- Opportunistically fires using an **inline selector** (no target register).

## Script

```text
;@slot1 BULLET
;@slot2 EMPTY
;@slot3 EMPTY
; bot3 — Immediate-Move Bunker
; Loadout: SLOT1=BULLET
; Summary: hold a home corner with immediate movement; make one-tick powerup detours; dodge bullets via the bullet target register; shoot NEAREST_BOT when close.

LABEL LOOP

; If enemy bullets are nearby, dodge for a tick.
IF (BULLET_IN_SAME_SECTOR() || BULLET_IN_ADJ_SECTOR()) GOTO DODGE_BULLETS

; If we're about to collide, take a short step inward.
IF (DIST_TO_CLOSEST_BOT() <= 32 || BUMPED_BOT()) GOTO BACKOFF

; Make one-tick detours to the nearest useful powerup.
; (Thresholds are tuned so this behavior is visible in short Workshop runs.)
IF (HEALTH < 70 && POWERUP_EXISTS(HEALTH)) DO MOVE_TO_POWERUP HEALTH
IF (HEALTH >= 70 && AMMO < 80 && POWERUP_EXISTS(AMMO)) DO MOVE_TO_POWERUP AMMO

; Otherwise, reassert the home corner immediately.
IF (HEALTH >= 70 && (AMMO >= 80 || !POWERUP_EXISTS(AMMO))) DO MOVE_TO_SECTOR 1 ZONE 1

; Only shoot when something is fairly close (helps conserve ammo).
IF (SLOT_READY(SLOT1) && DIST_TO_CLOSEST_BOT() <= 120) DO FIRE_SLOT1 NEAREST_BOT

GOTO LOOP

LABEL BACKOFF
; Step deeper into the home sector for a tick, then resume normal logic.
MOVE_TO_SECTOR 1 ZONE 4
GOTO LOOP

LABEL DODGE_BULLETS
; Quick evasive step: move away from the closest bullet, then clear the bullet target.
TARGET_CLOSEST_BULLET
IF (HAS_TARGET_BULLET()) DO MOVE_AWAY_FROM_TARGET
IF (HAS_TARGET_BULLET()) DO CLEAR_TARGET_BULLET
GOTO LOOP
```
