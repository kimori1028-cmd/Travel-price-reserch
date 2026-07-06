import { useEffect, useMemo, useState } from 'react'
import { stayQuote, type PriceIndex } from '../lib/calc'
import { addDays, fmtDateJa, fmtMan, fmtMdFromMs, fmtYen } from '../lib/dates'
import { loadHistory, type HistoryEvent } from '../lib/history'
import { anaRakupackUrl, rakutenPlanUrl } from '../lib/rakuten'
import { buildTrend, trendStats } from '../lib/trend'
import { gradeDef, type Favorite } from '../lib/types'
import { TrendChart } from './TrendChart'

interface Props {
  index: PriceIndex
  favorites: Favorite[]
  loading: boolean
  onToggleShare: (fav: Favorite) => void
  onToggleNotify: (fav: Favorite) => void
  onRemove: (fav: Favorite) => void
}

interface CardProps {
  index: PriceIndex
  fav: Favorite
  onToggleShare: (fav: Favorite) => void
  onToggleNotify: (fav: Favorite) => void
  onRemove: (fav: Favorite) => void
}

function FavoriteCard({ index, fav, onToggleShare, onToggleNotify, onRemove }: CardProps) {
  const g = gradeDef(fav.room_grade)
  const q = stayQuote(index, fav.adult_num, fav.room_grade, fav.checkin_date, fav.nights)
  const current = q.status === 'ok' ? q.total : null
  const diff = current != null && fav.price_at_saved != null ? current - fav.price_at_saved : null

  const [history, setHistory] = useState<HistoryEvent[] | null>(null)
  useEffect(() => {
    let alive = true
    loadHistory(fav.checkin_date, fav.nights, fav.adult_num).then((evs) => {
      if (alive) setHistory(evs)
    })
    return () => {
      alive = false
    }
  }, [fav.checkin_date, fav.nights, fav.adult_num])

  const nightDates = useMemo(
    () => Array.from({ length: fav.nights }, (_, i) => addDays(fav.checkin_date, i)),
    [fav.checkin_date, fav.nights],
  )
  const trend = useMemo(
    () =>
      history
        ? buildTrend(
            history.filter((e) => e.room_grade === fav.room_grade),
            nightDates,
          )
        : [],
    [history, fav.room_grade, nightDates],
  )
  const stats = trendStats(trend)
  const now = Date.now()

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-bold">
            {fmtDateJa(fav.checkin_date)}発 {fav.nights}泊 / 大人{fav.adult_num}名
          </div>
          <div className={`text-xs font-bold ${g.color}`}>{g.label}</div>
          {!fav.is_mine && (
            <div className="mt-0.5 text-[11px] text-slate-400">{fav.owner_name} さんの共有</div>
          )}
        </div>
        <div className="text-right">
          {current != null ? (
            <>
              <div className="text-base font-bold">{fmtYen(current)}</div>
              {diff != null && diff !== 0 && (
                <div
                  className={`text-[11px] font-bold ${diff > 0 ? 'text-rose-500' : 'text-emerald-600'}`}
                >
                  保存時から{diff > 0 ? '+' : ''}
                  {diff.toLocaleString('ja-JP')}円
                </div>
              )}
            </>
          ) : q.status === 'unavailable' ? (
            <div className="text-sm font-bold text-rose-500">満室の夜あり</div>
          ) : (
            <div className="text-xs text-slate-400">価格データなし</div>
          )}
          {fav.price_at_saved != null && (
            <div className="text-[11px] text-slate-400">保存時 {fmtYen(fav.price_at_saved)}</div>
          )}
          {fav.lowest_total != null && (
            <div className="text-[11px] text-emerald-600">
              これまで最安 {fmtYen(fav.lowest_total)}
            </div>
          )}
        </div>
      </div>

      {/* 価格推移グラフ */}
      {stats && (
        <div className="mt-2 rounded-lg bg-slate-50 p-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-bold text-slate-500">価格推移</span>
            <span className="flex gap-3 text-slate-600">
              <span className="whitespace-nowrap">
                <span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-600" />
                最安 {fmtYen(stats.min)}
                <span className="ml-0.5 text-slate-400">（{fmtMdFromMs(stats.minAt)}）</span>
              </span>
              {stats.max !== stats.min && (
                <span className="whitespace-nowrap">
                  <span className="mr-1 inline-block h-2 w-2 rounded-full bg-rose-600" />
                  最高 {fmtYen(stats.max)}
                  <span className="ml-0.5 text-slate-400">（{fmtMdFromMs(stats.maxAt)}）</span>
                </span>
              )}
            </span>
          </div>
          {stats.max === stats.min ? (
            <div className="py-1 text-[11px] text-slate-400">記録開始からまだ変動はありません</div>
          ) : (
            <TrendChart points={trend} now={now} />
          )}
        </div>
      )}
      {history !== null && !stats && (
        <div className="mt-1 text-[10px] text-slate-400">
          価格推移の記録はまだありません（今後の更新で蓄積されます）
        </div>
      )}

      <div className="mt-2 flex items-center gap-2">
        <a
          href={rakutenPlanUrl(fav.checkin_date, fav.nights, fav.adult_num)}
          target="_blank"
          rel="noreferrer"
          className="flex-1 rounded-lg bg-rose-500 py-1.5 text-center text-xs font-bold text-white"
        >
          サイトで確認
        </a>
        {fav.is_mine && (
          <>
            <button
              type="button"
              onClick={() => onToggleShare(fav)}
              className={`rounded-lg border px-2.5 py-1.5 text-xs font-bold ${
                fav.is_shared
                  ? 'border-teal-500 bg-teal-50 text-teal-600'
                  : 'border-slate-300 text-slate-500'
              }`}
            >
              {fav.is_shared ? '共有中' : '共有'}
            </button>
            <button
              type="button"
              onClick={() => onToggleNotify(fav)}
              title="指定金額以下になったらメール通知"
              className={`rounded-lg border px-2.5 py-1.5 text-xs font-bold ${
                fav.notify_on_drop && fav.notify_threshold != null
                  ? 'border-amber-500 bg-amber-50 text-amber-600'
                  : 'border-slate-300 text-slate-500'
              }`}
            >
              {fav.notify_on_drop && fav.notify_threshold != null
                ? `📧 ${fmtMan(fav.notify_threshold)}以下`
                : '📧 通知'}
            </button>
            <button
              type="button"
              onClick={() => onRemove(fav)}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-500"
            >
              削除
            </button>
          </>
        )}
      </div>

      <div className="mt-1.5">
        <div className="mb-1 text-[9px] font-bold text-slate-400">
          ANA楽パック（行き89便 8時発・レンタカー付き）
        </div>
        <div className="flex gap-1.5">
          <a
            href={anaRakupackUrl(fav.checkin_date, fav.nights, fav.adult_num, '90')}
            target="_blank"
            rel="noreferrer"
            className="flex-1 rounded-lg bg-sky-700 py-1.5 text-center text-[10px] font-bold text-white"
          >
            帰り 90便（12時発）
          </a>
          <a
            href={anaRakupackUrl(fav.checkin_date, fav.nights, fav.adult_num, '92')}
            target="_blank"
            rel="noreferrer"
            className="flex-1 rounded-lg bg-sky-700 py-1.5 text-center text-[10px] font-bold text-white"
          >
            帰り 92便（15時発）
          </a>
        </div>
      </div>
    </div>
  )
}

export function FavoritesView({
  index,
  favorites,
  loading,
  onToggleShare,
  onToggleNotify,
  onRemove,
}: Props) {
  if (loading) {
    return <div className="py-10 text-center text-sm text-slate-400">読み込み中…</div>
  }
  if (favorites.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-slate-400">
        お気に入りはまだありません。
        <br />
        カレンダーや検索結果の「★ 保存」から追加できます。
      </div>
    )
  }

  const mine = favorites.filter((f) => f.is_mine)
  const shared = favorites.filter((f) => !f.is_mine)
  const render = (f: Favorite) => (
    <FavoriteCard
      key={f.id}
      index={index}
      fav={f}
      onToggleShare={onToggleShare}
      onToggleNotify={onToggleNotify}
      onRemove={onRemove}
    />
  )

  return (
    <div className="space-y-4 pb-4">
      <div>
        <h3 className="mb-2 text-xs font-bold text-slate-500">自分のお気に入り</h3>
        <div className="space-y-2">{mine.map(render)}</div>
        {mine.length === 0 && (
          <div className="text-xs text-slate-400">自分のお気に入りはありません。</div>
        )}
      </div>
      {shared.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-bold text-slate-500">共有されたお気に入り</h3>
          <div className="space-y-2">{shared.map(render)}</div>
        </div>
      )}
      <p className="text-[11px] leading-relaxed text-slate-400">
        ・チェックイン日を過ぎたお気に入りは自動的に削除されます。
        <br />
        ・「📧 通知」で金額を設定すると、参考価格がその金額以下になった時にメールが届きます
        （メール送信の設定がされている場合）。お気に入りの日程は1時間ごとに価格チェックされます。
      </p>
    </div>
  )
}
