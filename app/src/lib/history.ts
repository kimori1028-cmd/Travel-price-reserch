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

async function loadDemo(): Promise<HistoryEvent[]> {
  if (!demoCache) {
    try {
      const res = await fetch(import.meta.env.BASE_URL + 'demo-history.json')
      demoCache = res.ok ? ((await res.json()) as HistoryEvent[]) : []
    } catch {
      demoCache = []
    }
  }
  return demoCache
}

/** 宿泊日 from〜to（両端含む）の価格履歴（変化イベント）を全グレード分ロードする */
export async function loadHistoryRange(
  from: string,
  to: string,
  adults: number,
): Promise<HistoryEvent[]> {
  if (isDemo || !supabase) {
    const all = await loadDemo()
    return all.filter(
      (e) => e.adult_num === adults && e.stay_date >= from && e.stay_date <= to,
    )
  }
  const { data, error } = await supabase
    .from('price_history')
    .select('room_grade,stay_date,adult_num,min_total,is_available,recorded_at')
    .eq('adult_num', adults)
    .gte('stay_date', from)
    .lte('stay_date', to)
    .order('recorded_at', { ascending: true })
  if (error) return []
  return (data ?? []) as HistoryEvent[]
}

/** 指定の発日・泊数・人数に関わる価格履歴を全グレード分ロードする */
export function loadHistory(
  checkin: string,
  nights: number,
  adults: number,
): Promise<HistoryEvent[]> {
  return loadHistoryRange(checkin, addDays(checkin, nights - 1), adults)
}
