-- お気に入りの値下げ通知機能の追加（既存プロジェクトに適用するSQL）
-- Supabase ダッシュボード → SQL Editor でこのファイル全体を実行する
-- （add column if not exists なので、以前のバージョンを実行済みでも安全に再実行できます）

alter table public.favorites
  add column if not exists notify_on_drop boolean not null default false;

-- 「この金額以下になったら通知」のしきい値（円）
alter table public.favorites
  add column if not exists notify_threshold int;

-- 最後に通知した価格（同じ価格で繰り返し通知しないための記録）
alter table public.favorites
  add column if not exists last_notified_total int;

alter table public.favorites
  add column if not exists lowest_total int;

-- 既存のお気に入りは保存時価格を「これまでの最安」の起点にする
update public.favorites
  set lowest_total = price_at_saved
  where lowest_total is null;
