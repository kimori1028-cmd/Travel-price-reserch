-- 価格履歴機能の追加（既存プロジェクトに適用するSQL）
-- Supabase ダッシュボード → SQL Editor でこのファイル全体を実行する
-- ※ 2回実行すると履歴の初期データが重複するので1回だけ実行すること

-- ============================================================
-- 価格履歴（価格や空室状況が「変化した時だけ」バッチが追記）
-- ============================================================
create table if not exists public.price_history (
  id uuid primary key default gen_random_uuid(),
  hotel_no int not null,
  room_grade text not null,
  stay_date date not null,
  adult_num int not null,
  min_total int,
  is_available boolean not null default false,
  recorded_at timestamptz not null default now()
);

create index if not exists price_history_lookup
  on public.price_history (adult_num, stay_date, recorded_at);

alter table public.price_history enable row level security;

drop policy if exists "price_history_read" on public.price_history;
create policy "price_history_read" on public.price_history
  for select to authenticated using (true);

-- ============================================================
-- 初期データ: 現在の価格を履歴の起点として記録
-- ============================================================
insert into public.price_history
  (hotel_no, room_grade, stay_date, adult_num, min_total, is_available, recorded_at)
select hotel_no, room_grade, stay_date, adult_num, min_total, is_available, fetched_at
from public.nightly_price
where stay_date >= current_date;
