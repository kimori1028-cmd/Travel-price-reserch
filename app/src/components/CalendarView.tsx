import { useMemo, useRef, useState } from 'react'
import { stayQuote, type PriceIndex, type StayQuote } from '../lib/calc'
import { monthGrid, todayISO, WEEKDAY_LABELS } from '../lib/dates'
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
  const [selected, setSelected] = useState<GradeKey[]>(['villa_standard'])
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  const toggleGrade = (key: GradeKey) => {
    setSelected((prev) => {
      if (prev.includes(key)) {
        return prev.length > 1 ? prev.filter((g) => g !== key) : prev
      }
      return GRADES.map((g) => g.key).filter((k) => k === key || prev.includes(k))
    })
  }

  const weeks = useMemo(() => monthGrid(cursor.year, cursor.month0), [cursor])
  const shownGrades = useMemo(() => GRADES.filter((g) => selected.includes(g.key)), [selected])
  const multi = shownGrades.length > 1

  const quotes = useMemo(() => {
    const map = new Map<string, StayQuote>()
    for (const week of weeks) {
      for (const day of week) {
        if (!day || day < today) continue
        for (const g of shownGrades) {
          map.set(`${g.key}|${day}`, stayQuote(index, adults, g.key, day, nights))
        }
      }
    }
    return map
  }, [weeks, index, adults, shownGrades, nights, today])

  // グレードごとの月内最安（該当セルを緑で強調）
  const cheapest = useMemo(() => {
    const best = new Map<GradeKey, number>()
    for (const [key, q] of quotes) {
      if (q.status !== 'ok') continue
      const grade = key.split('|')[0] as GradeKey
      const cur = best.get(grade)
      if (cur === undefined || q.total < cur) best.set(grade, q.total)
    }
    return best
  }, [quotes])

  const moveMonth = (diff: number) => {
    setCursor(({ year, month0 }) => {
      const m = month0 + diff
      return { year: year + Math.floor(m / 12), month0: ((m % 12) + 12) % 12 }
    })
  }

  // 左右スワイプで月移動（縦スクロールと区別するため横方向が優位な時だけ）
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]
    touchStart.current = { x: t.clientX, y: t.clientY }
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStart.current
    touchStart.current = null
    if (!start) return
    const t = e.changedTouches[0]
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      moveMonth(dx < 0 ? 1 : -1)
    }
  }

  const cellHeight =
    shownGrades.length === 1 ? 'h-14' : shownGrades.length === 2 ? 'h-[4.5rem]' : 'h-[5.3rem]'

  return (
    <div className="pb-4">
      {/* 泊数プルダウン + グレード選択（複数可） */}
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
              onClick={() => toggleGrade(g.key)}
              className={`flex-1 px-1 py-2 ${
                selected.includes(g.key)
                  ? 'bg-teal-600 font-bold text-white'
                  : 'text-slate-600'
              }`}
            >
              {g.short}
            </button>
          ))}
        </div>
      </div>

      {/* 月ナビ + カレンダー（左右スワイプで月移動） */}
      <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
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
              if (!day) return <div key={di} className={cellHeight} />
              const dayNum = Number(day.slice(8))
              return (
                <button
                  key={di}
                  type="button"
                  onClick={() => day >= today && setSelectedDay(day)}
                  className={`${cellHeight} overflow-hidden border-t border-slate-100 px-px text-center ${
                    day < today ? 'bg-slate-50' : 'active:bg-teal-50'
                  }`}
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
                  ) : (
                    shownGrades.map((g) => {
                      const q = quotes.get(`${g.key}|${day}`)
                      const isMin = q?.status === 'ok' && q.total === cheapest.get(g.key)
                      return (
                        <div
                          key={g.key}
                          className={`flex items-baseline justify-center gap-[1px] font-semibold leading-[1.35] tracking-tighter ${
                            multi ? 'text-[8px]' : 'text-[9px]'
                          }`}
                        >
                          {multi && <span className={`${g.color} font-bold`}>{g.letter}</span>}
                          {q?.status === 'ok' ? (
                            <span className={isMin ? 'text-emerald-600' : 'text-slate-700'}>
                              ¥{q.total.toLocaleString('ja-JP')}
                            </span>
                          ) : q?.status === 'unavailable' ? (
                            <span className="font-normal text-rose-300">×</span>
                          ) : (
                            <span className="font-normal text-slate-300">–</span>
                          )}
                        </div>
                      )
                    })
                  )}
                </button>
              )
            })}
          </div>
        ))}
      </div>
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
        ※ 表示は<b>朝食付きプラン</b>の最安値を「発日から{nights}泊」分合算した<b>参考価格</b>です。
        {multi && ' V=ヴィラ / S=スーペリア / P=パティオ。'}
        <span className="text-emerald-600">緑の金額</span>は表示月内の最安日。連泊プラン等により実際の予約価格と異なる場合があります。× = 期間中に満室の夜あり / – = 未取得・受付前。
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
