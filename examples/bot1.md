# Built-in bot: Weakest-Link Patrol (BULLET)

**Suggested loadout**
- `SLOT1 = BULLET`
- `SLOT2 = (empty)`
- `SLOT3 = (empty)`

**Intended behavior**
- Demonstrates a **zone patrol loop** inside the bot’s current sector that reliably cycles through all 4 zones.
  - To keep the script simple (no extra state), this bot patrols in an axis-aligned loop: **1 → 2 → 4 → 3 → 1**.
- Uses `TARGET_LOWEST_HEALTH` to opportunistically pressure the weakest visible enemy while continuing the patrol.
- If bullets are nearby, briefly targets the closest bullet, dodges away from it, and clears the bullet target.
- If a bot is **very close** (or we just bumped), briefly backs off toward the center before resuming patrol.
- If health is low and a HEALTH powerup exists, commits briefly to a healing run.
- If ammo is low and an AMMO powerup exists (and we’re not currently healing), commits briefly to an ammo run.

## Script

```text
;@slot1 BULLET
;@slot2 EMPTY
;@slot3 EMPTY
; bot1 — Weakest-Link Patrol
; Loadout: SLOT1=BULLET
; Summary: patrol zones 1→2→4→3→1 (current sector); pressure the weakest bot; dodge bullets via the bullet target register; detour for HEALTH/AMMO when low.

LABEL LOOP

; If we're about to collide, sidestep within our current sector.
IF (DIST_TO_CLOSEST_BOT() <= 32 || BUMPED_BOT()) GOTO BACKOFF

; If enemy bullets are nearby, dodge for a tick.
IF (BULLET_IN_SAME_SECTOR() || BULLET_IN_ADJ_SECTOR()) GOTO DODGE_BULLETS

; Heal / resupply detours.
; (Thresholds are tuned so this behavior is visible in short Workshop runs.)
IF (HEALTH < 70 && POWERUP_EXISTS(HEALTH)) GOTO HEAL
IF (AMMO < 80 && POWERUP_EXISTS(AMMO)) GOTO RESUPPLY

; Patrol loop.
IF (IN_ZONE(1)) DO SET_MOVE_TO_ZONE 2
IF (IN_ZONE(2)) DO SET_MOVE_TO_ZONE 4
IF (IN_ZONE(4)) DO SET_MOVE_TO_ZONE 3
IF (IN_ZONE(3)) DO SET_MOVE_TO_ZONE 1

TARGET_LOWEST_HEALTH
IF (HAS_TARGET_BOT() && SLOT_READY(SLOT1)) DO USE_SLOT1 TARGET

GOTO LOOP

LABEL BACKOFF
; Step to the opposite zone in our current sector, then resume patrol.
CLEAR_MOVE
IF (IN_ZONE(1)) DO SET_MOVE_TO_ZONE 4
IF (IN_ZONE(2)) DO SET_MOVE_TO_ZONE 3
IF (IN_ZONE(3)) DO SET_MOVE_TO_ZONE 2
IF (IN_ZONE(4)) DO SET_MOVE_TO_ZONE 1
WAIT 2
CLEAR_MOVE
GOTO LOOP

LABEL DODGE_BULLETS
; Quick evasive step: move away from the closest bullet, then clear the bullet target.
CLEAR_MOVE
TARGET_CLOSEST_BULLET
IF (HAS_TARGET_BULLET()) DO MOVE_AWAY_FROM_TARGET
IF (HAS_TARGET_BULLET()) DO CLEAR_TARGET_BULLET
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
