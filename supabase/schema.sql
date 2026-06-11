-- Chemical Papers — per-user data schema for Supabase.
-- Run this once in the Supabase SQL Editor (Project → SQL Editor → New query).
-- Tables are user-scoped via RLS (each user only sees/edits their own rows).

-- Saved papers/patents (the 저장됨 library, synced per user).
create table if not exists public.saved_items (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  item_key     text not null,                         -- stable key: doi||id (paper) / publication_number||id (patent)
  kind         text not null check (kind in ('paper', 'patent')),
  title        text not null,
  custom_title text,
  memo         text,
  tags         text[] not null default '{}',
  data         jsonb not null,                        -- snapshot of the Paper/Patent so it renders without re-search
  compound_name text,
  saved_at     timestamptz not null default now(),
  unique (user_id, item_key)
);

alter table public.saved_items enable row level security;

create policy "saved_items_select_own" on public.saved_items
  for select using (auth.uid() = user_id);
create policy "saved_items_insert_own" on public.saved_items
  for insert with check (auth.uid() = user_id);
create policy "saved_items_update_own" on public.saved_items
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "saved_items_delete_own" on public.saved_items
  for delete using (auth.uid() = user_id);

-- Recent searches (per user).
create table if not exists public.search_history (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  query         text not null,
  compound_name text,
  inchi_key     text,
  cid           integer,
  paper_count   integer,
  patent_count  integer,
  ts            timestamptz not null default now()
);

alter table public.search_history enable row level security;

create policy "search_history_select_own" on public.search_history
  for select using (auth.uid() = user_id);
create policy "search_history_insert_own" on public.search_history
  for insert with check (auth.uid() = user_id);
create policy "search_history_delete_own" on public.search_history
  for delete using (auth.uid() = user_id);

create index if not exists search_history_user_ts
  on public.search_history (user_id, ts desc);
