-- お気に入りの値下げ通知機能の追加（既存プロジェクトに適用するSQL）
-- Supabase ダッシュボード → SQL Editor でこのファイル全体を実行する

alter table public.favorites
  add column if not exists notify_on_drop boolean not null default false;

alter table public.favorites
  add column if not exists lowest_total int;

-- 既存のお気に入りは保存時価格を「これまでの最安」の起点にする
update public.favorites
  set lowest_total = price_at_saved
  where lowest_total is null;
