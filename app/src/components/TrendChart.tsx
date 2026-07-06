import { useMemo } from 'react'
import type { TrendPoint } from '../lib/trend'

interface Props {
  points: TrendPoint[]
  /** 現在時刻まで線を伸ばすための終端 (epoch ms) */
  now: number
}

const W = 320
const H = 64
const PAD = { top: 8, right: 8, bottom: 8, left: 8 }

/**
 * 価格推移のステップ・スパークライン（単一系列）。
 * 最安点・最高点にのみマーカーを置く（selective direct labels は親側でテキスト表示）。
 */
export function TrendChart({ points, now }: Props) {
  const geom = useMemo(() => {
    const vals = points.map((p) => p.total).filter((v): v is number => v != null)
    if (vals.length === 0) return null
    const minV = Math.min(...vals)
    const maxV = Math.max(...vals)
    const t0 = points[0].t
    const t1 = Math.max(now, points[points.length - 1].t)
    const spanT = Math.max(t1 - t0, 1)
    const spanV = Math.max(maxV - minV, 1)
    const x = (t: number) => PAD.left + ((t - t0) / spanT) * (W - PAD.left - PAD.right)
    const y = (v: number) => PAD.top + ((maxV - v) / spanV) * (H - PAD.top - PAD.bottom)

    // ステップ線: 値は次の変化まで水平に続く
    const segments: string[] = []
    let d = ''
    for (let i = 0; i < points.length; i++) {
      const p = points[i]
      const nextT = i + 1 < points.length ? points[i + 1].t : t1
      if (p.total == null) {
        if (d) segments.push(d)
        d = ''
        continue
      }
      const x1 = x(p.t)
      const x2 = x(nextT)
      const yy = y(p.total)
      d += d ? ` L ${x1} ${yy}` : `M ${x1} ${yy}`
      d += ` L ${x2} ${yy}`
    }
    if (d) segments.push(d)

    const minPt = points.find((p) => p.total === minV)
    const maxPt = points.find((p) => p.total === maxV)
    return { segments, x, y, minV, maxV, minPt, maxPt }
  }, [points, now])

  if (!geom) return null

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-16 w-full"
      role="img"
      aria-label="価格推移"
    >
      {geom.segments.map((d, i) => (
        <path
          key={i}
          d={d}
          fill="none"
          stroke="#64748b"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}
      {geom.maxPt && geom.maxPt.total != null && geom.maxV !== geom.minV && (
        <circle
          cx={geom.x(geom.maxPt.t)}
          cy={geom.y(geom.maxV)}
          r={4}
          fill="#e11d48"
          stroke="#ffffff"
          strokeWidth={2}
        />
      )}
      {geom.minPt && geom.minPt.total != null && (
        <circle
          cx={geom.x(geom.minPt.t)}
          cy={geom.y(geom.minV)}
          r={4}
          fill="#059669"
          stroke="#ffffff"
          strokeWidth={2}
        />
      )}
    </svg>
  )
}
