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

export interface TrendStats {
  min: number
  max: number
  /** 最安値をつけた時刻(epoch ms) */
  minAt: number
  /** 最高値をつけた時刻(epoch ms) */
  maxAt: number
}

export function trendStats(points: TrendPoint[]): TrendStats | null {
  const valued = points.filter((p): p is TrendPoint & { total: number } => p.total != null)
  if (valued.length === 0) return null
  let minP = valued[0]
  let maxP = valued[0]
  for (const p of valued) {
    if (p.total < minP.total) minP = p
    if (p.total > maxP.total) maxP = p
  }
  return { min: minP.total, max: maxP.total, minAt: minP.t, maxAt: maxP.t }
}

export interface TrendChange {
  /** 変化が起きた時刻(epoch ms) */
  t: number
  /** 変化前のN泊合計。null = それまで満室/不明 */
  from: number | null
  /** 変化後のN泊合計。null = 満室/不明になった */
  to: number | null
  /** to - from（両方が金額のときのみ数値、それ以外は null） */
  diff: number | null
}

/**
 * ステップ状の推移点から「いつ・いくらから・いくらに変わったか」の
 * 変化イベント列を作る。最新の変化が先頭になるよう新しい順で返す。
 */
export function trendChanges(points: TrendPoint[]): TrendChange[] {
  const changes: TrendChange[] = []
  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1].total
    const to = points[i].total
    if (from === to) continue
    const diff = from != null && to != null ? to - from : null
    changes.push({ t: points[i].t, from, to, diff })
  }
  return changes.reverse()
}

export interface TrendDayChange {
  /** その日の最後の変化時刻(epoch ms) */
  t: number
  /** JSTの日付 YYYY-MM-DD */
  date: string
  /** その日の最初の変化前のN泊合計（＝前日終値）。null = 満室/不明 */
  from: number | null
  /** その日の最後の変化後のN泊合計（＝その日の終値）。null = 満室/不明 */
  to: number | null
  /** to - from（その日1日の正味の変動。両方が金額のときのみ数値） */
  diff: number | null
}

/** JSTでの日付キー YYYY-MM-DD */
function jstDateKey(ms: number): string {
  const d = new Date(ms + 9 * 3600 * 1000)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
    d.getUTCDate(),
  ).padStart(2, '0')}`
}

/**
 * 変化イベントを「同じ日はまとめて」1行にする。
 * 各日について「その日の始値(最初の変化前) → 終値(最後の変化後)」と
 * 1日の正味の差額を出す。新しい日が先頭になるよう新しい順で返す。
 */
export function trendDailyChanges(points: TrendPoint[]): TrendDayChange[] {
  const out: TrendDayChange[] = []
  // trendChanges は新しい順。同日は連続するので先頭=その日の最新。
  for (const c of trendChanges(points)) {
    const date = jstDateKey(c.t)
    const last = out[out.length - 1]
    if (last && last.date === date) {
      // より古い同日変化: その日の始値を遡って更新
      last.from = c.from
      last.diff = last.from != null && last.to != null ? last.to - last.from : null
    } else {
      out.push({ t: c.t, date, from: c.from, to: c.to, diff: c.diff })
    }
  }
  // 1日の中で上下して正味ゼロになった日は除外（動きなしと同義）
  return out.filter((d) => d.from !== d.to)
}

export interface RecentChange {
  dir: 'up' | 'down'
  /** 変動幅に応じた矢印の本数（1〜3） */
  arrows: number
  diff: number
}

/**
 * 直近の更新でN泊合計が値上がり/値下がりしたかを返す。
 * latestMs（データの最終更新時刻）から windowDays 以内に起きた変化のみ対象。
 * 変動率で矢印を 1本(≥1%)/2本(≥5%)/3本(≥10%) に段階付けする。
 */
export function recentTotalChange(
  points: TrendPoint[],
  latestMs: number,
  windowDays = 2,
): RecentChange | null {
  if (points.length < 2) return null
  const last = points[points.length - 1]
  const prev = points[points.length - 2]
  if (last.total == null || prev.total == null || prev.total === 0) return null
  if (latestMs - last.t > windowDays * 86400 * 1000) return null
  const diff = last.total - prev.total
  if (diff === 0) return null
  const pct = Math.abs(diff) / prev.total
  const arrows = pct >= 0.1 ? 3 : pct >= 0.05 ? 2 : 1
  return { dir: diff > 0 ? 'up' : 'down', arrows, diff }
}
