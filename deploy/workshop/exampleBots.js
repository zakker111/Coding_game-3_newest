// Copied from /examples/*.md (scripts only) for the buildless deploy workshop.
// Keep this file in sync with `/examples/`.

export const EXAMPLE_BOTS = {
  bot0: {
    id: 'bot0',
    displayName: 'Aggressive Skirmisher (starter)',
    sourceText: `;@slot1 BULLET
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
; Quick evasive step: pick the closest bullet, then move away from it for 1 tick.
CLEAR_MOVE
TARGET_CLOSEST_BULLET
IF (HAS_TARGET_BULLET()) DO MOVE_AWAY_FROM_TARGET
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
`,
  },

  bot1: {
    id: 'bot1',
    displayName: 'Zone Patrol Shooter',
    sourceText: `;@slot1 BULLET
;@slot2 EMPTY
;@slot3 EMPTY
; bot1 — Zone Patrol Shooter
; Loadout: SLOT1=BULLET
; Summary: patrol zones 1→2→4→3→1 (current sector); avoid bump-lock; detour for HEALTH/AMMO when low; dodge bullets; fire at NEAREST_BOT.

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

IF (SLOT_READY(SLOT1)) DO FIRE_SLOT1 NEAREST_BOT

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
`,
  },

  bot2: {
    id: 'bot2',
    displayName: 'Chaser Shooter',
    sourceText: `;@slot1 BULLET
;@slot2 EMPTY
;@slot3 EMPTY
; bot2 — Chaser Shooter
; Loadout: SLOT1=BULLET
; Summary: choose a target (BOT1→BOT3→BOT4), chase it, shoot it; avoid bump-lock; detour for HEALTH/AMMO; dodge enemy bullets.

LABEL LOOP

; If we're about to collide, sidestep within our current sector.
IF (DIST_TO_CLOSEST_BOT() <= 32 || BUMPED_BOT()) GOTO BACKOFF

; If enemy bullets are nearby, dodge for a tick.
IF (BULLET_IN_SAME_SECTOR() || BULLET_IN_ADJ_SECTOR()) GOTO DODGE_BULLETS

; Heal / resupply detours.
; (Thresholds are tuned so this behavior is visible in short Workshop runs.)
IF (HEALTH < 70 && POWERUP_EXISTS(HEALTH)) GOTO HEAL
IF (AMMO < 80 && POWERUP_EXISTS(AMMO)) GOTO RESUPPLY

; Target the first alive enemy in priority order.
; (This script is intended to run in the BOT2 slot, so we intentionally skip BOT2.)
IF (BOT_ALIVE(BOT1)) DO SET_TARGET BOT1
IF (!BOT_ALIVE(BOT1) && BOT_ALIVE(BOT3)) DO SET_TARGET BOT3
IF (!BOT_ALIVE(BOT1) && !BOT_ALIVE(BOT3) && BOT_ALIVE(BOT4)) DO SET_TARGET BOT4

SET_MOVE_TO_TARGET

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
`,
  },

  bot3: {
    id: 'bot3',
    displayName: 'Corner Bunker',
    sourceText: `;@slot1 BULLET
;@slot2 EMPTY
;@slot3 EMPTY
; bot3 — Corner Bunker
; Loadout: SLOT1=BULLET
; Summary: hold a home corner; avoid bump-lock; dodge bullets; run to powerups when low (with a short WAIT); shoot NEAREST_BOT when close.

SET_MOVE_TO_SECTOR 1 ZONE 1

LABEL LOOP

; If we're about to collide, sidestep within our current sector.
IF (DIST_TO_CLOSEST_BOT() <= 32 || BUMPED_BOT()) GOTO BACKOFF

; If enemy bullets are nearby, dodge for a tick.
IF (BULLET_IN_SAME_SECTOR() || BULLET_IN_ADJ_SECTOR()) GOTO DODGE_BULLETS

; Pick a powerup goal (priority: health → ammo).
; (Thresholds are tuned so this behavior is visible in short Workshop runs.)
IF (HEALTH < 70 && POWERUP_EXISTS(HEALTH)) DO SET_MOVE_TO_POWERUP HEALTH
IF (AMMO < 80 && POWERUP_EXISTS(AMMO)) DO SET_MOVE_TO_POWERUP AMMO

; If we decided to go get a powerup, commit for 2 ticks while the goal keeps moving us.
; Note: WAIT is control-flow and cannot be nested under IF (...) DO ....
IF ((HEALTH < 70 && POWERUP_EXISTS(HEALTH)) || (AMMO < 80 && POWERUP_EXISTS(AMMO))) GOTO COMMIT_POWERUP

; Otherwise, go back home.
IF (HEALTH >= 70 && AMMO >= 80) DO SET_MOVE_TO_SECTOR 1 ZONE 1

; Only shoot when something is fairly close (helps conserve ammo).
IF (SLOT_READY(SLOT1) && DIST_TO_CLOSEST_BOT() <= 120) DO FIRE_SLOT1 NEAREST_BOT

GOTO LOOP

LABEL COMMIT_POWERUP
WAIT 2
GOTO LOOP

LABEL BACKOFF
; Step to the opposite zone in our current sector, then resume normal logic.
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
`,
  },

  bot4: {
    id: 'bot4',
    displayName: 'Saw Rusher',
    sourceText: `;@slot1 SAW
;@slot2 SHIELD
;@slot3 EMPTY
; bot4 — Saw Rusher
; Loadout: SLOT1=SAW, SLOT2=SHIELD
; Summary: chase CLOSEST_BOT; bump/close→saw burst; bullets nearby→shield burst; sidestep when too close.

SET_MOVE_TO_BOT CLOSEST_BOT

LABEL LOOP

; SAW burst window after a bump.
IF (BUMPED_BOT() && SLOT_READY(SLOT1) && !SLOT_ACTIVE(SLOT1)) DO SAW ON
IF (BUMPED_BOT() && SLOT_READY(SLOT1) && !SLOT_ACTIVE(SLOT1)) DO SET_TIMER T1 4
IF (TIMER_DONE(T1) && SLOT_ACTIVE(SLOT1)) DO SAW OFF

; If we get right on top of someone, turn the saw on even without a bump.
IF (DIST_TO_CLOSEST_BOT() <= 18 && SLOT_READY(SLOT1) && !SLOT_ACTIVE(SLOT1)) DO SAW ON
IF (DIST_TO_CLOSEST_BOT() > 40 && SLOT_ACTIVE(SLOT1)) DO SAW OFF

; If we're very close, briefly sidestep to avoid repeated bumps.
IF (DIST_TO_CLOSEST_BOT() <= 32 || BUMPED_BOT()) GOTO BACKOFF

; Shield when bullets are around (keep it on for at least 3 ticks).
IF ((BULLET_IN_SAME_SECTOR() || BULLET_IN_ADJ_SECTOR()) && SLOT_READY(SLOT2) && !SLOT_ACTIVE(SLOT2)) DO SHIELD ON
IF ((BULLET_IN_SAME_SECTOR() || BULLET_IN_ADJ_SECTOR()) && SLOT_READY(SLOT2) && !SLOT_ACTIVE(SLOT2)) DO SET_TIMER T2 3
IF (TIMER_DONE(T2) && SLOT_ACTIVE(SLOT2) && !BULLET_IN_SAME_SECTOR() && !BULLET_IN_ADJ_SECTOR()) DO SHIELD OFF

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
`,
  },

  bot5: {
    id: 'bot5',
    displayName: 'Burst Hunter',
    sourceText: `;@slot1 BULLET
;@slot2 ARMOR
;@slot3 EMPTY
; bot5 — Burst Hunter
; Loadout: SLOT1=BULLET, SLOT2=ARMOR
; Summary: center control + burst windows; detours for HEALTH/AMMO; avoid bump-lock; dodge bullets when threatened.

; Default posture: drift toward the center.
SET_MOVE_TO_SECTOR 5

LABEL LOOP

; If we're about to collide, step to a nearby zone briefly.
IF (DIST_TO_CLOSEST_BOT() <= 32 || BUMPED_BOT()) GOTO BACKOFF

; If enemy bullets are nearby, dodge for a tick (especially important for bullet-based bots).
IF (BULLET_IN_SAME_SECTOR() || BULLET_IN_ADJ_SECTOR()) GOTO DODGE_BULLETS

; --- Emergency powerup logic (commit for 3 ticks) ---
; Low health → go to HEALTH.
; (Thresholds are tuned so this behavior is visible in short Workshop runs.)
IF (HEALTH < 70 && POWERUP_EXISTS(HEALTH) && TIMER_DONE(T1)) DO TARGET_POWERUP HEALTH
IF (HEALTH < 70 && POWERUP_EXISTS(HEALTH) && TIMER_DONE(T1)) DO SET_TIMER T1 3
IF (TIMER_ACTIVE(T1)) DO MOVE_TO_TARGET

; Low ammo (but not in the middle of a health run) → go to AMMO.
IF (!TIMER_ACTIVE(T1) && AMMO < 80 && POWERUP_EXISTS(AMMO) && TIMER_DONE(T2)) DO TARGET_POWERUP AMMO
IF (!TIMER_ACTIVE(T1) && AMMO < 80 && POWERUP_EXISTS(AMMO) && TIMER_DONE(T2)) DO SET_TIMER T2 3
IF (TIMER_ACTIVE(T2)) DO MOVE_TO_TARGET

; --- Combat logic ---
; If an enemy is within 40 world units, open a 4-tick burst window.
IF (!TIMER_ACTIVE(T1) && !TIMER_ACTIVE(T2) && DIST_TO_CLOSEST_BOT() <= 40 && TIMER_DONE(T3)) DO SET_TIMER T3 4

; During the burst, lock the closest target and fire at it.
IF (TIMER_ACTIVE(T3)) DO TARGET_CLOSEST
IF (TIMER_ACTIVE(T3) && HAS_TARGET_BOT() && SLOT_READY(SLOT1)) DO USE_SLOT1 TARGET

; Otherwise take opportunistic pot-shots when something is very close.
IF (!TIMER_ACTIVE(T3) && SLOT_READY(SLOT1) && DIST_TO_CLOSEST_BOT() <= 20) DO FIRE_SLOT1 NEAREST_BOT

GOTO LOOP

LABEL BACKOFF
SET_MOVE_TO_SECTOR 5 ZONE 1
WAIT 2
SET_MOVE_TO_SECTOR 5
GOTO LOOP

LABEL DODGE_BULLETS
; Quick evasive step: move to a different zone for 1 tick.
CLEAR_MOVE
IF (IN_ZONE(1)) DO SET_MOVE_TO_ZONE 2
IF (IN_ZONE(2)) DO SET_MOVE_TO_ZONE 4
IF (IN_ZONE(4)) DO SET_MOVE_TO_ZONE 3
IF (IN_ZONE(3)) DO SET_MOVE_TO_ZONE 1
WAIT 1
SET_MOVE_TO_SECTOR 5
GOTO LOOP
`,
  },

  bot6: {
    id: 'bot6',
    displayName: 'Energy Saw Skirmisher',
    sourceText: `;@slot1 SAW
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
`,
  },
}

export const OPPONENT_EXAMPLE_POOL_IDS = ['bot1', 'bot2', 'bot3', 'bot4', 'bot5', 'bot6']
export const DEFAULT_OPPONENT_EXAMPLE_IDS = ['bot2', 'bot3', 'bot4']
