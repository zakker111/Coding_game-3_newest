# Coding Game (Nowt)

A competitive programming/bot-fighting game where you write a tiny script to control your bot in a deterministic arena.

This repo is **spec-first**, and includes a runnable prototype:

- `packages/engine`: bot DSL compiler/VM + deterministic simulation + replay generation
- `apps/web`: Vite + React workshop that runs local matches in a Web Worker and renders the replay
- `packages/replay`: legacy replay schema + sample generator (uses lightweight source heuristics like scanning for `SAW`/`SHIELD`; not authoritative engine behavior)

---

## 🎮 Quick Start: Run the Game Locally

### Prerequisites
You need to have **Node.js** and **pnpm** installed on your computer.

- **Node.js**: Download from [nodejs.org](https://nodejs.org) (get the LTS version)
- **pnpm**: Install it by running `npm install -g pnpm`

### Step 1: Clone & Setup
```bash
git clone https://github.com/zakker111/Coding_game-3_newest.git
cd Coding_game-3_newest
pnpm install
```

### Step 2: Run the Game
```bash
pnpm dev
```

### Step 3: Open in Your Browser
The terminal will print a URL (usually `http://localhost:5173`). Click it or paste it into your browser.

### Game Pages Available:
- **`/`** — Landing page
- **`/workshop`** — Play the game! Create a bot script and watch it fight (play/pause/step through the battle)
- **`/leaderboard`** — View daily rankings
- **`/admin`** — Admin controls (for testing daily runs)

---

## 🚀 Deploy to GitHub Pages

To make your game playable online with a shareable URL:

### Step 1: Build the Game
```bash
pnpm build
```
This creates files in the `apps/web/dist/` folder.

### Step 2: Copy to `docs/` Folder
1. Create a folder called `docs` in your repo root
2. Copy all files from `apps/web/dist/` into `docs/`
3. Push to GitHub:
   ```bash
   git add .
   git commit -m "Deploy game to GitHub Pages"
   git push origin main
   ```

### Step 3: Enable GitHub Pages
1. Go to your repo: https://github.com/zakker111/Coding_game-3_newest
2. Click **Settings** → **Pages** (in left sidebar)
3. Under "Build and deployment":
   - **Source**: Select `Deploy from a branch`
   - **Branch**: Select `main`
   - **Folder**: Select `/docs`
4. Click **Save**

### Step 4: Get Your URL ✅
GitHub will show your site URL in a few seconds:
```
https://zakker111.github.io/Coding_game-3_newest/
```

You can now share this link to let others test your game online!

---

## Running the prototype

Prereqs: Node.js + pnpm.

```bash
pnpm install
pnpm dev
```

Then open the printed URL (usually http://localhost:5173).

- `/` is the landing page
- `/workshop` runs a deterministic local match and lets you inspect the replay (play/pause/step/scrub)
- `/leaderboard` shows the latest daily run rankings.
- `/admin` is the minimal server sandbox for admin-only daily runs and points.

To run tests:

```bash
pnpm test          # apps/web
pnpm -C packages/engine test
```

## Running the server MVP

The server under `apps/server` includes the deterministic sandbox runner, simple auth/bot storage, and an admin-triggered daily run loop.

Start it locally:

```bash
pnpm install
pnpm dev:server
```

Or run it directly:

```bash
pnpm start:server
```

Current scope:
- `GET /api/ruleset`
- `POST /api/simulations`
- `GET /api/matches/:matchId`
- `GET /api/matches/:matchId/replay`
- `POST /api/auth/login` / `POST /api/auth/register` / `GET /api/me`
- `GET /api/bots` plus bot source save/load/version endpoints
- `POST /api/runs/daily` (admin-only)
- `GET /api/runs`, `GET /api/runs/latest`, `GET /api/runs/:runId`, `GET /api/runs/:runId/matches`

The server accepts inline participant snapshots for sandbox simulations. Daily runs use saved user/server bots, schedule every deterministic 4-bot combination for the run, store the resulting daily[...]

Default local admin:
- username: `admin`
- password: `admin`

The web landing page includes a minimal login form; when logged in as `admin`, use `/admin` to run daily games and inspect server-side matches/points.

## QA (Phase 1)

Phase 1 QA is intended to be fully reproducible in CI and locally.

Fast local release-sign-off path:

```bash
pnpm qa:release
```

This runs the canonical repo-local gate:

```bash
pnpm check:deploy
pnpm check:deploy:imports
pnpm -C packages/engine test
pnpm -C packages/replay test
pnpm -C apps/web test
pnpm build
pnpm qa:workshop -- --serve --url http://127.0.0.1:8787 --app-url http://127.0.0.1:4173
```

Install-inclusive gate runner (writes `phase1-gate.log`):

```bash
pnpm gate:phase1
```

Legacy fast path (still useful for non-browser package checks):

```bash
pnpm qa:phase1
```

`pnpm qa:workshop` requires a Playwright-capable browser runtime. If Chromium cannot start because host libraries are missing, the script now fails with an actionable message instead of a raw lau[...]
If the default local ports are already occupied, override them with `NOWT_QA_WORKSHOP_URL` and `NOWT_QA_WORKSHOP_APP_URL` when running `pnpm qa:release` / `pnpm gate:phase1`.

Note: `site/` is a legacy prototype and is intentionally excluded from the pnpm workspace + CI.

## Deploying (static)

Before cutting a release or publishing static artifacts:

1. Update the authoritative source files, not their deploy copies:
   - `BotInstructions.md`
   - `examples/*.md`
   - `packages/replay/src/*`
   - `packages/engine/src/**/*.js`
2. Run `pnpm sync:deploy`.
3. Run `pnpm qa:release` (or `pnpm gate:phase1` if you want the install-inclusive wrapper and log file).

For Workshop-affecting changes, the release gate expects a browser-capable environment because it includes:
- deploy drift/import checks
- package tests
- app build
- deploy vs app Workshop parity smoke (`pnpm qa:workshop -- --serve --url http://127.0.0.1:8787 --app-url http://127.0.0.1:4173`)

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
  - Rendering/playback **must** be smooth while playing: interpolate bot/projectile positions within each tick (viewer-only; does not affect gameplay). When paused/scrubbing/stepping, render the [...]
- Each bot executes **exactly 1 instruction per tick** in a small DSL (with beginner-friendly aliases like `TARGET_CLOSEST`, `MOVE_TO_ZONE`, `IN_ZONE`, etc.; these are intended to normalize to a [...]
- Arena is a **3×3 grid of sectors** (1–9). Each sector has **4 zones** (2×2). Bots have continuous world positions (`pos = {x,y}` in a 192×192 arena) and a **16×16 hitbox** (centered at `p[...]
  - Bots do **not** move anchor-to-anchor or snap to sector/zone centers; only powerups use anchor locations for compact encoding.
- Module/loadout note (rulesetVersion `0.2.0` in `packages/engine`): bots have an explicit 3-slot `loadout` in the match input (`[slot1, slot2, slot3]`). If omitted, it defaults to all-empty (`[n[...]
- Current module catalog includes `BULLET`, `SAW`, `SHIELD`, `ARMOR`, `GRENADE`, `MINE`, `REPAIR_DRONE`, `SNIPER`, `ROCKET`, and `TELEPORT`.
- Powerups (`HEALTH|AMMO|ENERGY`) spawn at deterministic anchors (seeded RNG) every **10–20 ticks** and are picked up when a bot's AABB overlaps the anchor point.
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
