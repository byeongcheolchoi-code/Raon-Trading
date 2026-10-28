-- 분할청산을 하나의 포지션으로 묶기 위한 선택적 그룹 식별자
alter table public.trades
  add column if not exists position_group uuid null;

create index if not exists trades_position_group_idx on public.trades (position_group) where position_group is not null;
