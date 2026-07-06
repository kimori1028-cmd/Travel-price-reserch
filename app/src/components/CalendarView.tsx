import { useMemo, useState } from 'react'
import { stayQuote, type PriceIndex } from '../lib/calc'
import { fmtMan, monthGrid, todayISO, WEEKDAY_LABELS } from '../lib/dates'
import { GRADES, NIGHT_OPTIONS, type GradeKey } from '../lib/types'
import { DayDetail } from './DayDetail'

interface Props {
  index: PriceIndex
  adults: number
  onAddFavorite: (grade: GradeKey, checkin: string, nights: number, total: number | null) => void
}

export function CalendarView({ index, adults, onAddFavorite }: Props) {
  const today = todayISO()
  const [cursor, setCursor] = useState(() => {
    const [y, m] = today.split('-').map(Number)
    return { year: y, month0: m - 1 }
  })
  const [nights, setNights] = useState<number>(3)
  const [grade, setGrade] = useState<GradeKey>('villa_standard')
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  const weeks = useMemo(() => monthGrid(cursor.year, cursor.month0), [cursor])

  const quotes = useMemo(() => {
    const map = new Map<string, ReturnType<typeof stayQuote>>()
    for (const week of weeks) {
      for (const day of week) {
        if (day && day >= today) map.set(day, stayQuote(index, adults, grade, day, nights))
      }
    }
    return map
  }, [weeks, index, adults, grade, nights, today])

  const cheapest = useMemo(() => {
    let best: number | null = null
    for (const q of quotes.values()) {
      if (q.status === 'ok' && (best === null || q.total < best)) best = q.total
    }
    return best
  }, [quotes])

  const moveMonth = (diff: number) => {
    setCursor(({ year, month0 }) => {
      const m = month0 + diff
      return { year: year + Math.floor(m / 12), month0: ((m % 12) + 12) % 12 }
    })
  }

  return (
    <div className="pb-4">
      {/* 泊数プルダウン + グレードタブ */}
      <div className="mb-2 flex items-center gap-2">
        <select
          value={nights}
          onChange={(e) => setNights(Number(e.target.value))}
          className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm"
        >
          {NIGHT_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n}泊{n + 1}日
            </option>
          ))}
        </select>
        <div className="flex flex-1 overflow-hidden rounded-lg border border-slate-300 bg-white text-xs">
          {GRADES.map((g) => (
            <button
              key={g.key}
              type="button"
              onClick={() => setGrade(g.key)}
              className={`flex-1 px-1 py-2 ${
                grade === g.key ? 'bg-teal-600 font-bold text-white' : 'text-slate-600'
              }`}
            >
              {g.short}
            </button>
          ))}
        </div>
      </div>

      {/* 月ナビ */}
      <div className="mb-1 flex items-center justify-between">
        <button
          type="button"
          onClick={() => moveMonth(-1)}
          className="rounded-lg px-4 py-1 text-lg text-slate-500 active:bg-slate-200"
        >
          ‹
        </button>
        <div className="font-bold">
          {cursor.year}年{cursor.month0 + 1}月
        </div>
        <button
          type="button"
          onClick={() => moveMonth(1)}
          className="rounded-lg px-4 py-1 text-lg text-slate-500 active:bg-slate-200"
        >
          ›
        </button>
      </div>

      {/* カレンダー */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="grid grid-cols-7 border-b border-slate-100 text-center text-[11px] text-slate-400">
          {WEEKDAY_LABELS.map((w, i) => (
            <div key={w} className={`py-1 ${i === 0 ? 'text-rose-400' : i === 6 ? 'text-sky-400' : ''}`}>
              {w}
            </div>
          ))}
        </div>
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7">
            {week.map((day, di) => {
              if (!day) return <div key={di} className="h-14" />
              const q = day >= today ? quotes.get(day) : undefined
              const dayNum = Number(day.slice(8))
              const isCheapest = q?.status === 'ok' && q.total === cheapest
              return (
                <button
                  key={di}
                  type="button"
                  onClick={() => day >= today && setSelectedDay(day)}
                  className={`h-14 border-t border-slate-100 px-0.5 text-center ${
                    day < today ? 'bg-slate-50' : 'active:bg-teal-50'
                  } ${isCheapest ? 'bg-emerald-50' : ''}`}
                >
                  <div
                    className={`text-[11px] ${
                      di === 0 ? 'text-rose-400' : di === 6 ? 'text-sky-400' : 'text-slate-500'
                    }`}
                  >
                    {dayNum}
                  </div>
                  {day < today ? (
                    <div className="text-xs text-slate-300">-</div>
                  ) : q?.status === 'ok' ? (
                    <div
                      className={`text-[11px] font-bold leading-tight ${
                        isCheapest ? 'text-emerald-600' : 'text-slate-700'
                      }`}
                    >
                      {fmtMan(q.total)}
                      {isCheapest && <div className="text-[9px] font-normal">最安</div>}
                    </div>
                  ) : q?.status === 'unavailable' ? (
                    <div className="text-xs text-rose-300">×</div>
                  ) : (
                    <div className="text-xs text-slate-300">–</div>
                  )}
                </button>
              )
            })}
          </div>
        ))}
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
        ※ 表示は「発日から{nights}泊」の1泊料金合算による<b>参考価格</b>です。連泊プラン等により実際の予約価格と異なる場合があります。× = 期間中に満室の夜あり / – = 未取得・受付前。
      </p>

      {selectedDay && (
        <DayDetail
          index={index}
          adults={adults}
          checkin={selectedDay}
          nights={nights}
          onClose={() => setSelectedDay(null)}
          onAddFavorite={onAddFavorite}
        />
      )}
    </div>
  )
}
