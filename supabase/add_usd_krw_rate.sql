-- 수수료(USDT)를 원화로 환산하기 위한 환율 설정
alter table public.settings
  add column if not exists usd_krw_rate numeric not null default 1400 check (usd_krw_rate > 0);
