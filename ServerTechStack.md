# ServerTechStack.md — Recommended Server Stack for Deterministic Bot Battles

This document recommends a pragmatic server implementation stack for the project’s needs:
- deterministic headless simulations
- safe execution of untrusted bot submissions (via our DSL/IR, not raw JS)
- daily automation + high throughput batch compute
- replay + result persistence

It complements:
- `ServerPlan.md`
- `ServerSimulationPlan.md`
- `Ruleset.md`
- `CombatPlan.md`

---

## 1) Constraints implied by the current design

- **Shared simulation engine** should run on both client and server.
  - This strongly favors a shared language/runtime for the sim library.
- **Batch CPU workload** (daily runs) is the main scaling driver.
- **Determinism** must not depend on OS clock, system RNG, floating-point quirks, or unordered iteration.
- Bot code is executed by our own VM/IR, so we don’t need a hostile-JS sandbox, but we still need:
  - hard timeouts
  - memory caps
  - per-match failure isolation

---

## 2) Recommended default stack (good v1 fit)

This is the best long-term fit, but for **early testing** (e.g., ~10 bots, ~10 matches/day) you can run a simpler configuration; see §2.8.

### 2.1 Language/runtime

**JavaScript (ES modules) + Node.js (LTS)**

Why this is the default recommendation:
- easiest path to a **shared sim engine** that also runs in the browser
- fastest iteration speed for product + gameplay tuning
- strong ecosystem for:
  - HTTP APIs
  - job queues
  - DB migrations
  - observability

Notes:
- Using **TypeScript** on the server is optional; the simulation/runtime contract should remain JavaScript-first.
- Prefer JSDoc for public APIs in shared runtime code.

### 2.2 HTTP API framework

- **Fastify** (recommended)
  - fast, low overhead, good plugin ecosystem
- Alternatives:
  - Express (simpler, more footguns)
  - NestJS (heavier, more structure)

### 2.3 Database

- **PostgreSQL** (recommended)
  - strong fit for Users/Bots/BotVersions/DailyRuns/Matches
  - supports JSON columns for evolving schemas (replays metadata)

### 2.4 ORM / migrations

- **Prisma** (recommended for speed)
- Alternatives:
  - Drizzle (lighter)
  - Knex + SQL (more manual)

### 2.5 Job queue + workers

- **Redis + BullMQ** (recommended)
  - proven pattern: API enqueues match jobs; workers consume
  - easy concurrency control
  - supports retries/backoff

Fallback v1 option if you want fewer moving parts:
- **DB-backed polling queue** (simpler infra, slower throughput)

### 2.6 Replay storage

- **Object storage** (recommended once replays grow): S3 / R2 / GCS / Azure Blob
  - store compressed replay blobs
  - store only metadata + pointer in Postgres

Small-v1 shortcut:
- store replays in Postgres **only** if payload sizes are small and you accept DB bloat.

### 2.7 Deployment packaging

- **Docker** containers
  - `api` service
  - `worker` service (can scale horizontally)
  - `postgres`
  - `redis`

### 2.8 Minimal testing setup (recommended for your current scale)

Given your expected initial scale (~10 bots, ~10 matches/day), you can start with fewer moving parts and still be aligned with the long-term architecture.

Minimal setup:
- Runtime: **Node.js + JavaScript (ESM)**
- Deployment: **single process** (API + worker in one service) on a single server / docker-compose
- DB: **PostgreSQL**
- Queue: **DB-backed queue table** (polling) instead of Redis
- Replays: store compressed replay blobs in **Postgres** (acceptable at small scale)
- Scheduler: **manual trigger** or **OS cron** calling a CLI/HTTP endpoint

Why this is a good v0:
- simplest infra (Postgres is the only stateful dependency)
- easy local dev + easy deploy
- you can later swap:
  - DB queue -> Redis/BullMQ
  - replay blobs in DB -> object storage
  - single worker -> multiple workers

---

## 3) Deterministic simulation implementation details (stack-independent)

### 3.1 RNG

- Implement a tiny deterministic RNG (e.g., xorshift / splitmix) with explicit seed.
- Never use `Math.random()`.

### 3.2 Data structures

- Avoid relying on JS object key order for determinism.
- Prefer arrays + explicit sorting.
- When you must use maps, use `Map` and iterate in insertion order only when insertion order is explicitly deterministic.

### 3.3 Pure engine boundary

Keep the simulation library:
- pure (no DB, no filesystem, no network)
- deterministic
- testable with golden replays

---

## 4) Worker isolation strategy (important)

Even with a safe DSL VM, the match runner is still untrusted input in the sense of:
- pathological scripts (huge label graphs, extreme branching)
- massive replays
- unexpected bugs

Recommended isolation options in Node:

### 4.1 Minimal v1

- Run workers as separate **processes** (Docker replicas).
- Within each worker process:
  - run matches sequentially or with low concurrency
  - enforce per-match timeout
  - hard cap tick count

### 4.2 Higher throughput

- Multi-process scaling: run many worker containers.
- Optional: use `worker_threads` for parallelism, but only if:
  - you can still enforce hard timeouts
  - memory isolation is acceptable

Guideline:
- Prefer **process-level** isolation first (simpler, safer).

---

## 5) Observability and auditability

### 5.1 Logs

- Structured JSON logs
  - include `runId`, `matchId`, `seed`, `ruleset_version`, `bot_version_ids`

### 5.2 Metrics

- Track:
  - matches/sec
  - mean tick runtime
  - replay size distribution
  - failures/timeouts

### 5.3 Tracing (optional)

- OpenTelemetry can be added later; not required for v1.

---

## 6) When to consider Go/Rust for the match runner

If you expect very large scale (e.g., tens of millions of ticks/day) or want much stricter resource control, consider:

- keep API + DB in Node (JavaScript-first; TypeScript optional)
- move **match worker** to Go or Rust
- keep a shared ruleset spec and replay schema

Tradeoff:
- you lose the simplest “shared engine” story; you’ll maintain two implementations (or wasm).

---

## 7) Recommended “v1 decision set”

If you want a concrete default to proceed:
- Runtime: **Node.js + JavaScript (ESM)** (TypeScript optional)
- API: **Fastify**
- DB: **PostgreSQL**
- Queue: **Redis + BullMQ**
- Replay storage: **Object storage** (S3/R2/etc) + Postgres pointer
- Deployment: **Docker** + horizontal worker scaling
