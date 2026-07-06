// 日本の祝日判定。内閣府の規則に基づき計算する（春分/秋分は近似式・1980〜2099で有効）。
// ハッピーマンデー・振替休日・国民の休日にも対応。

function pad(n: number): string {
  return String(n).padStart(2, '0')
}
function key(y: number, m1: number, d: number): string {
  return `${y}-${pad(m1)}-${pad(d)}`
}

/** その年 month0(0-11) の nth 番目の月曜の「日」 */
function nthMonday(year: number, month0: number, nth: number): number {
  const firstDow = new Date(Date.UTC(year, month0, 1)).getUTCDay() // 0=日
  const firstMonday = 1 + ((8 - firstDow) % 7)
  return firstMonday + (nth - 1) * 7
}

function vernalEquinox(year: number): number {
  return Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4))
}
function autumnEquinox(year: number): number {
  return Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4))
}

const cache = new Map<number, Set<string>>()

function build(year: number): Set<string> {
  const cached = cache.get(year)
  if (cached) return cached

  // 固定日 + ハッピーマンデー + 春分/秋分（「国民の祝日」）
  const named: [number, number][] = [
    [1, 1], // 元日
    [2, 11], // 建国記念の日
    [2, 23], // 天皇誕生日
    [4, 29], // 昭和の日
    [5, 3], // 憲法記念日
    [5, 4], // みどりの日
    [5, 5], // こどもの日
    [8, 11], // 山の日
    [11, 3], // 文化の日
    [11, 23], // 勤労感謝の日
    [1, nthMonday(year, 0, 2)], // 成人の日
    [7, nthMonday(year, 6, 3)], // 海の日
    [9, nthMonday(year, 8, 3)], // 敬老の日
    [10, nthMonday(year, 9, 2)], // スポーツの日
    [3, vernalEquinox(year)], // 春分の日
    [9, autumnEquinox(year)], // 秋分の日
  ]
  const base = new Set(named.map(([m, d]) => key(year, m, d)))

  const all = new Set(base)

  const iso = (t: number) => new Date(t).toISOString().slice(0, 10)
  const dow = (t: number) => new Date(t).getUTCDay()
  const ms = (isoDate: string) => Date.parse(isoDate + 'T00:00:00Z')
  const DAY = 86400000

  // 国民の休日: 前日・翌日がともに「国民の祝日」で、その日が祝日でない
  for (let t = ms(`${year}-01-01`); t <= ms(`${year}-12-31`); t += DAY) {
    const d = iso(t)
    if (base.has(d)) continue
    if (base.has(iso(t - DAY)) && base.has(iso(t + DAY))) all.add(d)
  }

  // 振替休日: 「国民の祝日」が日曜のとき、その後の最も近い休日でない日
  for (const d of base) {
    if (dow(ms(d)) !== 0) continue
    let t = ms(d) + DAY
    while (all.has(iso(t))) t += DAY
    all.add(iso(t))
  }

  cache.set(year, all)
  return all
}

/** YYYY-MM-DD が日本の祝日か */
export function isHoliday(isoDate: string): boolean {
  const year = Number(isoDate.slice(0, 4))
  return build(year).has(isoDate)
}
