import { addDays } from './dates'
import { isDemo, supabase } from './supabase'
import type { GradeKey } from './types'

export interface HistoryEvent {
  room_grade: GradeKey
  stay_date: string
  adult_num: number
  min_total: number | null
  is_available: boolean
  recorded_at: string
}

let demoCache: HistoryEvent[] | null = null

/** 指定の発日・泊数・人数に関わる価格履歴（変化イベント）を全グレード分ロードする */
export async function loadHistory(
  checkin: string,
  nights: number,
  adults: number,
): Promise<HistoryEvent[]> {
  const last = addDays(checkin, nights - 1)
  if (isDemo || !supabase) {
    if (!demoCache) {
      try {
        const res = await fetch(import.meta.env.BASE_URL + 'demo-history.json')
        demoCache = res.ok ? ((await res.json()) as HistoryEvent[]) : []
      } catch {
        demoCache = []
      }
    }
    return demoCache.filter(
      (e) => e.adult_num === adults && e.stay_date >= checkin && e.stay_date <= last,
    )
  }
  const { data, error } = await supabase
    .from('price_history')
    .select('room_grade,stay_date,adult_num,min_total,is_available,recorded_at')
    .eq('adult_num', adults)
    .gte('stay_date', checkin)
    .lte('stay_date', last)
    .order('recorded_at', { ascending: true })
  if (error) return []
  return (data ?? []) as HistoryEvent[]
}
