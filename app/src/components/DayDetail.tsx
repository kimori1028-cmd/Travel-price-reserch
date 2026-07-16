import { useEffect, useMemo, useState } from 'react'
import { stayQuote, type PriceIndex } from '../lib/calc'
import {
  addDays,
  fmtDateJa,
  fmtDateShort,
  fmtMdFromMs,
  fmtMdWeekdayFromMs,
  fmtYen,
} from '../lib/dates'
import { loadHistory, type HistoryEvent } from '../lib/history'
import { anaRakupackUrl, rakutenPlanUrl } from '../lib/rakuten'
import { buildTrend, trendChanges, trendStats } from '../lib/trend'
import { GRADES, type GradeKey } from '../lib/types'
import { TrendChart } from './TrendChart'

interface Props {
  index: PriceIndex
  adults: number
  checkin: string
  nights: number
  onClose: () => void
  onAddFavorite: (grade: GradeKey, checkin: string, nights: number, total: number | null) => void
}

export function DayDetail({ index, adults, checkin, nights, onClose, onAddFavorite }: Props) {
  const [history, setHistory] = useState<HistoryEvent[] | null>(null)

  useEffect(() => {
    let alive = true
    setHistory(null)
    loadHistory(checkin, nights, adults).then((events) => {
      if (alive) setHistory(events)
    })
    return () => {
      alive = false
    }
  }, [checkin, nights, adults])

  const nightDates = useMemo(
    () => Array.from({ length: nights }, (_, i) => addDays(checkin, i)),
    [checkin, nights],
  )
  const now = Date.now()

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/40" onClick={onClose}>
      <div
        className="relative max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-white p-4 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="閉じる"
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-lg text-slate-500 active:bg-slate-200"
        >
          ✕
        </button>
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-300" />
        <div className="mb-1 flex items-baseline justify-between pr-10">
          <h2 className="text-base font-bold">
            {fmtDateJa(checkin)}発 {nights}泊{nights + 1}日
          </h2>
          <span className="text-xs text-slate-500">大人{adults}名/1室</span>
        </div>
        <p className="mb-3 text-[11px] text-slate-400">
          1泊料金の合算による参考価格です。実際の予約価格は楽天トラベルでご確認ください。
        </p>

        <div className="space-y-3">
          {GRADES.map((g) => {
            const q = stayQuote(index, adults, g.key, checkin, nights)
            const firstRow = q.nights[0]?.row
            const trend = history
              ? buildTrend(history.filter((e) => e.room_grade === g.key), nightDates)
              : []
            const stats = trendStats(trend)
            const changes = trendChanges(trend)
            return (
              <div key={g.key} className={`rounded-xl border p-3 ${g.bgSoft}`}>
                <div className="flex items-center justify-between">
                  <div className={`text-sm font-bold ${g.color}`}>{g.label}</div>
                  {q.status === 'ok' ? (
                    <div className="text-lg font-bold">{fmtYen(q.total)}</div>
                  ) : q.status === 'unavailable' ? (
                    <div className="text-sm font-bold text-rose-500">満室の夜あり ×</div>
                  ) : (
                    <div className="text-sm text-slate-400">データ未取得</div>
                  )}
                </div>

                {q.status === 'ok' && (
                  <>
                    <div className="mt-2 space-y-0.5 text-xs text-slate-600">
                      {q.nights.map(({ date, row }) => (
                        <div key={date} className="flex justify-between">
                          <span>{fmtDateShort(date)}</span>
                          <span>{row?.min_total != null ? fmtYen(row.min_total) : '-'}</span>
                        </div>
                      ))}
                    </div>
                    {firstRow?.plan_name && (
                      <div className="mt-2 text-[11px] leading-snug text-slate-500">
                        初日プラン: {firstRow.plan_name}
                        {firstRow.with_breakfast != null &&
                          (firstRow.with_breakfast ? '（朝食あり）' : '（朝食なし）')}
                      </div>
                    )}
                    {stats && (
                      <div className="mt-2 rounded-lg bg-white/70 p-2">
                        <div className="text-[11px] font-bold text-slate-500">価格推移</div>
                        <div className="mt-0.5 flex gap-3 text-[11px] text-slate-600">
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
                        </div>
                        {stats.max === stats.min ? (
                          <div className="py-1 text-[11px] text-slate-400">
                            記録開始からまだ変動はありません
                          </div>
                        ) : (
                          <>
                            <TrendChart points={trend} now={now} />
                            <ul className="mt-1 space-y-0.5">
                              {changes.map((c) => {
                                const down = c.diff != null && c.diff < 0
                                const up = c.diff != null && c.diff > 0
                                return (
                                  <li
                                    key={c.t}
                                    className="flex items-center gap-1.5 text-[11px] leading-tight text-slate-600"
                                  >
                                    <span className="w-14 shrink-0 tabular-nums text-slate-400">
                                      {fmtMdWeekdayFromMs(c.t)}
                                    </span>
                                    <span className="tabular-nums text-slate-400">
                                      {c.from != null ? fmtYen(c.from) : '満室'}
                                    </span>
                                    <span className="text-slate-300">→</span>
                                    <span
                                      className={`font-bold tabular-nums ${
                                        down
                                          ? 'text-emerald-600'
                                          : up
                                            ? 'text-rose-600'
                                            : 'text-slate-700'
                                      }`}
                                    >
                                      {c.to != null ? fmtYen(c.to) : '満室'}
                                    </span>
                                    {c.diff != null && c.diff !== 0 && (
                                      <span
                                        className={`ml-auto shrink-0 tabular-nums ${
                                          down ? 'text-emerald-600' : 'text-rose-600'
                                        }`}
                                      >
                                        {down ? '↓' : '↑'}
                                        {fmtYen(Math.abs(c.diff))}
                                      </span>
                                    )}
                                  </li>
                                )
                              })}
                            </ul>
                          </>
                        )}
                        <div className="mt-1 text-right text-[10px] text-slate-400">
                          {new Date(trend[0].t).toLocaleDateString('ja-JP', {
                            timeZone: 'Asia/Tokyo',
                            month: 'numeric',
                            day: 'numeric',
                          })}
                          〜今日
                        </div>
                      </div>
                    )}
                    {history !== null && !stats && (
                      <div className="mt-2 text-[10px] text-slate-400">
                        価格推移の記録はまだありません（今後の更新で蓄積されます）
                      </div>
                    )}
                    <div className="mt-2 flex gap-1.5">
                      <a
                        href={rakutenPlanUrl(checkin, nights, adults)}
                        target="_blank"
                        rel="noreferrer"
                        className="flex-1 rounded-lg bg-rose-500 py-2 text-center text-xs font-bold leading-relaxed text-white"
                      >
                        サイトで確認
                      </a>
                      <button
                        type="button"
                        onClick={() => onAddFavorite(g.key, checkin, nights, q.total)}
                        className="rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-600"
                      >
                        ★ 保存
                      </button>
                    </div>
                    <div className="mt-1.5">
                      <div className="mb-1 text-[10px] font-bold text-slate-500">
                        ANA楽パックで確認（行き ANA89便 8時発・レンタカー付き）
                      </div>
                      <div className="flex gap-1.5">
                        <a
                          href={anaRakupackUrl(checkin, nights, adults, '90')}
                          target="_blank"
                          rel="noreferrer"
                          className="flex-1 rounded-lg bg-sky-700 py-2 text-center text-[11px] font-bold leading-relaxed text-white"
                        >
                          帰り 90便（12時発）
                        </a>
                        <a
                          href={anaRakupackUrl(checkin, nights, adults, '92')}
                          target="_blank"
                          rel="noreferrer"
                          className="flex-1 rounded-lg bg-sky-700 py-2 text-center text-[11px] font-bold leading-relaxed text-white"
                        >
                          帰り 92便（15時発）
                        </a>
                      </div>
                    </div>
                  </>
                )}
                {q.status !== 'ok' && (
                  <div className="mt-1 text-[11px] text-slate-400">
                    {q.nights
                      .map(
                        ({ date, row }) =>
                          `${fmtDateShort(date)}:${
                            !row ? '未取得' : row.is_available ? '空室あり' : '満室'
                          }`,
                      )
                      .join(' / ')}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-lg border border-slate-300 py-2 text-sm text-slate-500"
        >
          閉じる
        </button>
      </div>
    </div>
  )
}
