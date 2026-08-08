create table if not exists public.app_state (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.sync_locks (
  name text primary key,
  owner text not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);
