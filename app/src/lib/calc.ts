import { addDays, weekdayOf } from './dates'
import type { GradeKey, NightlyPrice } from './types'

/** adults → grade → stay_date → row */
export type PriceIndex = Map<number, Map<GradeKey, Map<string, NightlyPrice>>>

export function buildIndex(rows: NightlyPrice[]): PriceIndex {
  const index: PriceIndex = new Map()
  for (const row of rows) {
    let byGrade = index.get(row.adult_num)
    if (!byGrade) {
      byGrade = new Map()
      index.set(row.adult_num, byGrade)
    }
    let byDate = byGrade.get(row.room_grade)
    if (!byDate) {
      byDate = new Map()
      byGrade.set(row.room_grade, byDate)
    }
    byDate.set(row.stay_date, row)
  }
  return index
}

export interface StayQuote {
  /** 'ok' = 全泊空室あり / 'unavailable' = どこかの夜が満室 / 'unknown' = 未取得の夜がある */
  status: 'ok' | 'unavailable' | 'unknown'
  total: number
  nights: { date: string; row: NightlyPrice | undefined }[]
}

/** 発日 checkin から nights 泊の合計参考価格（1泊料金の合算） */
export function stayQuote(
  index: PriceIndex,
  adults: number,
  grade: GradeKey,
  checkin: string,
  nights: number,
): StayQuote {
  const byDate = index.get(adults)?.get(grade)
  const detail: StayQuote['nights'] = []
  let total = 0
  let status: StayQuote['status'] = 'ok'
  for (let i = 0; i < nights; i++) {
    const date = addDays(checkin, i)
    const row = byDate?.get(date)
    detail.push({ date, row })
    if (!row) {
      status = 'unknown'
    } else if (!row.is_available || row.min_total == null) {
      if (status !== 'unknown') status = 'unavailable'
    } else {
      total += row.min_total
    }
  }
  return { status, total: status === 'ok' ? total : 0, nights: detail }
}

export interface SearchParams {
  nightsList: number[]
  weekdays: number[] // 0=日〜6=土
  grades: GradeKey[]
  from: string
  to: string
  adults: number
}

export interface SearchResult {
  checkin: string
  grade: GradeKey
  nights: number
  total: number
  quote: StayQuote
}

/** DB(ロード済みデータ)上で最安値検索。API は叩かない。 */
export function searchCheapest(index: PriceIndex, p: SearchParams): SearchResult[] {
  const results: SearchResult[] = []
  for (let d = p.from; d <= p.to; d = addDays(d, 1)) {
    if (!p.weekdays.includes(weekdayOf(d))) continue
    for (const nights of p.nightsList) {
      for (const grade of p.grades) {
        const quote = stayQuote(index, p.adults, grade, d, nights)
        if (quote.status === 'ok') {
          results.push({ checkin: d, grade, nights, total: quote.total, quote })
        }
      }
    }
  }
  results.sort((a, b) => a.total - b.total || a.checkin.localeCompare(b.checkin))
  return results
}
