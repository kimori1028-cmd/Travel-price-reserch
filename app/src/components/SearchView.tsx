import { useMemo, useState } from 'react'
import { searchCheapest, type PriceIndex } from '../lib/calc'
import { addDays, fmtDateJa, fmtYen, todayISO, WEEKDAY_LABELS } from '../lib/dates'
import { anaRakupackUrl, rakutenPlanUrl } from '../lib/rakuten'
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
  const [fromMonth, setFromMonth] = useState(today.slice(0, 7))
  const [toMonth, setToMonth] = useState(addDays(today, 365).slice(0, 7))
  const [searched, setSearched] = useState(false)

  // 今月〜13ヶ月先までの月の選択肢（"YYYY-MM"）
  const monthOptions = useMemo(() => {
    const options: string[] = []
    let [y, m] = today.split('-').map(Number)
    for (let i = 0; i <= 13; i++) {
      options.push(`${y}-${String(m).padStart(2, '0')}`)
      m += 1
      if (m > 12) {
        m = 1
        y += 1
      }
    }
    return options
  }, [today])

  const fmtMonthJa = (ym: string) => {
    const [y, m] = ym.split('-').map(Number)
    return `${y}年${m}月`
  }

  const results = useMemo(() => {
    if (!searched) return []
    // 月指定 → 実際の日付範囲へ（開始月は今日以降、終了月は月末まで）
    const fromDate = `${fromMonth}-01` < today ? today : `${fromMonth}-01`
    const [ty, tm] = toMonth.split('-').map(Number)
    const lastDay = new Date(Date.UTC(ty, tm, 0)).getUTCDate()
    const toDate = `${toMonth}-${String(lastDay).padStart(2, '0')}`
    return searchCheapest(index, {
      nightsList,
      weekdays,
      grades,
      from: fromDate,
      to: toDate,
      adults,
    })
  }, [searched, index, nightsList, weekdays, grades, fromMonth, toMonth, adults, today])

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
          <div className="mb-1.5 text-xs font-bold text-slate-500">検索期間（月単位）</div>
          <div className="flex items-center gap-2">
            <select
              value={fromMonth}
              onChange={(e) => {
                setFromMonth(e.target.value)
                if (toMonth < e.target.value) setToMonth(e.target.value)
                setSearched(false)
              }}
              className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm"
            >
              {monthOptions.map((ym) => (
                <option key={ym} value={ym}>
                  {fmtMonthJa(ym)}
                </option>
              ))}
            </select>
            <span className="text-slate-400">〜</span>
            <select
              value={toMonth}
              onChange={(e) => {
                setToMonth(e.target.value)
                setSearched(false)
              }}
              className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm"
            >
              {monthOptions
                .filter((ym) => ym >= fromMonth)
                .map((ym) => (
                  <option key={ym} value={ym}>
                    {fmtMonthJa(ym)}
                  </option>
                ))}
            </select>
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
                  <div className="mt-2 flex gap-1.5">
                    <a
                      href={rakutenPlanUrl(r.checkin, r.nights, adults)}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 rounded-lg bg-rose-500 py-1.5 text-center text-xs font-bold text-white"
                    >
                      サイトで確認
                    </a>
                    <button
                      type="button"
                      onClick={() => onAddFavorite(r.grade, r.checkin, r.nights, r.total)}
                      className="rounded-lg border border-amber-400 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-600"
                    >
                      ★ 保存
                    </button>
                  </div>
                  <div className="mt-1.5">
                    <div className="mb-1 text-[9px] font-bold text-slate-400">
                      ANA楽パック（行き89便 8時発・レンタカー付き）
                    </div>
                    <div className="flex gap-1.5">
                      <a
                        href={anaRakupackUrl(r.checkin, r.nights, adults, '90')}
                        target="_blank"
                        rel="noreferrer"
                        className="flex-1 rounded-lg bg-sky-700 py-1.5 text-center text-[10px] font-bold text-white"
                      >
                        帰り 90便（12時発）
                      </a>
                      <a
                        href={anaRakupackUrl(r.checkin, r.nights, adults, '92')}
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
            })}
          </div>
        </div>
      )}
    </div>
  )
}
