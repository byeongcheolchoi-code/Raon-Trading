-- 기존 단일 수수료 컬럼을 진입/청산 수수료로 분리
alter table public.trades rename column fee to fee_entry;
alter table public.trades
  add column if not exists fee_exit numeric not null default 0 check (fee_exit >= 0);
