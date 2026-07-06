import { isDemo, supabase } from './supabase'
import type { NightlyPrice } from './types'

const PAGE = 1000

/** 全人数・全グレードの1泊価格をロードする（Supabase または デモJSON） */
export async function loadNightlyPrices(): Promise<NightlyPrice[]> {
  if (isDemo || !supabase) {
    const res = await fetch(import.meta.env.BASE_URL + 'demo-data.json')
    if (!res.ok) return []
    return (await res.json()) as NightlyPrice[]
  }
  const rows: NightlyPrice[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('nightly_price')
      .select(
        'room_grade,stay_date,adult_num,min_total,plan_name,room_name,with_breakfast,reserve_url,is_available,fetched_at',
      )
      .order('stay_date', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`価格データの取得に失敗: ${error.message}`)
    rows.push(...((data ?? []) as NightlyPrice[]))
    if (!data || data.length < PAGE) break
  }
  return rows
}

export function lastUpdated(rows: NightlyPrice[]): string | null {
  let max: string | null = null
  for (const r of rows) {
    if (!max || r.fetched_at > max) max = r.fetched_at
  }
  return max
}
