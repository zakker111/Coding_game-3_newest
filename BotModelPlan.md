# BotModelPlan.md — Future-proof Bot Identity, Versions, and Reproducibility (Planning)

This document defines a **future-proof bot model** that works for:
- **v1 server**: minimal bot storage + daily headless matches
- **v1 client-only**: built-in opponent bots + local draft
- **future server**: immutable versions, matchmaking, ladders

It complements:
- `BotInstructions.md` (the DSL)
- `Ruleset.md` (simulation rules)
- `ReplayViewerPlan.md` (replay schema and viewer UX)
- `ServerPlan.md` (server entities + endpoints)
- `UIPlan.md` (workshop flow)

---

## 1) Two different “IDs”: match slots vs bot identity

### 1.1 Match slot IDs (always `BOT1..BOT4`)
- **Match slot IDs** are deterministic engine identifiers: `BOT1|BOT2|BOT3|BOT4`.
- They are used inside:
  - the DSL (e.g. `SET_TARGET BOT3`)
  - replay events (e.g. `BOT_EXEC botId=BOT2`)

These are *not* user bot identities. They only identify a participant **within a single match**.

### 1.2 Bot identity (stable across matches)
Bots need a stable identity across matches and time:
- `botId`: stable identifier for a “bot project” (lineage)
  - examples: `alice/greedy`, `community/sniper-101`, `builtin/chaser-shooter`

**v1 server rule:** `botId = "{username}/{botName}"`.

### 1.3 Bot appearance (avatars / pictures / gifs)
Avatar/appearance is **presentation-only** (it must not affect determinism or match results), but it still needs a stable home in the model.

**Plan (future-proof, v1-simple):**
- Store avatar metadata on **Bot** (identity-level), not on BotVersion.
  - Rationale: the avatar is part of the bot’s “persona” and should persist across code iterations.
  - BotVersion stays focused on reproducibility: source + hashes + pinned ruleset/DSL (+ loadout later).

**Bot (identity) fields (planning-level):**
- `displayName`
- `appearance` (aka avatar), e.g.
  - v1: `{ kind: "COLOR", color: "#RRGGBB" }`
  - future: `{ kind: "IMAGE", fallbackColor: "#RRGGBB", avatarRef: { assetId?, contentHash?, url? } }`

**Replay rule:** because replays must be viewable offline and long after assets move, each replay must include a small per-slot **appearance snapshot** in its header (at least a fallback color; optionally an immutable reference like `contentHash`). See `ReplayViewerPlan.md`.

---

## 2) v1 server reality: "latest source" + hashes (no versions yet)

To run matches, v1 server only requires:
- `botId` (derived from username + bot name)
- `sourceText` (DSL)

**v1 simplification:** server-side simulation depends only on bot code (no per-bot equipment/loadout stored server-side yet).

For server-run matches in v1, assume a fixed default loadout for all bots (see `ServerPlan.md`), so slot-based instructions still work.

On match scheduling/execution, snapshot per participant:
- `sourceText` (as `sourceText`/`source_text_snapshot`)
- `sourceHash`

Even without immutable versions, we can still keep deterministic references for later by:
- canonicalizing `sourceText`
- computing `sourceHash`
- storing `sourceHash` + a **sourceText snapshot** in match/replay artifacts

This lets you say “the match used `sourceHash=…`” even if the bot is edited later.

---

## 3) Bot versions (future: immutable snapshots)

A bot identity can have many immutable versions.

### 3.1 BotVersion (server concept; still useful on client)
Each bot version is an immutable snapshot containing:
- `botId`
- `botVersion` (monotonic integer, or semver-style string)
- `sourceText` (the DSL script)
- `sourceHash` (hash of the exact source bytes after canonicalization)
- `compiledIrHash` (hash of canonical compiled form / opcodes)
- `rulesetVersion` (pinned)
- `dslVersion` (pinned)
- `loadout` (future: 3 slots; may contain null; validated by rules)

**Reproducibility rule:** a match must reference bot versions by hash (at least `sourceHash`, ideally also `compiledIrHash`).

### 3.2 Canonicalization (important for hash stability)
Before hashing bot source:
- normalize newlines (LF)
- trim trailing whitespace
- ignore blank lines
- ignore comment lines starting with `;` (per `BotInstructions.md` preprocessing)

Then compute `sourceHash` over the canonical form.

---

## 4) Bot contract pinning (ruleset + DSL)

To avoid “bot runs differently after an update”, each bot version should pin:
- `rulesetVersion` (SemVer)
- `dslVersion` (SemVer)

Policy recommendation:
- For ranked ladders/seasons: **exact pinning** (same major+minor+patch) for fairness.
- For casual/sandbox: optional compatibility ranges can be allowed, but must be explicit.

---

## 5) Replay manifest must separate slot IDs from bot identity

A replay should always include:
- match metadata: `schemaVersion`, `rulesetVersion`, `matchSeed`, `tickCap`, `ticksPerSecond`
- per-slot participant info:
  - `slotId`: `BOT1..BOT4`
  - `displayName`
  - `appearance` (presentation snapshot; see §1.3)
  - `loadout` (optional; v1 server-run matches may omit it)
  - `sourceHash` (and optionally `compiledIrHash`)
  - `sourceText` (v1: include snapshot until immutable server versions exist)
  - **future fields:** `botId`, `botVersion` (or a server `botVersionId`)

This lets the viewer/debugger answer both:
- “What did BOT3 do on tick 87?” (slot)
- “Which published bot/version was BOT3 running?” (identity/version)

---

## 6) v1 built-in bots (client-bundled opponents)

To avoid migration pain later, built-in opponents should already have stable botIds under `builtin/*`.

In v1, these are bundled in the client under `examples/` (see `UIPlan.md`). Their source is repeated here so Workshop and replay manifests stay aligned.

### 6.1 `builtin/chaser-shooter` (display name: "Chaser Shooter")

Source: `examples/bot2.md`

```text
LABEL LOOP
IF (BOT_ALIVE(BOT1)) DO SET_TARGET BOT1
IF (!BOT_ALIVE(BOT1) && BOT_ALIVE(BOT3)) DO SET_TARGET BOT3
IF (!BOT_ALIVE(BOT1) && !BOT_ALIVE(BOT3) && BOT_ALIVE(BOT4)) DO SET_TARGET BOT4
SET_MOVE_TO_TARGET
IF (HAS_TARGET_BOT() && SLOT_READY(SLOT1)) DO USE_SLOT1 TARGET
GOTO LOOP
```

### 6.2 `builtin/corner-bunker` (display name: "Corner Bunker")

Source: `examples/bot3.md`

```text
SET_MOVE_TO_SECTOR 1 ZONE 1
LABEL LOOP
IF (HEALTH < 40 && POWERUP_EXISTS(HEALTH)) DO SET_MOVE_TO_POWERUP HEALTH
IF (AMMO < 20 && POWERUP_EXISTS(AMMO)) DO SET_MOVE_TO_POWERUP AMMO
; Note: `WAIT` is control-flow and cannot be nested under `IF (...) DO ...`.
IF ((HEALTH < 40 && POWERUP_EXISTS(HEALTH)) || (AMMO < 20 && POWERUP_EXISTS(AMMO))) GOTO COMMIT_POWERUP
IF (HEALTH >= 40 && AMMO >= 20) DO SET_MOVE_TO_SECTOR 1 ZONE 1
IF (SLOT_READY(SLOT1) && DIST_TO_CLOSEST_BOT() <= 3) DO FIRE_SLOT1 NEAREST_BOT
GOTO LOOP
LABEL COMMIT_POWERUP
WAIT 2
GOTO LOOP
```

### 6.3 `builtin/saw-rusher` (display name: "Saw Rusher")

Source: `examples/bot4.md`

```text
SET_MOVE_TO_BOT CLOSEST_BOT
LABEL LOOP
IF (BUMPED_BOT() && SLOT_READY(SLOT1) && !SLOT_ACTIVE(SLOT1)) DO SAW ON
IF (BUMPED_BOT() && SLOT_READY(SLOT1) && !SLOT_ACTIVE(SLOT1)) DO SET_TIMER T1 4
IF (TIMER_DONE(T1) && SLOT_ACTIVE(SLOT1)) DO SAW OFF
IF ((BULLET_IN_SAME_SECTOR() || BULLET_IN_ADJ_SECTOR()) && SLOT_READY(SLOT2) && !SLOT_ACTIVE(SLOT2)) DO SHIELD ON
IF ((BULLET_IN_SAME_SECTOR() || BULLET_IN_ADJ_SECTOR()) && SLOT_READY(SLOT2) && !SLOT_ACTIVE(SLOT2)) DO SET_TIMER T2 3
IF (TIMER_DONE(T2) && SLOT_ACTIVE(SLOT2) && !BULLET_IN_SAME_SECTOR() && !BULLET_IN_ADJ_SECTOR()) DO SHIELD OFF
GOTO LOOP
```

---

## 7) v1 local drafts (client)

- Your editable bot is a **draft** (mutable), but when you run a match locally, the run should snapshot:
  - the exact draft `sourceText` at run time
  - `sourceHash`
  - (optional) a local-only `loadout`
  - pinned `rulesetVersion` + `dslVersion`

This ensures local replays are stable and forward-compatible with future server replays.

---

## 8) Future server model (planning only)

Server entities (high level):
- Bot (`botId`, owner, metadata)
- BotVersion (immutable: `sourceHash`, `compiledIrHash`, pins)

Server responsibilities:
- validate submissions
- compile to canonical internal IR (deterministically)
- store bot versions immutably
- execute headless matches with pinned `{rulesetVersion, dslVersion}`

Deprecation strategy (recommended):
- old ruleset/DSL majors become **replay-only** after sunset (no new matches, but replays remain viewable).

---

## 9) Open decisions to plan next (before implementing cloud bot versions)

1) Exact hashing rules (what canonicalization steps are part of the hash contract?)
2) Do we store `compiledIr` in replays, or only `compiledIrHash`?
3) Versioning model:
   - A) **single version**: DSL changes are part of `rulesetVersion`
   - B) **two versions**: `rulesetVersion` + `dslVersion` pinned separately (what this document currently assumes)
4) When server-side loadouts return, do we:
   - store loadout on each immutable BotVersion, or
   - store loadout separately as “match config” (less common)
