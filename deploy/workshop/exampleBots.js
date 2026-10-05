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
    displayName: 'Weakest-Link Patrol',
    sourceText: `;@slot1 BULLET
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
`,
  },

  bot2: {
    id: 'bot2',
    displayName: 'Target Cycler',
    sourceText: `;@slot1 BULLET
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
`,
  },

  bot3: {
    id: 'bot3',
    displayName: 'Immediate-Move Mine Bunker',
    sourceText: `;@slot1 MINE
;@slot2 EMPTY
;@slot3 EMPTY
; bot3 — Immediate-Move Mine Bunker
; Loadout: SLOT1=MINE
; Summary: hold a home corner with immediate movement; drop mines in the bunker lane on a short timer; make one-tick HEALTH/AMMO detours; dodge bullets via the bullet target register.

LABEL LOOP

; If enemy bullets are nearby, dodge for a tick.
IF (BULLET_IN_SAME_SECTOR() || BULLET_IN_ADJ_SECTOR()) GOTO DODGE_BULLETS

; If we're about to collide, take a short step inward.
IF (DIST_TO_CLOSEST_BOT() <= 32 || BUMPED_BOT()) GOTO BACKOFF

; Keep a mine in our lane, but wait a few ticks between placement attempts.
IF (SLOT_READY(SLOT1) && TIMER_DONE(T1)) DO USE_SLOT1 NONE
IF (SLOT_READY(SLOT1) && TIMER_DONE(T1)) DO SET_TIMER T1 6

; Make one-tick detours to the nearest useful powerup.
; (Thresholds are tuned so this behavior is visible in short Workshop runs.)
IF (HEALTH < 70 && POWERUP_EXISTS(HEALTH)) DO MOVE_TO_POWERUP HEALTH
IF (HEALTH >= 70 && AMMO < 80 && POWERUP_EXISTS(AMMO)) DO MOVE_TO_POWERUP AMMO

; Otherwise, reassert the home corner immediately.
IF (HEALTH >= 70 && (AMMO >= 80 || !POWERUP_EXISTS(AMMO))) DO MOVE_TO_SECTOR 1 ZONE 1

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
`,
  },

  bot4: {
    id: 'bot4',
    displayName: 'Slot-Driven Saw Diver',
    sourceText: `;@slot1 SAW
;@slot2 SHIELD
;@slot3 EMPTY
; bot4 — Slot-Driven Saw Diver
; Loadout: SLOT1=SAW, SLOT2=SHIELD
; Summary: chase CLOSEST_BOT; drive SAW/SHIELD through USE_SLOTn / STOP_SLOTn; refuel from ENERGY when low; sidestep when too close.

SET_MOVE_TO_BOT CLOSEST_BOT

LABEL LOOP

; Shield early when a bullet is closing in (keep it on for at least 3 ticks).
TARGET_CLOSEST_BULLET
IF (HAS_TARGET_BULLET() && SLOT_READY(SLOT2) && !SLOT_ACTIVE(SLOT2)) DO USE_SLOT2 SELF
IF (HAS_TARGET_BULLET() && SLOT_READY(SLOT2) && !SLOT_ACTIVE(SLOT2)) DO SET_TIMER T2 3
IF (TIMER_DONE(T2) && SLOT_ACTIVE(SLOT2) && !HAS_TARGET_BULLET()) DO STOP_SLOT2

; If energy gets low, break off and refuel before trying to burst again.
IF (ENERGY < 45 && POWERUP_EXISTS(ENERGY) && TIMER_DONE(T3)) DO TARGET_POWERUP ENERGY
IF (ENERGY < 45 && POWERUP_EXISTS(ENERGY) && TIMER_DONE(T3)) DO SET_TIMER T3 4
IF (TIMER_ACTIVE(T3)) GOTO REFUEL

; SAW burst window after a bump.
IF (BUMPED_BOT() && SLOT_READY(SLOT1) && !SLOT_ACTIVE(SLOT1)) DO USE_SLOT1 SELF
IF (BUMPED_BOT() && SLOT_READY(SLOT1) && !SLOT_ACTIVE(SLOT1)) DO SET_TIMER T1 4
IF (TIMER_DONE(T1) && SLOT_ACTIVE(SLOT1)) DO STOP_SLOT1

; If we get right on top of someone, turn the saw on even without a bump.
IF (DIST_TO_CLOSEST_BOT() <= 18 && SLOT_READY(SLOT1) && !SLOT_ACTIVE(SLOT1)) DO USE_SLOT1 SELF
IF (DIST_TO_CLOSEST_BOT() > 40 && SLOT_ACTIVE(SLOT1)) DO STOP_SLOT1

; If we're very close, briefly sidestep to avoid repeated bumps.
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
IF (SLOT_ACTIVE(SLOT1)) DO STOP_SLOT1
IF (SLOT_ACTIVE(SLOT2)) DO STOP_SLOT2
MOVE_TO_TARGET
IF (ENERGY >= 75 || !POWERUP_EXISTS(ENERGY) || TIMER_DONE(T3)) DO CLEAR_TIMER T3
IF (ENERGY >= 75 || !POWERUP_EXISTS(ENERGY) || TIMER_DONE(T3)) DO SET_MOVE_TO_BOT CLOSEST_BOT
GOTO LOOP
`,
  },

  bot5: {
    id: 'bot5',
    displayName: 'Armored Grenade Controller',
    sourceText: `;@slot1 GRENADE
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
IF (ENERGY < 45 && POWERUP_EXISTS(ENERGY) && TIMER_DONE(T3)) DO TARGET_POWERUP ENERGY
IF (ENERGY < 45 && POWERUP_EXISTS(ENERGY) && TIMER_DONE(T3)) DO SET_TIMER T3 4
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

  bot7: {
    id: 'bot7',
    displayName: 'Long-Range Sniper',
    sourceText: `;@slot1 SNIPER
;@slot2 SHIELD
;@slot3 EMPTY
; bot7 — Long-Range Sniper
; Loadout: SLOT1=SNIPER, SLOT2=SHIELD
; Summary: keep distance; SNIPER the LOWEST_HEALTH_BOT (else CLOSEST_BOT); SHIELD against incoming bullets; run for AMMO when the reserve is low.

LABEL LOOP

; --- Ammo discipline: SNIPER costs ammo per shot, keep a reserve ---
IF (AMMO < 40 && POWERUP_EXISTS(AMMO)) GOTO RESUPPLY

; --- Pick a victim: wounded first (TARGET_LOWEST_HEALTH also drives movement) ---
TARGET_LOWEST_HEALTH

; --- Defensive SHIELD burst when a bullet gets dangerous ---
TARGET_CLOSEST_BULLET
IF (HAS_TARGET_BULLET() && DIST_TO_TARGET_BULLET() <= 40 && SLOT_READY(SLOT2) && !SLOT_ACTIVE(SLOT2)) DO SHIELD ON
IF (!HAS_TARGET_BULLET() || DIST_TO_TARGET_BULLET() > 60) DO SHIELD OFF

; --- Fire the sniper (hitscan, 10-tick cooldown, gated on ammo) ---
IF (HAS_TARGET_BOT() && SLOT_READY(SLOT1) && AMMO >= 50) DO USE_SLOT1 TARGET

; --- Maintain range: back off if enemies crowd in ---
IF (DIST_TO_CLOSEST_BOT() <= 48) GOTO BACKOFF

WAIT 1
GOTO LOOP

LABEL BACKOFF
SET_MOVE_AWAY_FROM_BOT CLOSEST_BOT
WAIT 3
SET_MOVE_TO_BOT CLOSEST_BOT
GOTO LOOP

LABEL RESUPPLY
SHIELD OFF
TARGET_POWERUP AMMO
MOVE_TO_TARGET
IF (!POWERUP_EXISTS(AMMO) || AMMO >= 60) DO CLEAR_TARGET_POWERUP
IF (!POWERUP_EXISTS(AMMO) || AMMO >= 60) DO SET_MOVE_TO_BOT CLOSEST_BOT
GOTO LOOP
`,
  },

  bot8: {
    id: 'bot8',
    displayName: 'Rocket Barrager',
    sourceText: `;@slot1 ROCKET
;@slot2 ARMOR
;@slot3 EMPTY
; bot8 — Rocket Barrager
; Loadout: SLOT1=ROCKET, SLOT2=ARMOR
; Summary: hunt CLOSEST_BOT under ARMOR; fire ROCKET volleys at mid range (24..90 units) gated by SLOT_READY and an ammo reserve; resupply AMMO when low.

; ARMOR is passive once slotted — no ON/OFF needed, but we keep it explicit for teaching value.
LABEL LOOP

; --- Choose the hunt target ---
TARGET_CLOSEST

; --- Resupply check: rockets cost a lot of ammo per shot ---
IF (AMMO < 30 && POWERUP_EXISTS(AMMO)) GOTO RESUPPLY

; --- Volley logic: fire only in the sweet spot, respecting the 12-tick cooldown ---
IF (HAS_TARGET_BOT() && SLOT_READY(SLOT1) && DIST_TO_TARGET_BOT() >= 24 && DIST_TO_TARGET_BOT() <= 90 && AMMO >= 40) DO USE_SLOT1 TARGET

; --- Close-in bail: don't trade bumps while reloading ---
IF (DIST_TO_CLOSEST_BOT() <= 20) GOTO BACKOFF

WAIT 1
GOTO LOOP

LABEL BACKOFF
SET_MOVE_AWAY_FROM_BOT CLOSEST_BOT
WAIT 2
SET_MOVE_TO_BOT CLOSEST_BOT
GOTO LOOP

LABEL RESUPPLY
TARGET_POWERUP AMMO
MOVE_TO_TARGET
IF (!POWERUP_EXISTS(AMMO) || AMMO >= 60) DO CLEAR_TARGET_POWERUP
IF (!POWERUP_EXISTS(AMMO) || AMMO >= 60) DO SET_MOVE_TO_BOT CLOSEST_BOT
GOTO LOOP
`,
  },

  bot9: {
    id: 'bot9',
    displayName: 'Blink Teleporter',
    sourceText: `;@slot1 TELEPORT
;@slot2 SHIELD
;@slot3 EMPTY
; bot9 — Blink Teleporter
; Loadout: SLOT1=TELEPORT, SLOT2=SHIELD
; Summary: chase CLOSEST_BOT on foot; when ENERGY >= 50 and the target is far, USE_SLOT1 SECTOR_5 to blink to center control; SHIELD on approach; farm ENERGY powerups to refill the jump fuel.

LABEL LOOP

; --- Fuel check first: TELEPORT costs 30 energy per jump ---
IF (ENERGY < 50 && POWERUP_EXISTS(ENERGY)) GOTO REFUEL

; --- Defensive shield while closing distance ---
TARGET_CLOSEST_BULLET
IF (HAS_TARGET_BULLET() && DIST_TO_TARGET_BULLET() <= 40 && SLOT_READY(SLOT2) && !SLOT_ACTIVE(SLOT2)) DO SHIELD ON
IF (!HAS_TARGET_BULLET() || DIST_TO_TARGET_BULLET() > 60) DO SHIELD OFF

; --- Blink: long cooldown (14 ticks), so only jump when it wins a race ---
IF (DIST_TO_CLOSEST_BOT() >= 80 && ENERGY >= 50 && SLOT_READY(SLOT1)) DO USE_SLOT1 SECTOR_5

; --- Normal pursuit between jumps ---
SET_MOVE_TO_BOT CLOSEST_BOT

; --- Finish the fight up close with bumps once we've arrived ---
IF (DIST_TO_CLOSEST_BOT() <= 24) DO SHIELD OFF

WAIT 1
GOTO LOOP

LABEL REFUEL
TARGET_POWERUP ENERGY
MOVE_TO_TARGET
IF (!POWERUP_EXISTS(ENERGY) || ENERGY >= 70) DO CLEAR_TARGET_POWERUP
IF (!POWERUP_EXISTS(ENERGY) || ENERGY >= 70) DO SET_MOVE_TO_BOT CLOSEST_BOT
GOTO LOOP
`,
  },
}

export const OPPONENT_EXAMPLE_POOL_IDS = ['bot1', 'bot2', 'bot3', 'bot4', 'bot5', 'bot6', 'bot7', 'bot8', 'bot9']
export const DEFAULT_OPPONENT_EXAMPLE_IDS = ['bot2', 'bot3', 'bot4']
