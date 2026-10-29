-- 추세매매 / 역추세매매 구분 (선택 입력)
alter table public.trades
  add column if not exists strategy text null check (strategy is null or strategy in ('trend', 'counter'));
