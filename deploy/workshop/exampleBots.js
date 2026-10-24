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
;@slot2 BULLET
;@slot3 EMPTY
; bot7 — Long-Range Sniper
; Loadout: SLOT1=SNIPER, SLOT2=BULLET
; Balance note: the original SNIPER+SHIELD build had 0% survival in the league — shield drain (2/tick) left no fuel for teleport-free kiting and the bot had zero close-range defense. SNIPER+BULLET fixes both.
; Summary: keep distance; SNIPER the LOWEST_HEALTH_BOT (else CLOSEST_BOT); BULLET anyone crowding in; run for AMMO when the reserve is low.

LABEL LOOP

; --- Ammo discipline: SNIPER costs 6 ammo/shot, BULLET costs 2.
; Old gate was AMMO >= 30 with a RESUPPLY trip under 40 — the bot spent every
; tick between 30-39 walking to powerups and never fired (0 kills in league).
; Fire whenever a shot is affordable; resupply only when truly dry. ---
IF (AMMO < 12 && POWERUP_EXISTS(AMMO)) GOTO RESUPPLY

; --- Pick a victim: wounded first, but only finish off weak prey (hp <= 60) ---
IF (HAS_LOWEST_HEALTH_BOT() && TARGET_HEALTH <= 60) DO TARGET_LOWEST_HEALTH

; --- Nobody worth finishing: hunt the closest enemy instead ---
IF (!HAS_TARGET_BOT()) DO TARGET_CLOSEST

; --- Always aim at whoever is crowding us: USE_SLOTx TARGET fires at the
; target register, which may point at a distant/wounded bot — CLOSEST keeps
; defensive fire honest. ---
TARGET_CLOSEST

; --- Stay on the move every tick so rushers can't pin us in a corner ---
SET_MOVE_AWAY_FROM_BOT CLOSEST_BOT

; --- Defensive fire: shoot the bot that is actually in our face ---
IF (HAS_TARGET_BOT() && SLOT_READY(SLOT2) && DIST_TO_CLOSEST_BOT() <= 60 && AMMO >= 4) DO USE_SLOT2 TARGET

; --- Fire the sniper (hitscan, 12-tick cooldown); take any wounded-priority
; shot even if it means dipping into the bullet reserve ---
IF (HAS_TARGET_BOT() && SLOT_READY(SLOT1) && AMMO >= 8) DO USE_SLOT1 TARGET

; --- No shot available but enemies are crowding in: keep distance ---
IF (!SLOT_READY(SLOT1) && DIST_TO_CLOSEST_BOT() <= 48) GOTO BACKOFF

WAIT 1
GOTO LOOP

LABEL BACKOFF
TARGET_CLOSEST
IF (HAS_TARGET_BOT() && SLOT_READY(SLOT2) && AMMO >= 10) DO USE_SLOT2 TARGET
; --- Bubble up while backing away ONLY when energy is plentiful: shield
; drains 2/tick and this loop runs WAIT 5 + ~7 instructions (~12 ticks),
; which previously burned 100% of the energy reserve every pass and left
; nothing for the sniper shots (0 kills in league). ---
IF (ENERGY >= 80) DO SHIELD ON
SET_MOVE_AWAY_FROM_BOT CLOSEST_BOT
WAIT 5
SHIELD OFF
GOTO LOOP

LABEL RESUPPLY
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
IF (HAS_TARGET_BOT() && SLOT_READY(SLOT1) && DIST_TO_TARGET_BOT() >= 24 && DIST_TO_TARGET_BOT() <= 90 && AMMO >= 30) DO USE_SLOT1 TARGET

; --- Close-in bail: don't trade bumps while reloading ---
IF (!SLOT_READY(SLOT1) && DIST_TO_CLOSEST_BOT() <= 20) GOTO BACKOFF

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
;@slot3 BULLET
; bot9 — Blink Teleporter
; Loadout: SLOT1=TELEPORT, SLOT2=SHIELD, SLOT3=BULLET
; Balance note: the original TELEPORT+SHIELD build survived well but recorded 0 kills / 8 dmg out in the league — blink-and-shield has no damage source. TELEPORT+BULLET gives it a way to actually win fights. The bubble lives on SLOT2 so the refuel branch's SHIELD ON/OFF gates still reference it.
; Summary: chase CLOSEST_BOT on foot; when ENERGY >= 50 and the target is far, USE_SLOT1 SECTOR_5 to blink to center control; shoot the closest enemy with BULLET; farm ENERGY powerups to refill the jump fuel.

LABEL LOOP

; --- Fuel check first: TELEPORT costs 25 energy per jump ---
IF (ENERGY < 40 && POWERUP_EXISTS(ENERGY)) GOTO REFUEL

; --- Blink: cooldown 10 ticks, so only jump when it wins a race ---
IF (DIST_TO_CLOSEST_BOT() >= 80 && ENERGY >= 40 && SLOT_READY(SLOT1)) DO USE_SLOT1 SECTOR_5

; --- Finish the fight: shoot the closest enemy between jumps.
; USE_SLOT3 TARGET only fires at the *target register*, which SET_MOVE_TO_TARGET
; overwrites with powerups while refueling — pin CLOSEST every tick instead. ---
TARGET_CLOSEST
IF (HAS_TARGET_BOT() && SLOT_READY(SLOT3) && AMMO >= 10) DO USE_SLOT3 TARGET

; --- Normal pursuit between shots/jumps (follow the current target every tick) ---
SET_MOVE_TO_TARGET

WAIT 1
GOTO LOOP

LABEL REFUEL
TARGET_POWERUP ENERGY
MOVE_TO_TARGET
; --- Shield ON while walking to the pad: we are defenseless mid-refuel, and
; SHIELD only drains energy while active — spend it here, not during jumps. ---
IF (SLOT_READY(SLOT2) && !SLOT_ACTIVE(SLOT2) && ENERGY >= 45) DO SHIELD ON
IF (!POWERUP_EXISTS(ENERGY) || ENERGY >= 70) DO CLEAR_TARGET_POWERUP
IF (!POWERUP_EXISTS(ENERGY) || ENERGY >= 70) DO SHIELD OFF
IF (!POWERUP_EXISTS(ENERGY) || ENERGY >= 70) DO SET_MOVE_TO_BOT CLOSEST_BOT
GOTO LOOP
`,
  },

  bot10: {
    id: 'bot10',
    displayName: 'Flame Close-Quarters',
    sourceText: `;@slot1 FLAMER
;@slot2 EMPTY
;@slot3 SHIELD
; bot10 — Flame Close-Quarters
; Loadout: SLOT1=FLAMER, SLOT3=SHIELD
; Summary: chase CLOSEST_BOT; shield up on approach; FLAMER ON whenever an enemy is within ~30 units in front; disengage for ENERGY when the tank is dry.

LABEL LOOP

; --- Energy discipline: flame costs 2/tick, keep a reserve for one more burn ---
IF (ENERGY < 25 && POWERUP_EXISTS(ENERGY)) GOTO REFUEL

; --- Pick prey and walk at it ---
TARGET_CLOSEST
SET_MOVE_TO_TARGET

; --- Shield ON while closing (only if we can pay the drain) ---
IF (DIST_TO_CLOSEST_BOT() <= 60 && SLOT_READY(SLOT3) && !SLOT_ACTIVE(SLOT3) && ENERGY >= 40) DO SHIELD ON

; --- Burn when something is in arm's reach (FLAMER ON keeps streaming every tick) ---
IF (DIST_TO_CLOSEST_BOT() <= 30 && SLOT_READY(SLOT1) && !SLOT_ACTIVE(SLOT1)) DO FLAMER ON
IF (DIST_TO_CLOSEST_BOT() > 34 && SLOT_ACTIVE(SLOT1)) DO FLAMER OFF

; --- Drop shield when the tank gets low or nobody is near ---
IF (ENERGY < 30 || DIST_TO_CLOSEST_BOT() > 70) DO SHIELD OFF

WAIT 1
GOTO LOOP

LABEL REFUEL
SHIELD OFF
IF (SLOT_ACTIVE(SLOT1)) DO FLAMER OFF
TARGET_POWERUP ENERGY
MOVE_TO_TARGET
IF (!POWERUP_EXISTS(ENERGY) || ENERGY >= 60) DO CLEAR_TARGET_POWERUP
IF (!POWERUP_EXISTS(ENERGY) || ENERGY >= 60) DO SET_MOVE_TO_BOT CLOSEST_BOT
GOTO LOOP
`,
  },

  bot11: {
    id: 'bot11',
    displayName: 'Rail Sniper',
    sourceText: `;@slot1 RAILGUN
;@slot2 EMPTY
;@slot3 ARMOR
; bot11 — Rail Sniper
; Loadout: SLOT1=RAILGUN, SLOT3=ARMOR
; Summary: RAILGUN fires an instant piercing beam along the shooter's FACING direction,
; and facing is derived from the target register (see computeBotFacingDir) — so this bot
; pins CLOSEST_BOT as its target every tick and USE_SLOT1 TARGET lands the beam on it.
; Farm AMMO when dry; ARMOR soaks damage for free.

LABEL LOOP

; --- Ammo discipline: 8/shot, keep one spare round ---
IF (AMMO < 15 && POWERUP_EXISTS(AMMO)) GOTO RESUPPLY

; --- Pin prey: target register drives both movement AND railgun facing ---
TARGET_CLOSEST

; --- Keep ideal range ~40-90: back off if crowded, close in if very far ---
IF (HAS_TARGET_BOT() && DIST_TO_TARGET_BOT() <= 25) DO MOVE_AWAY_FROM_TARGET
IF (HAS_TARGET_BOT() && DIST_TO_TARGET_BOT() > 90) DO SET_MOVE_TO_TARGET

; --- Pull the trigger when a victim is locked and charged:
; USE_SLOT1 TARGET resolves the target register into a BOT selector,
; which orients the beam before it fires. ---
IF (HAS_TARGET_BOT() && SLOT_READY(SLOT1) && AMMO >= 15) DO USE_SLOT1 TARGET

WAIT 1
GOTO LOOP

LABEL RESUPPLY
TARGET_POWERUP AMMO
MOVE_TO_TARGET
IF (!POWERUP_EXISTS(AMMO) || AMMO >= 40) DO CLEAR_TARGET_POWERUP
IF (!POWERUP_EXISTS(AMMO) || AMMO >= 40) DO SET_MOVE_TO_BOT CLOSEST_BOT
GOTO LOOP
`,
  },

  bot12: {
    id: 'bot12',
    displayName: 'Shock Warden',
    sourceText: `;@slot1 PULSE
;@slot2 BULLET
;@slot3 SHIELD
; bot12 — Shock Warden
; Loadout: SLOT1=PULSE, SLOT2=BULLET, SLOT3=SHIELD
; Summary: farm ENERGY until the pulse fund (35+) is banked; when CLOSEST_BOT is within ~38 units, USE_SLOT1 to blast+stun them, then shoot the frozen target with BULLET. Shield only as a last-ditch wall.

LABEL LOOP

; --- Pulse costs 35 energy; without a charge there is nothing to do but farm ---
IF (ENERGY < 40 && POWERUP_EXISTS(ENERGY)) GOTO REFUEL

TARGET_CLOSEST

; --- Emergency shield when cornered AND healthy enough to pay both drains ---
IF (HAS_TARGET_BOT() && DIST_TO_TARGET_BOT() <= 20 && HEALTH <= 40 && SLOT_READY(SLOT3) && !SLOT_ACTIVE(SLOT3) && ENERGY >= 60) DO SHIELD ON
IF (DIST_TO_TARGET_BOT() > 30 || ENERGY < 45) DO SHIELD OFF

; --- Blast point-blank: stun + knockback, then punish with bullets.
; PULSE is self-centered — the USE_SLOT target token is ignored by the engine,
; so TARGET (the pinned victim) is a valid, readable trigger argument. ---
IF (HAS_TARGET_BOT() && DIST_TO_TARGET_BOT() <= 38 && SLOT_READY(SLOT1) && ENERGY >= 40) DO USE_SLOT1 TARGET

; --- Punish window: stunned targets cannot move for 3 ticks — shoot them ---
TARGET_CLOSEST
IF (HAS_TARGET_BOT() && SLOT_READY(SLOT2) && AMMO >= 10) DO USE_SLOT2 TARGET

SET_MOVE_TO_TARGET

WAIT 1
GOTO LOOP

LABEL REFUEL
SHIELD OFF
TARGET_POWERUP ENERGY
MOVE_TO_TARGET
IF (!POWERUP_EXISTS(ENERGY) || ENERGY >= 75) DO CLEAR_TARGET_POWERUP
IF (!POWERUP_EXISTS(ENERGY) || ENERGY >= 75) DO SET_MOVE_TO_BOT CLOSEST_BOT
GOTO LOOP
`,
  },

  bot13: {
    id: 'bot13',
    displayName: 'Ghost Assassin',
    sourceText: `;@slot1 CLOAK
;@slot2 SNIPER
;@slot3 EMPTY
; bot13 — Ghost Assassin
; Loadout: SLOT1=CLOAK, SLOT2=SNIPER
; Summary: drop CLOAK when an enemy is near or wounded prey exists, hunt LOWEST_HEALTH_BOT (else CLOSEST), snipe with BULLET-cheap discipline on AMMO; refuel ENERGY between kills. Firing breaks cloak — that is the intended rhythm.

LABEL LOOP

; --- Cloak fund: 30 per drop, keep enough to vanish after the next shot ---
IF (ENERGY < 35 && POWERUP_EXISTS(ENERGY)) GOTO REFUEL

; --- Pick prey: finish the wounded, else whoever is closest ---
IF (HAS_LOWEST_HEALTH_BOT()) DO TARGET_LOWEST_HEALTH
IF (!HAS_TARGET_BOT()) DO TARGET_CLOSEST

; --- Go dark when prey is in sniper range so their return fire can't lock us ---
IF (HAS_TARGET_BOT() && DIST_TO_TARGET_BOT() <= 80 && SLOT_READY(SLOT1) && ENERGY >= 35 && !SLOT_ACTIVE(SLOT1)) DO USE_SLOT1 TARGET

; --- Ambush shot: instant hitscan; firing ends the cloak window ---
IF (HAS_TARGET_BOT() && SLOT_READY(SLOT2) && AMMO >= 12) DO USE_SLOT2 TARGET

; --- Kiting: hold ~50 units of distance from the target ---
IF (HAS_TARGET_BOT() && DIST_TO_TARGET_BOT() <= 35) DO MOVE_AWAY_FROM_TARGET
IF (HAS_TARGET_BOT() && DIST_TO_TARGET_BOT() > 70) DO SET_MOVE_TO_TARGET

WAIT 1
GOTO LOOP

LABEL REFUEL
TARGET_POWERUP ENERGY
MOVE_TO_TARGET
IF (!POWERUP_EXISTS(ENERGY) || ENERGY >= 65) DO CLEAR_TARGET_POWERUP
IF (!POWERUP_EXISTS(ENERGY) || ENERGY >= 65) DO SET_MOVE_TO_BOT CLOSEST_BOT
GOTO LOOP
`,
  },
}

export const OPPONENT_EXAMPLE_POOL_IDS = ['bot1', 'bot2', 'bot3', 'bot4', 'bot5', 'bot6', 'bot7', 'bot8', 'bot9', 'bot10', 'bot11', 'bot12', 'bot13']
export const DEFAULT_OPPONENT_EXAMPLE_IDS = ['bot2', 'bot3', 'bot4']
