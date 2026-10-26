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
