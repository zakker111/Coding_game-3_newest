# Coding Game (Nowt)

A competitive programming/bot-fighting game where you write a tiny script to control your bot in a deterministic arena.

This repo is **spec-first**, and includes a runnable prototype:

- `packages/engine`: bot DSL compiler/VM + deterministic simulation + replay generation
- `apps/web`: Vite + React workshop that runs local matches in a Web Worker and renders the replay
- `packages/replay`: legacy replay schema + sample generator (uses lightweight source heuristics like scanning for `SAW`/`SHIELD`; not authoritative engine behavior)

## Running the prototype

Prereqs: Node.js + pnpm.

```bash
pnpm install
pnpm dev
```

Then open the printed URL (usually http://localhost:5173).

- `/` is the landing page
- `/workshop` runs a deterministic local match and lets you inspect the replay (play/pause/step/scrub)

To run tests:

```bash
pnpm test          # apps/web
pnpm -C packages/engine test
```

## QA (Phase 1)

Phase 1 QA is intended to be fully reproducible in CI and locally.

Fast path:

```bash
pnpm qa:phase1
```

Full sequence (same steps as CI should run):

```bash
pnpm install --no-frozen-lockfile
pnpm check:deploy
pnpm check:deploy:imports
pnpm -C packages/engine test
pnpm -C packages/replay test
pnpm -C apps/web test
pnpm qa:phase1
```

Or run the one-shot gate runner (writes `phase1-gate.log`):

```bash
pnpm gate:phase1
```

Additional recommended checks (deploy/workshop):

```bash
pnpm sync:deploy           # maintainers run this after changing authoritative deploy-fed sources
pnpm check:deploy          # ensure deploy-time copies match repo sources
pnpm check:deploy:imports  # ensure deploy JS relative imports resolve to files
pnpm qa:workshop -- --serve --url http://127.0.0.1:8787
pnpm qa:workshop -- --serve --url http://127.0.0.1:8787 --app-url http://127.0.0.1:4173
```

Note: `site/` is a legacy prototype and is intentionally excluded from the pnpm workspace + CI.

## Deploying (static)

Before cutting a release or publishing static artifacts:

1. Update the authoritative source files, not their deploy copies:
   - `BotInstructions.md`
   - `examples/*.md`
   - `packages/replay/src/*`
   - `packages/engine/src/**/*.js`
2. Run `pnpm sync:deploy`.
3. Run `pnpm check:deploy && pnpm check:deploy:imports`.
4. Build with `pnpm build`.
5. For Workshop-affecting changes, run the deploy smoke:
   - deploy-only: `pnpm qa:workshop -- --serve --url http://127.0.0.1:8787`
   - deploy vs app parity baseline: `pnpm qa:workshop -- --serve --url http://127.0.0.1:8787 --app-url http://127.0.0.1:4173`

Who runs this:
- the engineer preparing the release or merging a change that touches deploy-fed authoritative sources
- reviewers should expect `deploy/` drift to be resolved in the same change, not deferred

`pnpm sync:deploy` is intended to be deterministic:
- mirrored files are traversed in sorted path order
- generated example bots are emitted in numeric bot order
- stale mirrored files under the managed deploy trees are removed on sync

Build the client-only app:

```bash
pnpm build
```

Then deploy the generated static files from:

- `apps/web/dist`

Notes:
- `apps/web/public/404.html` + the script in `apps/web/index.html` provide SPA deep-link support on hosts like GitHub Pages.
- `apps/web/public/_redirects` provides SPA rewrites on Netlify/Cloudflare Pages.

## What the game is (v1)

- **4 bots per match** (`BOT1..BOT4`)
- **Deterministic tick simulation**: `ticksPerSecond = 1` (so **1 tick = 1 simulated second**)
  - Rendering/playback **must** be smooth while playing: interpolate bot/projectile positions within each tick (viewer-only; does not affect gameplay). When paused/scrubbing/stepping, render the exact tick snapshot (no intra-tick interpolation).
- Each bot executes **exactly 1 instruction per tick** in a small DSL (with beginner-friendly aliases like `TARGET_CLOSEST`, `MOVE_TO_ZONE`, `IN_ZONE`, etc.; these are intended to normalize to a small canonical core at parse/compile time and do not affect determinism)
- Arena is a **3×3 grid of sectors** (1–9). Each sector has **4 zones** (2×2). Bots have continuous world positions (`pos = {x,y}` in a 192×192 arena) and a **16×16 hitbox** (centered at `pos`); sector/zone are UI/rules regions derived from `pos`.
  - Bots do **not** move anchor-to-anchor or snap to sector/zone centers; only powerups use anchor locations for compact encoding.
- Module/loadout note (rulesetVersion `0.2.0` in `packages/engine`): bots have an explicit 3-slot `loadout` in the match input (`[slot1, slot2, slot3]`). If omitted, it defaults to all-empty (`[null, null, null]`) and is deterministically normalized (see `Ruleset.md` §1.1.1).
- Powerups (`HEALTH|AMMO|ENERGY`) spawn at deterministic anchors (seeded RNG) every **10–20 ticks** and are picked up when a bot’s AABB overlaps the anchor point.
- Matches end by rules: last bot alive, or `tickCap`, or `STALEMATE` (no bot-vs-bot damage for a configured window) — see `Ruleset.md`.
- Matches are fully replayable from `(rulesetVersion, matchSeed, bot source snapshots, loadouts)`.

## Where to look (recommended reading order)

1. `Ruleset.md` — core gameplay rules for `rulesetVersion = 0.2.0` (stats, speed model, damage/kill credit, powerups)
2. `BotInstructions.md` — the bot language
3. `ArenaPlan.md` — arena topology + sectors/zones + movement model
4. `UIPlan.md` + `ArenaVisualPlan.md` — client workshop UX and exact arena rendering spec
5. `ReplayViewerPlan.md` — replay schema + viewer UX
6. `BotModelPlan.md` — bot identity/version planning (built-ins → user-submitted bots)
7. `ServerSimulationPlan.md` / `ServerPlan.md` — deterministic server runner + storage/API

Supporting docs:

- `examples/bot0.md` — bot0 starter (Workshop starter template): Aggressive Skirmisher
- `examples/bot1.md` — bot1: Zone Patrol Shooter
- `examples/bot2.md` — bot2: Chaser Shooter
- `examples/bot3.md` — bot3: Corner Bunker
- `examples/bot4.md` — bot4: Saw Rusher
- `examples/bot5.md` — bot5: Burst Hunter
- `examples/bot6.md` — bot6: Energy Saw Skirmisher
- `CombatPlan.md` — weapons/projectiles planning
- `FutureProofing.md` / `BotLanguageDesign.md` — extensibility direction (modules, targeting, future DSL)
- `DailyCompetition.md` — daily/season competition format
- `ServerTechStack.md` — recommended backend stack
- `Todo.md`, `Bugs.md`, `Versions.md` — tracking and versioning
