-- 2026-07-06 のセットアップ時ノイズを掃除する（1回だけ実行）
-- Supabase ダッシュボード → SQL Editor でこのファイル全体を実行する
--
-- 背景:
--   7/6 は初回取得に加え、セットアップ中の再実行や取得条件の変更
--   （素泊まり含む → 朝食付きのみ 等）で、実際の値動きではない「見かけの変化」が
--   price_history に複数入ってしまっている。これが偽の最安/最高・矢印の原因。
--
-- この掃除の内容:
--   各プラン（hotel_no, room_grade, stay_date, adult_num）ごとに、
--   7/6(JST) の履歴が複数あれば「最新の1件」だけ残して残りを削除する。
--   → 履歴が1件しかないものはそのまま残る（＝基準点として保持）。
--   7/7 以降の履歴（実際の値動き）には一切手を付けない。

delete from public.price_history ph
where (ph.recorded_at at time zone 'Asia/Tokyo')::date = date '2026-07-06'
  and ph.id <> (
    select ph2.id
    from public.price_history ph2
    where ph2.hotel_no   = ph.hotel_no
      and ph2.room_grade = ph.room_grade
      and ph2.stay_date  = ph.stay_date
      and ph2.adult_num  = ph.adult_num
      and (ph2.recorded_at at time zone 'Asia/Tokyo')::date = date '2026-07-06'
    order by ph2.recorded_at desc
    limit 1
  );
