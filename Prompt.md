# Prompt.md — AI Coding Guidelines and Project Prompt

This document is a **persistent prompt** for AI-assisted development on this project.
Any time the AI edits code here, it must follow these rules.

The project goal (current): **a game where players write code bots that fight other bots**, with a focus on **deterministic simulation**, **fairness**, and **safe execution of untrusted code**.

---

## Table of Contents

- [1. Project North Star](#1-project-north-star)
- [2. High-Level Engineering Principles](#2-high-level-engineering-principles)
- [3. Repository Layout & Module Boundaries](#3-repository-layout--module-boundaries)
- [4. Determinism, RNG, and Replays](#4-determinism-rng-and-replays)
- [5. Bot API Contract](#5-bot-api-contract)
- [6. Sandboxing & Security (Untrusted Code)](#6-sandboxing--security-untrusted-code)
- [7. Data-First Design](#7-data-first-design)
- [8. Coding Style & Readability](#8-coding-style--readability)
- [9. Testing & Verification](#9-testing--verification)
- [10. Performance in Hot Paths](#10-performance-in-hot-paths)
- [11. Versioning, Bugs, and Housekeeping](#11-versioning-bugs-and-housekeeping)

---

## 1. Project North Star

The game should make these properties true:

- **Fair**: bots compete under the same constraints.
- **Deterministic**: a match can be reproduced from a seed + inputs.
- **Safe**: untrusted bot code cannot access filesystem/network or crash the host.
- **Observable**: we can inspect matches via logs/replays/debug tools.
- **Moddable**: arena presets, items, and rules should be data-driven when practical.

Non-goals (until explicitly requested):

- Real-money economy, anti-cheat beyond sandboxing, or global multiplayer at scale.

---

## 2. High-Level Engineering Principles

- **Match the project’s style and architecture.**
  - Follow existing module layout, naming, and directory structure.
  - Extend established patterns instead of inventing new ones.

- **Prefer modular, composable code.**
  - Keep modules focused; avoid “god modules”.
  - Extract helpers when logic is reused in 2+ places.
  - **Keep files small**: refactor large files by splitting into smaller modules when it improves clarity.
  - Keep the directory structure orderly: group by domain (Simulation, Bot API, Sandbox, Data, UI, Server) and name files by responsibility.

- **Be explicit, deterministic, and data-driven.**
  - Never use `Math.random()` in simulation/gameplay; always use a seeded RNG.
  - Avoid fallbacks by default.
    - In simulation, compilation, and rules enforcement: **do not silently fall back** (fail loudly in dev; surface errors clearly in UI/tests).
    - If a fallback is truly required for UX (example: avatar image fails to load → use fallback color), it must be:
      - explicitly specified in the relevant plan/spec
      - deterministic
      - observable (logged or visible in the inspector)

- **Security is a first-class feature.**
  - Treat all bot code as untrusted.
  - All bot execution must go through a sandbox + resource limits.

- **Document the “why”, not just the “what”.**
  - In PRs/changes: explain tradeoffs and how to test.

- **Subagents are allowed but capped.**
  - Use at most **3 subagents** concurrently.
  - Prefer direct, targeted file/tool usage when possible.

- **Specs/docs should stay beginner-friendly while keeping a stable core.**
  - Prefer a small set of canonical primitives, then layer convenience aliases (“sugar”) on top.
  - When adding sugar (new convenience instructions/predicates), explicitly label it as an alias and point at the canonical form.
  - Keep naming consistent across docs: if an instruction/predicate is introduced or renamed, do a quick pass to update references and examples in other spec files.

---

## 3. Repository Layout & Module Boundaries

**Implementation language (v1): JavaScript (ES modules).**

- The game runtime (simulation, deploy artifacts) is implemented in **JavaScript (ESM)**.
- Some packages may use **TypeScript** for UI ergonomics or ship `.d.ts` typing surfaces, but the runtime contract is JavaScript.
- Use **JSDoc** (`/** ... */`) for exported/public APIs and non-obvious logic; include examples where helpful.
- On the client, run the simulation in a **Web Worker** (UI communicates via structured-clone messages).

The repo is currently minimal. As code is introduced, keep a clean separation by **domain**:

- **Simulation**
  - Tick loop, state transitions, RNG wiring, collision/damage rules.
- **Bot API**
  - Bot API types, loaders, examples, validation.
- **Sandbox**
  - Isolation boundary, CPU/memory limits, timeouts.
- **Data**
  - Arena presets, item definitions, rule knobs, balance numbers.
- **UI**
  - Renderer, debug overlays, replay viewer.
- **Server**
  - Match orchestration for tournaments/ladders, persistence.

Rule of thumb:

- If it’s **game rules / simulation** → keep it in the simulation domain.
- If it’s **untrusted code execution** → keep it in the sandbox domain.
- If it’s **user-facing rendering** → keep it in the UI domain.
- If it’s **content knobs** → keep it in data.

### 3.1 Adding New Files / Folders

- Add new modules only when they reduce coupling or clarify ownership.
- Avoid adding new top-level directories unless the domain will contain multiple modules.
- Prefer consistent naming; follow established conventions in the surrounding codebase.

---

## 4. Determinism, RNG, and Replays

Determinism is a core requirement.

- **One seeded RNG per match**, stored in match context/state.
- All randomness must be sourced from that RNG (**no `Math.random()`**).
- No time-based behavior in simulation (no wall clock: `Date.now`, timers) except as external orchestration.
- Avoid floating point drift in gameplay/simulation math:
  - prefer **integers** (ticks, grid coords, resource values)
  - if fractions are needed, use a **fixed-point** representation

### 4.1 Replay invariants

A replay must be able to reproduce the outcome from:

- Match seed
- Initial arena preset + initial entity spawns
- Bot code versions or bot source hashes
- Per-tick bot actions (or per-tick bot inputs if lockstep)

If replay reproducibility breaks, treat it as a **severity-1 bug**.

---

## 5. Bot API Contract

Bots should be treated like pure decision functions:

- The simulation provides an **observation** (what the bot can sense).
- The bot returns an **action** (what it wants to do).
- The bot can have **private memory** but only through explicitly supported mechanisms.

### 5.1 Bot language (v1)

In v1, bots are authored in the **Bot Instruction DSL** defined in `BotInstructions.md`.

- A bot submission is `source_text` containing DSL instructions (not JavaScript/Python).
- At runtime, each bot executes **exactly one** compiled instruction per tick at its current `pc`.
- If we later support higher-level languages (JS/Lua/etc.), they must either:
  - compile down to the same deterministic instruction/IR model, or
  - run in a sandboxed runtime that preserves the same “one deterministic decision per tick” contract.

Bot API rules (applies to any current/future bot authoring language):

- Observations should be **explicit and bounded** (no leaking hidden opponent state).
- Actions should be **validated** before applying them to the simulation.
- Invalid actions should be handled consistently (and must not crash the match).

---

## 6. Sandboxing & Security (Untrusted Code)

Bot code is untrusted.

Minimum requirements before running user-provided bots:

- **Isolation**:
  - v1: execute bots via the **Bot Instruction DSL VM** and run matches in an isolated worker/process for timeouts + crash containment.
  - if we later add general-purpose languages (JS/Lua/etc.), use an explicit language sandbox/runtime boundary.
- **Resource limits**:
  - CPU budget per tick (hard timeout)
  - Memory ceiling
  - Maximum message size (observation/action payload caps)
- **No ambient authority**:
  - no filesystem, no network, no process access
  - no access to engine objects outside the defined API

Security rules:

- Never `eval` bot code in the main simulation thread.
  - In v1 this is achieved by not running a general-purpose language at all: bot submissions are parsed and executed as the Bot Instruction DSL (`BotInstructions.md`).
- Never pass engine objects by reference into bot code.
- Prefer structured cloning / serialization boundaries.

---

## 7. Data-First Design

Use data files to define content and balance knobs:

- Arena presets (size, walls, spawn points)
- Weapon/projectile stats
- Item drops
- Match rules (time limit, scoring)

Code implements mechanics; data defines *what exists* and *with what numbers*.

---

## 8. Coding Style & Readability

- Prefer clear names and simple control flow.
- Keep functions small; extract helpers for complex logic.
- Use early returns over deep nesting.
- **Keep files manageable**: prefer modules under ~**600 lines**; split large files by responsibility.
- When splitting code:
  - prefer creating new files over adding more nested conditionals in a single file
  - keep exports narrow and intentional (small public surface area)
  - keep related helpers colocated with the code they support
- Maintain good coding practices:
  - keep side effects explicit and localized (especially in simulation)
  - avoid “quick hacks” that undermine determinism/security/readability
  - prefer precise types over `any` (use `unknown` + narrowing when needed)

### 8.1 Commenting guidelines

- Use comments to explain *why*: invariants, determinism constraints, and security tradeoffs.
- Document tricky math, rounding, tie-breakers, and order-dependent logic.
- Avoid redundant comments that restate the code.
- Keep comments accurate: update them when behavior changes; delete stale comments.

### 8.2 Clarity checklist

- Prefer clear, maintainable code over cleverness; small, well-named functions/modules.
- Add comments for *why*, invariants, and tricky edge cases; avoid redundant comments that restate code.
- Use JSDoc (`/** ... */`) for exported/public APIs and non-obvious logic; include examples where helpful.
- Track larger TODOs in `Todo.md` rather than leaving many inline TODO comments.

---

## 9. Testing & Verification

For any change that affects simulation correctness:

- Add tests that enforce determinism:
  - Same seed + same bot inputs → same outcome.
- Prefer “golden replay” tests:
  - Store a known seed + bot sources + expected winner / final score.
- Don’t claim something is fixed without describing the test path.

---

## 10. Performance in Hot Paths

The simulation tick loop is a hot path.

- Avoid heavy per-tick allocations in inner loops.
- Keep complexity roughly O(n) in entities per tick.
- Make debug features cheap when disabled.

---

## 11. Versioning, Bugs, and Housekeeping

- Update `Versions.md` for user-visible features and meaningful bug fixes.
- Track unfixed, reproducible issues in `Bugs.md` with repro steps.

---

## Working Agreement for AI Changes

When the AI edits this repository:

- It must **search and cite** relevant code locations (file path + identifier) before making non-trivial changes.
- It must keep patches small and reviewable.
- It must list:
  - files changed
  - what changed
  - why
  - how to test
