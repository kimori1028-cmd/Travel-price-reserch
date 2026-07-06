import { useMemo, useState } from 'react'
import { searchCheapest, type PriceIndex } from '../lib/calc'
import { addDays, fmtDateJa, fmtYen, todayISO, WEEKDAY_LABELS } from '../lib/dates'
import { GRADES, NIGHT_OPTIONS, gradeDef, type GradeKey } from '../lib/types'
import { Chip } from './Chip'

interface Props {
  index: PriceIndex
  adults: number
  onAddFavorite: (grade: GradeKey, checkin: string, nights: number, total: number | null) => void
}

const MAX_RESULTS = 50

export function SearchView({ index, adults, onAddFavorite }: Props) {
  const today = todayISO()
  const [nightsList, setNightsList] = useState<number[]>([3, 4])
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5]) // 月〜金
  const [grades, setGrades] = useState<GradeKey[]>(GRADES.map((g) => g.key))
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(addDays(today, 365))
  const [searched, setSearched] = useState(false)

  const results = useMemo(() => {
    if (!searched) return []
    return searchCheapest(index, { nightsList, weekdays, grades, from, to, adults })
  }, [searched, index, nightsList, weekdays, grades, from, to, adults])

  const toggle = <T,>(list: T[], v: T, set: (next: T[]) => void) => {
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
    setSearched(false)
  }

  return (
    <div className="space-y-4 pb-4">
      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
        <div>
          <div className="mb-1.5 text-xs font-bold text-slate-500">宿泊数（複数選択可）</div>
          <div className="flex gap-2">
            {NIGHT_OPTIONS.map((n) => (
              <Chip
                key={n}
                label={`${n}泊${n + 1}日`}
                active={nightsList.includes(n)}
                onClick={() => toggle(nightsList, n, setNightsList)}
              />
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1.5 text-xs font-bold text-slate-500">出発曜日（チェックイン曜日）</div>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAY_LABELS.map((w, i) => (
              <Chip
                key={w}
                label={w}
                active={weekdays.includes(i)}
                onClick={() => toggle(weekdays, i, setWeekdays)}
              />
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1.5 text-xs font-bold text-slate-500">部屋グレード（複数選択可）</div>
          <div className="flex flex-wrap gap-1.5">
            {GRADES.map((g) => (
              <Chip
                key={g.key}
                label={g.short}
                active={grades.includes(g.key)}
                onClick={() => toggle(grades, g.key, setGrades)}
              />
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1.5 text-xs font-bold text-slate-500">検索期間</div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={from}
              min={today}
              onChange={(e) => {
                setFrom(e.target.value)
                setSearched(false)
              }}
              className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-2 text-sm"
            />
            <span className="text-slate-400">〜</span>
            <input
              type="date"
              value={to}
              min={from}
              onChange={(e) => {
                setTo(e.target.value)
                setSearched(false)
              }}
              className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-2 text-sm"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() => setSearched(true)}
          disabled={nightsList.length === 0 || weekdays.length === 0 || grades.length === 0}
          className="w-full rounded-lg bg-teal-600 py-2.5 font-bold text-white disabled:opacity-40"
        >
          最安値を検索
        </button>
      </div>

      {searched && (
        <div>
          <div className="mb-2 text-xs text-slate-500">
            {results.length === 0
              ? '条件に合う空室が見つかりませんでした（取得済みデータの範囲内）。'
              : `安い順 ${Math.min(results.length, MAX_RESULTS)}件表示（全${results.length}件） / 大人${adults}名・参考価格`}
          </div>
          <div className="space-y-2">
            {results.slice(0, MAX_RESULTS).map((r) => {
              const g = gradeDef(r.grade)
              const firstRow = r.quote.nights[0]?.row
              return (
                <div
                  key={`${r.checkin}-${r.grade}-${r.nights}`}
                  className="rounded-xl border border-slate-200 bg-white p-3"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-bold">
                        {fmtDateJa(r.checkin)}発 {r.nights}泊
                      </div>
                      <div className={`text-xs font-bold ${g.color}`}>{g.label}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold">{fmtYen(r.total)}</div>
                      <div className="text-[11px] text-slate-400">
                        1泊平均 {fmtYen(Math.round(r.total / r.nights))}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 flex gap-2">
                    {firstRow?.reserve_url && (
                      <a
                        href={firstRow.reserve_url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex-1 rounded-lg bg-rose-500 py-1.5 text-center text-xs font-bold text-white"
                      >
                        楽天トラベルで確認
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => onAddFavorite(r.grade, r.checkin, r.nights, r.total)}
                      className="rounded-lg border border-amber-400 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-600"
                    >
                      ★ 保存
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
