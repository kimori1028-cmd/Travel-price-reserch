import type { HistoryEvent } from './history'

export interface TrendPoint {
  /** epoch ms */
  t: number
  /** N泊合計。null = その時点で満室/不明の夜あり */
  total: number | null
}

/**
 * 各泊の変化イベント（価格が変わった時だけ記録）から、
 * N泊合計の推移（ステップ状の時系列）を復元する。
 */
export function buildTrend(events: HistoryEvent[], nightDates: string[]): TrendPoint[] {
  const byNight = new Map<string, HistoryEvent[]>()
  for (const d of nightDates) byNight.set(d, [])
  for (const e of events) byNight.get(e.stay_date)?.push(e)

  // どれかの泊に記録が1件も無ければ推移は出せない
  for (const d of nightDates) {
    if ((byNight.get(d) ?? []).length === 0) return []
  }
  for (const list of byNight.values()) {
    list.sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))
  }

  // 全泊の記録が出そろった時点以降のタイムラインを作る
  const startT = Math.max(
    ...nightDates.map((d) => Date.parse(byNight.get(d)![0].recorded_at)),
  )
  const times = new Set<number>()
  for (const list of byNight.values()) {
    for (const e of list) {
      const t = Date.parse(e.recorded_at)
      times.add(Math.max(t, startT))
    }
  }
  const timeline = [...times].sort((a, b) => a - b)

  const points: TrendPoint[] = []
  for (const t of timeline) {
    let total: number | null = 0
    for (const d of nightDates) {
      const list = byNight.get(d)!
      let latest: HistoryEvent | undefined
      for (const e of list) {
        if (Date.parse(e.recorded_at) <= t) latest = e
        else break
      }
      if (!latest || !latest.is_available || latest.min_total == null) {
        total = null
        break
      }
      total += latest.min_total
    }
    const prev = points[points.length - 1]
    if (!prev || prev.total !== total) points.push({ t, total })
  }
  return points
}

export function trendStats(points: TrendPoint[]): { min: number; max: number } | null {
  const vals = points.map((p) => p.total).filter((v): v is number => v != null)
  if (vals.length === 0) return null
  return { min: Math.min(...vals), max: Math.max(...vals) }
}
