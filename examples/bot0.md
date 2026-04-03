# bot0.md — Workshop starter template (beginner): Aggressive Skirmisher

This is the **default BOT1 script** the Workshop should load when the user has **no saved bot draft** yet.

**Suggested loadout**
- `SLOT1 = BULLET`
- `SLOT2 = (empty)`
- `SLOT3 = (empty)`

**Intended behavior**
- If a bot is **very close**, briefly back off toward the center before re-engaging.
- If enemy bullets are nearby, briefly dodge to a different zone.
- If health is low and a HEALTH powerup exists, commit briefly to a healing run.
- If ammo is low and an AMMO powerup exists (and we’re not currently healing), commit briefly to an ammo run.
- Otherwise: target the closest bot, chase it (persistent move goal), and shoot when ready.

This starter intentionally uses a few core v1 patterns:
- `IF ... GOTO ...` (simple branching)
- `TARGET_CLOSEST` / `TARGET_POWERUP HEALTH`
- `SET_MOVE_TO_TARGET` (keep moving while doing other work)
- `FIRE_SLOT1 TARGET` (shoot your current target)
- `WAIT` (brief commitment to a plan)

## Script

```text
;@slot1 BULLET
;@slot2 EMPTY
;@slot3 EMPTY
; bot0 — Aggressive Skirmisher (starter)
; Loadout: SLOT1=BULLET
; Summary: chase+shoot the closest bot; avoid bump-lock; detour for HEALTH/AMMO when low; dodge enemy bullets when threatened.

LABEL LOOP

; If we're about to collide, sidestep within our current sector.
; (Use a slightly larger threshold than the bot hitbox to avoid repeated bumps.)
IF (DIST_TO_CLOSEST_BOT() <= 32 || BUMPED_BOT()) GOTO BACKOFF

; If enemy bullets are nearby, dodge for a tick to reduce face-tanking.
IF (BULLET_IN_SAME_SECTOR() || BULLET_IN_ADJ_SECTOR()) GOTO DODGE_BULLETS

; Heal when hurt (clear bot target so MOVE_TO_TARGET prefers the powerup).
; (Thresholds are tuned so this behavior is visible in short Workshop runs.)
IF (HEALTH < 70 && POWERUP_EXISTS(HEALTH)) GOTO HEAL

; Resupply when low (and we aren't currently healing).
; (Ammo drains slowly with the current cooldown, so use a higher threshold for demos.)
IF (AMMO < 80 && POWERUP_EXISTS(AMMO)) GOTO RESUPPLY

; Otherwise pick a fight.
TARGET_CLOSEST
SET_MOVE_TO_TARGET
IF (HAS_TARGET_BOT() && SLOT_READY(SLOT1)) DO FIRE_SLOT1 TARGET
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

LABEL HEAL
CLEAR_TARGET_BOT
TARGET_POWERUP HEALTH
SET_MOVE_TO_TARGET
WAIT 3
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