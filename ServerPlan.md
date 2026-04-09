# ServerPlan.md — Server-Side Architecture (Headless Daily Bot Battles)

This document describes the **server-side responsibilities, data flow, and interfaces** for running daily headless simulations of the bot battle game.

It is intentionally **implementation-agnostic** (no required framework/DB yet). It assumes the gameplay rules captured in:
- `Todo.md`
- `ArenaPlan.md`
- `Ruleset.md`
- `BotInstructions.md`
- `CombatPlan.md`
- `ServerSimulationPlan.md`

Implementation guidance (recommended stack):
- `ServerTechStack.md`

---

## 1) Server goals (what the server must guarantee)

- **Authoritative, deterministic match execution**
  - Same match seed + same bot code snapshot + same ruleset => same outcome.
- **Safety**
  - Bot submissions must not crash the server.
  - Bot programs are treated as untrusted input.
- **Daily automation**
  - The server runs scheduled matches daily and publishes results.
- **Auditability**
  - Store replays/logs so outcomes are explainable.

---

## 2) What the server stores

### 2.1 v1 storage scope (practical)

For v1, the server should store only what’s needed to:
- persist user bots, and
- run daily headless matches deterministically.

**v1 server contract (explicit):** server-side simulation depends on:
- `owner_username`
- `bot_name`
- `source_text` (Bot Instruction DSL)
- `loadout` (explicit 3-slot match input)

For any server-run match in v1, use the same loadout contract as the shipped local engine:
- per-bot `loadout` is provided as match input
- if omitted, default is all-empty: `[null, null, null]`
- invalid loadouts are deterministically normalized
- normalization issues are surfaced as `loadoutIssues`

Data ownership split (important for future inventory work):
- `@coding-game/ruleset` owns the global module catalog and normalization logic
- server inventory state owns what modules a user has unlocked/owns
- match/replay snapshots store only the resolved equipped `loadout_snapshot`

The Workshop may still embed the chosen loadout as locked source headers (`;@slot1`, `;@slot2`, `;@slot3`) for UI/editing, but server simulation should use the stored match config `loadout` rather than source scanning.

**v1 product constraint (to keep UI and storage simple):** each user has **at most 3 bots**.

Reproducibility rule (still required):
- treat each bot as mutable “latest source”, but **snapshot bot code into each Match/Replay** so results are reproducible even if bots are edited later.

### 2.2 Core entities (minimum)

- **User**
  - `id`, `username`, `password_hash`, `created_at`

- **Bot** (mutable “latest” source, v1)
  - identity:
    - `id` (internal PK), `user_id`, `created_at`, `updated_at`
    - `owner_username` (or join via `user_id`)
    - `name` (bot name; unique per owner)
    - `bot_id` (stable identity, used in matches/replays)
      - v1 rule: `botId = "{owner_username}/{name}"` (see `BotModelPlan.md`)
  - code:
    - `source_text` (Bot Instruction DSL)
    - `source_hash` (computed from canonicalized `source_text`)

Notes:
- v1 server should store the authoritative `loadout` alongside bot snapshots or match-participant snapshots used for simulation.
- (Optional, post-v1) store presentation metadata like `display_name` / `appearance`.

- **BotVersion** (immutable snapshots; supports Workshop “load older saved code”)
  - `id` (internal PK)
  - `bot_id` (FK to Bot)
  - `created_at`
  - `source_text` (canonicalized Bot Instruction DSL)
  - `source_hash`
  - `save_message` (optional)

v1+ behavior (minimal and consistent with `BotModelPlan.md`):
- `Bot.source_text` remains the mutable “latest saved” source.
- On each successful bot save (`PUT /api/bots/:owner/:name`), insert a `BotVersion` row (dedupe by `source_hash`).
- Matches/replays still snapshot `source_text` for reproducibility; `BotVersion` is primarily for UI convenience until the full immutable-version model lands.

### 2.3 v1 starter bots (3 bots per user)

To match the Workshop UX (top selector with 3 bots), the server should ensure each user has **exactly 3 bots** available.

Recommendation:
- On user creation (or first Workshop visit), if the user has fewer than 3 bots, auto-create bots until they have 3.
- Default bot names can be simple and stable (example): `bot1`, `bot2`, `bot3`.
- Initial `source_text` for newly created bots should be the same starter template used by the Workshop: `examples/bot0.md` ("Aggressive Skirmisher").

This keeps v1 simple: there is always something to select/edit, and the server storage model stays minimal.

### 2.4 Daily runs + matches

- **DailyRun**
  - `id`, `run_date` (e.g. YYYY-MM-DD), `created_at`
  - `ruleset_version`
  - `run_seed` (seed for selecting matchups/spawns)
  - `status` (planned/running/complete/failed)

- **Match**
  - `id`, `created_at`
  - `kind`: `daily | sandbox`
  - `daily_run_id` (nullable; set only when `kind = daily`)
  - `requested_by_user_id` (nullable; set only when `kind = sandbox`)
  - `match_seed` (deterministic per match)
  - `status` (`queued|running|complete|failed`)
  - `participants`: list of:
    - `slot`: `BOT1|BOT2|BOT3|BOT4`
    - `botId`: `{owner_username}/{name}`
    - `source_hash` (computed from canonicalized source at match time)
    - `source_text_snapshot` (required for v1 replayability)
    - `loadout_snapshot` (resolved 3-slot loadout used for the match)
  - `result` (winner, placements, scores, etc.)
  - `replay_ref` (pointer to stored replay)
  - `error_metadata` (only if failed)

### 2.5 Replay storage

Replay payloads should follow the schema in `ReplayViewerPlan.md`.

A replay should minimally include:
- `ruleset_version`
- `match_seed`
- header `bots[]` entries for each slot `BOT1..BOT4`, including at least:
  - `displayName` (can default to the bot’s name)
  - `appearance` (v1: a simple color token is fine)
  - `source_hash`
  - `source_text` (v1: include the snapshot to avoid needing immutable server versions)
  - `loadout` (resolved 3-slot loadout used for the match)
  - `loadoutIssues` (optional informational warnings if normalization occurred)
- per-tick events + instruction trace

---

## 3) Server API surface (logical endpoints)

### 3.1 Auth

- `POST /api/auth/register` (username + password)
- `POST /api/auth/login` (username + password)
- `POST /api/auth/logout` (optional)
- `GET /api/me`

### 3.1.1 Ruleset metadata

- `GET /api/ruleset`
  - recommended response shape:
    - `rulesetVersion`
    - `loadoutSlotCount`
    - `modules[]` (serialized from `@coding-game/ruleset`)

### 3.2 Bots (v1: mutable bots + optional version history)

#### List bots (including built-ins)

- `GET /api/bots`
  - returns bots visible to the caller (at minimum: their own + `builtin/*`)
  - query params (optional):
    - `owner=builtin|<username>`
    - `q=<substring>`
  - response item fields (recommended):
    - `botId`, `owner_username`, `name`, `updated_at`, `source_hash` (computed on write)

#### Fetch bot metadata

- `GET /api/bots/:owner/:name`
  - response includes: `botId`, `owner_username`, `name`, `updated_at`, `source_hash`

#### Fetch bot code

- `GET /api/bots/:owner/:name/source`
  - response: `{ botId, source_text }`

#### Create/update bot code (Save)

- `PUT /api/bots/:owner/:name`
  - auth: owner must equal the logged-in username (except `builtin/*` which is server-managed)
  - body: `{ source_text, save_message?: string }`
  - server:
    - validates and canonicalizes `source_text`
    - computes and stores `source_hash`
    - updates `Bot.source_text` (mutable latest)
    - inserts a `BotVersion` row (dedupe by `source_hash`)
  - response (recommended):
    - `{ botId, updated_at, source_hash }`

#### List bot versions (Load older saved code)

- `GET /api/bots/:owner/:name/versions`
  - response:
    - `{ botId, versions: [{ source_hash, created_at, save_message? }] }`

- `GET /api/bots/:owner/:name/versions/:sourceHash/source`
  - response: `{ botId, source_hash, source_text }`

(If you prefer `POST /api/bots` with a body `{ name, source_text }`, that’s fine too; the key is that v1 remains “latest source” for matches, with optional version history for UX.)

### 3.3 Runs + results

- `GET /api/runs` (daily runs list)
- `GET /api/runs/:runId`
- `GET /api/runs/:runId/matches`

- `GET /api/matches`
  - list match summaries visible to the current user (or public matches, depending on auth policy)
  - includes both:
    - `kind = daily` (from DailyRun), and
    - `kind = sandbox` (one-off Workshop simulations)
  - supports optional filters:
    - `runId=<runId>` (equivalent to `/api/runs/:runId/matches`)
    - `botId=<botId>` (stable server bot id, e.g. `alice/bot1`)
    - `owner=<username>&botName=<name>` (human-friendly identifier)
    - `kind=daily|sandbox`
  - pagination (recommended): `limit`, `cursor`

- `GET /api/matches/:matchId`
- `GET /api/matches/:matchId/replay`

### 3.4 One-off simulations (Workshop “Run on Server”)

- `POST /api/simulations`
  - Phase 8A implementation: no auth yet; accepts inline participant snapshots and executes immediately in-process
  - later phases: may require auth/session + rate limiting + saved bot lookup
  - body (Phase 8A):

    ```json
    {
      "tickCap": 600,
      "seed": 123,
      "participants": [
        {"slot": "BOT1", "displayName": "Alpha", "sourceText": "WAIT 1\n", "loadout": ["BULLET", null, null]},
        {"slot": "BOT2", "displayName": "Beta", "sourceText": "WAIT 1\n", "loadout": [null, null, null]},
        {"slot": "BOT3", "displayName": "Gamma", "sourceText": "WAIT 1\n", "loadout": [null, null, null]},
        {"slot": "BOT4", "displayName": "Delta", "sourceText": "WAIT 1\n", "loadout": [null, null, null]}
      ]
    }
    ```

    Notes:
    - Phase 8A uses inline source snapshots intentionally so the deterministic runner can be proven before auth/bot persistence exists.
    - Each participant snapshot should be stored with `source_text_snapshot`, `source_hash`, `loadout_snapshot`, and `loadoutIssues`.
    - Later phases may accept saved `botId` references in addition to or instead of inline source snapshots.

  - response (Phase 8A current behavior):

    ```json
    {
      "matchId": "m_123",
      "kind": "sandbox",
      "status": "complete",
      "replayUrl": "/api/matches/m_123/replay"
    }
    ```

- Replay retrieval reuses the standard match endpoint:
  - `GET /api/matches/:matchId/replay` (available once `status=complete`)

---

## 4) Submission validation pipeline (must not execute code)

Bot submissions are data. The server should never `eval` them.

In v1, `source_text` is the **Bot Instruction DSL** defined in `BotInstructions.md` (parsed/compiled to deterministic IR; no general-purpose code execution).

Validation/canonicalization (v1):
- Normalize line endings.
- Enforce size limits (max lines, max chars per line).
- Validate each instruction against the allowed set (from `BotInstructions.md`).
- Validate label rules:
  - `LABEL name` unique
  - `GOTO name` / `IF ... GOTO name` must reference an existing label

(v1) Loadout validation is required server-side and should match the local engine contract. Validate and normalize:
- 3 slots (`SLOT1..SLOT3`); slots may be empty
- unknown modules normalize to `null` and emit `UNKNOWN_MODULE`
- no duplicate modules among equipped slots
- at most one weapon module equipped (`BULLET` or `SAW`)
- surface normalization as non-blocking `loadoutIssues`)

Compile to internal representation:
- compile instructions into a small deterministic opcode form
- resolve labels to numeric instruction indices

Runtime error policy (locked):
- invalid/malformed instruction at execution time => treat as `NOP`
- bot `pc` resets to `1` next tick

---

## 5) Headless match runner (daily simulation)

### 5.1 Determinism contract

For each match:
- use `match_seed`
- use a single seeded RNG stream
- update bots in stable order `BOT1..BOT4`
- each bot executes exactly one instruction per tick at its current `pc` (per `BotInstructions.md`)
- follow the tick loop defined in `ServerSimulationPlan.md`

### 5.2 Powerup spawning (random, but replayable)

Powerups spawn randomly, but must be deterministic:
- all randomness derives from the match RNG
- spawn locations are fixed deterministic anchors (see `ArenaPlan.md`):
  - `SECTOR 1..9` (sector centers)
  - `SECTOR 1..9 ZONE 1..4` (zone centers)
- spawning is driven by a **single global spawn timer** (see `Ruleset.md`) so the overall spawn rate is controllable

Ruleset timing (locked):
- `ticksPerSecond = 1` (so `1 tick = 1 second`)
- powerup spawn interval is sampled uniformly from **[10, 20] ticks** (so **10–20 seconds**)
  - `powerupSpawnIntervalMinTicks = 10`
  - `powerupSpawnIntervalMaxTicks = 20`

Still to define (other ruleset parameters):
- optional max active powerups
- per-type distribution (weights)
- fixed per-type pickup deltas

### 5.3 Match scheduling for the daily run

A daily run should:
- snapshot the list of participating bots (botIds)
- snapshot each participant’s `source_text` (and record `source_hash`) so the run is reproducible even if bots are edited mid-day
- generate matchups deterministically from `run_seed`
- execute all matches
- store results and replays

---

## 6) Operational concerns (non-functional requirements)

- Rate limit login and submissions.
- Cap bot submission size.
- Structured logs per daily run and per match.

Versioning / reproducibility requirement (still important in v1):
- every replay/result references `ruleset_version` and each bot `source_hash`
- replays should embed `source_text` snapshots until immutable server-side versions exist

---

## 7) Open server-side decisions (to confirm later)

- Scheduling (cron vs internal scheduler)
- Replay storage (DB vs object store)
- Auth (session cookies vs JWT)
- Expected scale (users/bots/matches/day)

Future upgrade path (explicitly supported by this v1 plan):
- Add immutable `BotVersion` records later (keyed by `source_hash` or an integer version) and keep v1 endpoints working by treating "latest" as a convenience alias.
