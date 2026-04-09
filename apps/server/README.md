# `apps/server`

Fastify + Postgres server runner for the first server-backed deterministic match slice.

## What it does

- username/password auth with cookie-backed sessions
- built-in bot seeding from `examples/*.md`
- user bot storage with canonicalized `source_text`, `source_hash`, explicit `loadout`, and saved versions
- queued sandbox matches via `POST /api/simulations`
- queued manual daily runs via `POST /api/runs`
- replay storage and retrieval from Postgres

The server reuses the authoritative engine/ruleset packages:

- `@coding-game/engine`
- `@coding-game/ruleset`

It does not re-implement simulation rules.

## Environment

Required:

- `DATABASE_URL`

Recommended for non-dev use:

- `COOKIE_SECRET`

Optional:

- `HOST` (default `127.0.0.1`)
- `PORT` (default `3001`)
- `SESSION_TTL_HOURS` (default `336`)
- `QUEUE_POLL_MS` (default `1000`)
- `DEFAULT_MATCH_TICK_CAP` (default `600`)
- `RUN_MATCH_WORKER` (`true` by default)
- `LOG_LEVEL` (default `info`)

## Local startup

Install workspace deps from the repo root:

```bash
pnpm install
```

Apply migrations:

```bash
DATABASE_URL=postgres://localhost:5432/nowt pnpm server:migrate
```

Seed built-ins:

```bash
DATABASE_URL=postgres://localhost:5432/nowt pnpm server:seed:builtins
```

Run the server:

```bash
DATABASE_URL=postgres://localhost:5432/nowt COOKIE_SECRET=dev-secret pnpm server:dev
```

Run the server test suite:

```bash
pnpm server:test
```
