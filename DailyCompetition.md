# DailyCompetition.md — Daily Server-Side Competition (Season Points + Threshold)

This document captures the current plan for **daily server-side simulations** where eligible bots are grouped into matches and earn **points**. Bots that fall below a configured **points threshold** stop being scheduled until the owner re-enables them.

It complements:
- `ServerPlan.md`
- `BotInstructions.md`
- `Todo.md`

---

## 1) Goal

Each day:
- the server snapshots the set of eligible bots,
- runs deterministic headless matches in **groups of 4**,
- awards points from match outcomes,
- updates each bot’s **season points**,
- stops scheduling bots that drop below a configured threshold,
- publishes a daily leaderboard and stores replays.

Each week:
- highlight the **top 10 bots**,
- reset and start a new season.

---

## 2) Key concepts

### 2.1 Season
A season is a fixed period (e.g., 7 days) during which points accumulate.

Recommended fields:
- `season_id`
- `starts_at`, `ends_at`
- `ruleset_version`
- `eligible_points_threshold`

### 2.2 Bot season status
Each bot needs a per-season status:
- `season_points` (integer)
- `active_for_next_run` (boolean)
- `last_active_run_date`

Interpretation:
- Bots **above threshold** can remain active automatically.
- Bots **below threshold** are not scheduled, unless the owner explicitly re-enables them.

---

## 3) Eligibility snapshot (daily run)

At the start of the daily run (e.g., midnight UTC):
- snapshot all bot entries where:
  - `active_for_next_run == true`, and
  - `season_points >= eligible_points_threshold`
- freeze:
  - `ruleset_version`
  - a `run_seed`

This prevents mid-run edits from affecting the run.

---

## 4) Match format and scheduling

### 4.1 Match format (locked)
- Daily run matches are **4-player matches** (four bots total in one arena).
- Match end conditions are defined in `Ruleset.md` (last bot alive OR `tickCap` OR `STALEMATE`).
- Spawn rule (locked): bots spawn in the **four corners** of the arena:
  - `BOT1 → SECTOR 1 ZONE 1` (top-left)
  - `BOT2 → SECTOR 3 ZONE 2` (top-right)
  - `BOT3 → SECTOR 7 ZONE 3` (bottom-left)
  - `BOT4 → SECTOR 9 ZONE 4` (bottom-right)
  - (unless you later introduce randomized assignment by seed)

> Deterministic stop rule (v1): If fewer than 4 eligible bots remain late in a daily run, **stop scheduling** and end the run (no 2–3 player matches in ranked daily runs).

### 4.2 Scheduling model (multi-round grouping)

Within a daily run, the server repeatedly:
1) deterministically shuffles the active bot list using `run_seed`
2) groups bots into batches of 4
3) runs each match and assigns points
4) updates `season_points`
5) removes bots that fall below the threshold from the remaining schedule

This continues until one of these stop conditions is met:
- fewer than 4 bots remain eligible for another match
- a configured `max_rounds_per_day` is reached

This provides the behavior you described: bots that drop below a threshold “are not included in another match” for that day (and potentially future days unless re-enabled).

---

## 5) Points and elimination threshold

### 5.1 Points
The scoring formula is not finalized. The server should compute points as a pure function:
- inputs: match placements + match stats
- output: points delta per bot

Common v1 approach (simple):
- 4-bot match placement points:
  - 1st: +X
  - 2nd: +Y
  - 3rd: +Z
  - 4th: +W

Tie handling (time-limit / stalemate):
- If a match ends with multiple bots still alive (`endReason ∈ {TICK_CAP, STALEMATE}`), the surviving bots **tie**.
- Placement points for tied bots are split **evenly** across the tied group by averaging the points for the occupied ranks.
  - Example (2 bots alive at end): if placement points are `{1st: X, 2nd: Y, 3rd: Z, 4th: W}` then each survivor gets `(X + Y) / 2`.
  - Example (3 bots alive at end): each survivor gets `(X + Y + Z) / 3`.

Optional add-ons (later):
- damage dealt bonus
- survival ticks bonus
- **kills bonus** (based on deterministic kill attribution; see `Ruleset.md`)

### 5.2 Threshold
A bot is considered "in" the competition if:
- `season_points >= eligible_points_threshold`

When a bot drops below threshold:
- it finishes the current match (obviously)
- it is **not scheduled** for additional matches
- it remains excluded until the owner re-enables it

---

## 6) Re-enabling a bot (owner intent)

You described a manual “verify intent” action to allow a bot back into daily runs.

Server-side interpretation (no UI details):
- a user can set `active_for_next_run = true` for a bot
- eligibility still requires meeting the threshold rules (or you may optionally allow a “rejoin grace” mechanic)

This should be recorded as an auditable event:
- who re-enabled
- when
- which bot `source_hash` was active at the time (v1 server stores “latest source” only)

---

## 7) Determinism requirements

For a given daily run, results must be reproducible from stored artifacts:
- `season_id`
- `run_seed`
- per-match `match_seed` derived from (`run_seed`, round index, match index)
- exact bot code snapshots (at least `source_hash`, ideally also stored `source_text` in replays)
- exact ruleset version

Note on loadouts:
- v1 server-run matches use a fixed default loadout for all bots (see `ServerPlan.md`). Client-side loadout/equipment does not affect daily competition results in v1.

---

## 8) Outputs to publish/store

Per match:
- placements
- points deltas
- replay reference

Per daily run:
- list of participating bots (botIds + source hashes; v1 may also store source_text snapshots in replays)
- updated season points table
- daily leaderboard snapshot

Per season:
- final rankings
- top 10 snapshot

---

## 9) Open decisions (updated status)

Locked from latest decisions:
- When a bot drops below threshold, it is excluded **for all future days** until re-enabled.
- Re-enable uses a **rejoin allowance** (points floor) so the bot can re-enter even if it was below threshold.
- Match size: **4 bots total**.
- Spawn positions: **four corners** of the arena (`SECTOR+ZONE` anchors):
  - `BOT1 → SECTOR 1 ZONE 1`
  - `BOT2 → SECTOR 3 ZONE 2`
  - `BOT3 → SECTOR 7 ZONE 3`
  - `BOT4 → SECTOR 9 ZONE 4`

Still open:
1) Rejoin allowance details:
   - set points to exactly `eligible_points_threshold`, or to a separate `rejoin_points_floor`?
2) How many matches should each eligible bot play per day (cap)?
   - unlimited until eliminated vs `max_matches_per_bot_per_day`.
3) Weekly reset:
   - what happens to points at reset? (set to 0 vs set to a default baseline?)

(No longer open / locked above: if fewer than 4 eligible bots remain, stop scheduling and end the run.)
