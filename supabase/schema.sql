-- フサキ価格監視ツール Supabase スキーマ
-- Supabase ダッシュボード → SQL Editor でこのファイル全体を実行する

-- ============================================================
-- 1泊単位の価格（バッチが service role で upsert）
-- ============================================================
create table if not exists public.nightly_price (
  id uuid primary key default gen_random_uuid(),
  hotel_no int not null,
  room_grade text not null,
  stay_date date not null,
  adult_num int not null,
  min_total int,
  plan_id text,
  plan_name text,
  room_name text,
  with_breakfast boolean,
  reserve_url text,
  is_available boolean not null default false,
  fetched_at timestamptz not null default now(),
  unique (hotel_no, room_grade, stay_date, adult_num)
);

create index if not exists nightly_price_lookup
  on public.nightly_price (adult_num, stay_date);

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

-- ============================================================
-- プロフィール（お気に入り共有時の表示名）
-- ============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default ''
);

-- 新規ユーザー作成時にメールのローカル部を表示名として自動登録
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(coalesce(new.email, '名無し'), '@', 1))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- お気に入り
-- ============================================================
create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  room_grade text not null,
  checkin_date date not null,
  nights int not null check (nights between 1 and 14),
  adult_num int not null default 2 check (adult_num between 1 and 10),
  note text,
  price_at_saved int,
  lowest_total int,
  notify_on_drop boolean not null default false,
  notify_mode text not null default 'threshold', -- 'threshold' | 'new_low'
  notify_threshold int,
  last_notified_total int,
  is_shared boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists favorites_owner on public.favorites (owner_id);

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.nightly_price enable row level security;
alter table public.price_history enable row level security;
alter table public.profiles enable row level security;
alter table public.favorites enable row level security;

-- nightly_price: ログイン済みユーザーは読み取りのみ（書き込みは service role のみ）
drop policy if exists "nightly_price_read" on public.nightly_price;
create policy "nightly_price_read" on public.nightly_price
  for select to authenticated using (true);

-- price_history: ログイン済みユーザーは読み取りのみ（書き込みは service role のみ）
drop policy if exists "price_history_read" on public.price_history;
create policy "price_history_read" on public.price_history
  for select to authenticated using (true);

-- profiles: ログイン済みユーザーは全員の表示名を閲覧可、更新は本人のみ
drop policy if exists "profiles_read" on public.profiles;
create policy "profiles_read" on public.profiles
  for select to authenticated using (true);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- favorites: 自分のもの全部 + 共有された他人のものを閲覧可
drop policy if exists "favorites_read" on public.favorites;
create policy "favorites_read" on public.favorites
  for select to authenticated using (owner_id = auth.uid() or is_shared = true);

drop policy if exists "favorites_insert_own" on public.favorites;
create policy "favorites_insert_own" on public.favorites
  for insert to authenticated with check (owner_id = auth.uid());

drop policy if exists "favorites_update_own" on public.favorites;
create policy "favorites_update_own" on public.favorites
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "favorites_delete_own" on public.favorites;
create policy "favorites_delete_own" on public.favorites
  for delete to authenticated using (owner_id = auth.uid());
