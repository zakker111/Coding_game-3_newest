create table if not exists users (
  id uuid primary key,
  username text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists sessions (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists bots (
  id uuid primary key,
  user_id uuid null references users(id) on delete cascade,
  owner_username text not null,
  name text not null,
  bot_id text not null unique,
  source_text text not null,
  source_hash text not null,
  latest_loadout jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_username, name)
);

create table if not exists bot_versions (
  id uuid primary key,
  bot_id uuid not null references bots(id) on delete cascade,
  source_hash text not null,
  source_text text not null,
  loadout_snapshot jsonb not null,
  save_message text null,
  created_at timestamptz not null default now(),
  unique (bot_id, source_hash)
);

create table if not exists daily_runs (
  id uuid primary key,
  run_date date not null unique,
  ruleset_version text not null,
  run_seed text not null,
  status text not null,
  created_at timestamptz not null default now()
);

create table if not exists matches (
  id uuid primary key,
  kind text not null check (kind in ('daily', 'sandbox')),
  daily_run_id uuid null references daily_runs(id) on delete set null,
  requested_by_user_id uuid null references users(id) on delete set null,
  match_seed text not null,
  tick_cap integer not null,
  status text not null check (status in ('queued', 'running', 'complete', 'failed')),
  participants_json jsonb not null,
  result_json jsonb null,
  error_json jsonb null,
  created_at timestamptz not null default now(),
  started_at timestamptz null,
  completed_at timestamptz null
);

create index if not exists matches_status_created_at_idx on matches (status, created_at);

create table if not exists replay_blobs (
  match_id uuid primary key references matches(id) on delete cascade,
  encoding text not null check (encoding in ('identity', 'gzip')),
  sha256 text not null,
  replay_bytes bytea not null,
  created_at timestamptz not null default now()
);
