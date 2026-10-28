-- 레버리지 매매일지 — Supabase 스키마
-- Supabase 대시보드 → SQL Editor 에서 이 파일 전체를 붙여넣고 실행하세요.

create table if not exists public.trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  symbol text not null,
  side text not null check (side in ('long', 'short')),
  entry numeric not null check (entry > 0),
  exit numeric not null check (exit > 0),
  weight numeric not null check (weight >= 0 and weight <= 100),
  leverage numeric not null check (leverage >= 0 and leverage <= 100),
  margin text not null check (margin in ('cross', 'isolated')),
  fee_entry numeric not null default 0 check (fee_entry >= 0),
  fee_exit numeric not null default 0 check (fee_exit >= 0),
  memo text default '',
  created_at timestamptz not null default now()
);

create index if not exists trades_user_date_idx on public.trades (user_id, date);

alter table public.trades enable row level security;

drop policy if exists trades_select_own on public.trades;
drop policy if exists trades_insert_own on public.trades;
drop policy if exists trades_update_own on public.trades;
drop policy if exists trades_delete_own on public.trades;

create policy trades_select_own on public.trades for select using (auth.uid() = user_id);
create policy trades_insert_own on public.trades for insert with check (auth.uid() = user_id);
create policy trades_update_own on public.trades for update using (auth.uid() = user_id);
create policy trades_delete_own on public.trades for delete using (auth.uid() = user_id);

create table if not exists public.settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  capital numeric not null default 10000000,
  updated_at timestamptz not null default now()
);

alter table public.settings enable row level security;

drop policy if exists settings_select_own on public.settings;
drop policy if exists settings_insert_own on public.settings;
drop policy if exists settings_update_own on public.settings;

create policy settings_select_own on public.settings for select using (auth.uid() = user_id);
create policy settings_insert_own on public.settings for insert with check (auth.uid() = user_id);
create policy settings_update_own on public.settings for update using (auth.uid() = user_id);

-- 실시간 동기화(여러 기기에서 동시 사용 시 자동 반영) 활성화. 이미 추가돼 있어도 안전하게 재실행 가능.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trades'
  ) then
    execute 'alter publication supabase_realtime add table public.trades';
  end if;
end $$;

-- 관심종목(사이드 패널에서 추가/삭제하는 즐겨찾기 종목 목록)
create table if not exists public.watchlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  created_at timestamptz not null default now(),
  unique (user_id, symbol)
);

alter table public.watchlist enable row level security;

drop policy if exists watchlist_select_own on public.watchlist;
drop policy if exists watchlist_insert_own on public.watchlist;
drop policy if exists watchlist_delete_own on public.watchlist;

create policy watchlist_select_own on public.watchlist for select using (auth.uid() = user_id);
create policy watchlist_insert_own on public.watchlist for insert with check (auth.uid() = user_id);
create policy watchlist_delete_own on public.watchlist for delete using (auth.uid() = user_id);
