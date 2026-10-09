# New Weapons & Abilities Proposal (ruleset 0.3.0 candidates)

Current roster (10 modules, `packages/ruleset/src/index.js`):
- **WEAPON group (exclusive):** BULLET, SAW, GRENADE, SNIPER, ROCKET
- **Utility/passive:** SHIELD, ARMOR, MINE, REPAIR_DRONE, TELEPORT

Loadout = 3 slots, at most one WEAPON. Every new module below fits that model
and reuses existing sim plumbing (`bulletSim`, `grenadeSim`, `mineSim`,
`droneSim`, `powerupSim`) so implementation cost stays low and determinism is
preserved (integer ticks, PRNG-driven spawns only).

---

## Tier 1 — Weapons (new members of the exclusive WEAPON group)

### 1. FLAMER (close-range zone denial)
- **Concept:** short cone of fire; low per-tick damage but relentless pressure; counters TELEPORT campers and shield turtles.
- **Mechanics:** hits any enemy whose center is within 24 units in a +/-40 deg cone facing the bot's last MOVE direction. Damage applied every 2 ticks while active.
- **Numbers:** ENERGY cost 4/tick burst, no ammo, cooldown 2, damage 3 per tick, range 24.
- **Why it works today:** pure geometry check against state we already store (position + heading). No new projectile type needed.
- **Counterplay:** outrange it (SNIPER/BULLET), leave cone before energy drains.

### 2. RAILGUN (piercing long-range beam)
- **Concept:** fires a straight piercing beam along Bresenham line (we already have `bresenham.js`); damages EVERY bot in line, stops at walls or after 3 hits.
- **Numbers:** AMMO cost 10, cooldown 20, damage 20 to first target, 12 to each subsequent (max 3), full arena range.
- **Risk/reward:** slow wind-up means moving targets dodge easily; great vs clustered bots / mine fields.
- **Events:** single `BEAM` event listing hit bot ids in order -> replay-friendly.

### 3. SWARM (deployable homing micro-drones)
- **Concept:** releases 3 slow mini-drones that home at nearest enemy for up to 40 ticks; each deals 6 damage on contact then dies.
- **Reuses:** `droneSim.js` (REPAIR_DRONE pathing) with hostile targeting flag.
- **Numbers:** AMMO cost 9, cooldown 18, 3 drones x 6 dmg, speed 2/tick, TTL 40.
- **Counterplay:** drones are shootable (extend TARGET_CLOSEST_BULLET semantics) or dodgeable behind walls.

---

## Tier 2 — Abilities (utility slot, non-exclusive)

### 4. PULSE (knockback + reveal shockwave)
- **Concept:** instant radial burst: pushes all bots within 40 units away by 12 units (wall clamp), stuns enemies 3 ticks.
- **Numbers:** ENERGY cost 35, cooldown 25.
- **Design role:** anti-grenade/mine escape tool; pairs with FLAMER (push into your cone... or away from theirs).

### 5. JETPACK (mobility)
- **Concept:** for 6 ticks after activation the bot moves at 2x speed and ignores wall-bump penalty; can cross hazard rows (mines) faster.
- **Numbers:** ENERGY cost 20, cooldown 16, duration 6 ticks, speed multiplier 2.
- **Why:** TELEPORT is blink-instant but high-cost/long-cooldown; JETPACK is continuous, readable in replays, better for learners.

### 6. DECOY (clone bait)
- **Concept:** spawns a stationary fake bot at current position for 20 ticks. Enemy bots' TARGET_CLOSEST/bullets treat it as a real target (HP 1, dies to one hit with a visible `DECOY_DESTROYED` event).
- **Numbers:** ENERGY cost 25, cooldown 20.
- **AI impact:** forces bot authors to handle "target died instantly" paths — fun workshop content.

### 7. CLOAK (invisibility)
- **Concept:** for 10 ticks the bot is excluded from enemy targeting instructions (TARGET_CLOSEST skips it, homing drones lose lock, mines don't trigger on it). Attacking breaks cloak immediately.
- **Numbers:** ENERGY cost 30, cooldown 24, duration 10, attack cancels.
- **Determinism note:** purely a visibility predicate evaluated in fixed instruction order.

---

## Tier 3 — Late-game / meta flavor (defer until after balance pass)

| Module | One-liner | Cost idea |
|---|---|---|
| **TURRET** | Deploy static gun (BULLET-rate) at own position for 60 ticks; can't move while deployed | AMMO 10, cd 20 |
| **BLACK HOLE** | Pulls bots/projectiles toward point for 8 ticks; big teamfight reset | ENERGY 45, cd 30 |
| **VAMPIRE ROUND** | Next bullet heals shooter for damage dealt | AMMO 3, cd 10 |
| **EMP** | Disables ALL enemy cooldown-based modules for 6 ticks | ENERGY 40, cd 30 |

---

## Recommended pick for ruleset 0.3.0

Ship **5 new modules** (keeps Workshop UI grid tidy, one per archetype):

1. **FLAMER** - weapon, close-range pressure (fills the missing melee-ish niche)
2. **RAILGUN** - weapon, pierce/skill-shot niche (vs SNIPER single-target)
3. **PULSE** - ability, knockback/stun (only AoE control we lack)
4. **JETPACK** - ability, mobility (cheaper, learnable alternative to TELEPORT)
5. **CLOAK** - ability, stealth (adds targeting AI depth; DECOY deferred)

Rationale: covers 5 distinct archetypes without overlapping existing tools
(GRENADE area-damage exists; ROCKET slow-heavy exists; MINE static zone-denial
exists; SWARM deferred because drone-homing adds the most sim complexity per
damage point).

## Implementation checklist (per module)
- [ ] `MODULE_IDS` + `MODULE_DEFINITIONS` entry in `packages/ruleset/src/index.js` (group, costs, cooldown, description)
- [ ] Constants in `packages/engine/src/sim/constants.js`
- [ ] Sim logic (new `*Sim.js` file or branch in `runMatchToReplay.js`) emitting ordered events
- [ ] Bot instruction support where relevant (`FIRE_FLAMER`, `ACTIVATE_PULSE`, ...) in `BotInstructions.md` + parser
- [ ] Replay viewer rendering + Workshop loadout picker tile
- [ ] Example bots in `bots/` demonstrating each
- [ ] Determinism golden test + unit tests; bump `rulesetVersion` to `0.3.0`
- [ ] Balance harness run (`scripts/balance-report.mjs`) - tune costs like the SNIPER pass did
