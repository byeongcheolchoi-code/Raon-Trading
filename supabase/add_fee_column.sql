-- 기존 trades 테이블에 수수료(fee) 컬럼 추가
alter table public.trades
  add column if not exists fee numeric not null default 0 check (fee >= 0);
