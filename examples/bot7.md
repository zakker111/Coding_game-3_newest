# Built-in bot: Long-Range Sniper (SNIPER + BULLET)

**Suggested loadout**
- `SLOT1 = SNIPER`
- `SLOT2 = BULLET`
- `SLOT3 = (empty)`

**Intended behavior**
- Kite-and-shoot skirmisher: keeps distance and picks off enemies with **SNIPER** hitscan shots (instant hit, no bullet travel — great against fast movers).
- Prefers **LOWEST_HEALTH_BOT** targets to finish off wounded bots; falls back to `CLOSEST_BOT` when nobody is hurt.
- Sniping costs ammo per shot, so it hoards ammo above a threshold and runs for `AMMO` powerups when the reserve gets low.
- Returns **BULLET** fire when an enemy closes in — a sniper with no close-range answer dies to rushers before it ever gets value out of its hitscan shots.
- Backs away when enemies get too close instead of trading bumps.

## Script

```text
;@slot1 SNIPER
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
```
