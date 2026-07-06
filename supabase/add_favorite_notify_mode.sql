-- お気に入り通知の「モード」列を追加（既存プロジェクトに適用するSQL）
-- Supabase ダッシュボード → SQL Editor でこのファイル全体を実行する
-- （add column if not exists なので再実行しても安全）

-- 通知モード: 'threshold'=指定金額以下で通知 / 'new_low'=最安値を更新したら通知
alter table public.favorites
  add column if not exists notify_mode text not null default 'threshold';
