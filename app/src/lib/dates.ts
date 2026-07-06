export const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']

/** JSTでの今日 (YYYY-MM-DD) */
export function todayISO(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)
}

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** 0=日曜 〜 6=土曜 */
export function weekdayOf(iso: string): number {
  return new Date(iso + 'T00:00:00Z').getUTCDay()
}

export function fmtDateJa(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `${y}年${m}月${d}日(${WEEKDAY_LABELS[weekdayOf(iso)]})`
}

export function fmtDateShort(iso: string): string {
  const [, m, d] = iso.split('-').map(Number)
  return `${m}/${d}(${WEEKDAY_LABELS[weekdayOf(iso)]})`
}

/**
 * 月カレンダーのグリッド（日曜始まり・週ごと）。
 * セルは YYYY-MM-DD、月外は null。
 */
export function monthGrid(year: number, month0: number): (string | null)[][] {
  const first = new Date(Date.UTC(year, month0, 1))
  const daysInMonth = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate()
  const startWd = first.getUTCDay()
  const weeks: (string | null)[][] = []
  let week: (string | null)[] = Array(startWd).fill(null)
  for (let day = 1; day <= daysInMonth; day++) {
    week.push(
      `${year}-${String(month0 + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    )
    if (week.length === 7) {
      weeks.push(week)
      week = []
    }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null)
    weeks.push(week)
  }
  return weeks
}

export function fmtYen(n: number): string {
  return n.toLocaleString('ja-JP') + '円'
}

/** カレンダーセル用の短い金額表記（万円単位） */
export function fmtMan(n: number): string {
  const man = n / 10000
  const s = man >= 100 ? Math.round(man).toString() : man.toFixed(1).replace(/\.0$/, '')
  return `${s}万`
}
