import { stayQuote, type PriceIndex } from '../lib/calc'
import { fmtDateJa, fmtDateShort, fmtYen } from '../lib/dates'
import { GRADES, type GradeKey } from '../lib/types'

interface Props {
  index: PriceIndex
  adults: number
  checkin: string
  nights: number
  onClose: () => void
  onAddFavorite: (grade: GradeKey, checkin: string, nights: number, total: number | null) => void
}

export function DayDetail({ index, adults, checkin, nights, onClose, onAddFavorite }: Props) {
  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/40" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-white p-4 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-300" />
        <div className="mb-1 flex items-baseline justify-between">
          <h2 className="text-base font-bold">
            {fmtDateJa(checkin)}発 {nights}泊{nights + 1}日
          </h2>
          <span className="text-xs text-slate-500">大人{adults}名/1室</span>
        </div>
        <p className="mb-3 text-[11px] text-slate-400">
          1泊料金の合算による参考価格です。実際の予約価格は楽天トラベルでご確認ください。
        </p>

        <div className="space-y-3">
          {GRADES.map((g) => {
            const q = stayQuote(index, adults, g.key, checkin, nights)
            const firstRow = q.nights[0]?.row
            return (
              <div key={g.key} className={`rounded-xl border p-3 ${g.bgSoft}`}>
                <div className="flex items-center justify-between">
                  <div className={`text-sm font-bold ${g.color}`}>{g.label}</div>
                  {q.status === 'ok' ? (
                    <div className="text-lg font-bold">{fmtYen(q.total)}</div>
                  ) : q.status === 'unavailable' ? (
                    <div className="text-sm font-bold text-rose-500">満室の夜あり ×</div>
                  ) : (
                    <div className="text-sm text-slate-400">データ未取得</div>
                  )}
                </div>

                {q.status === 'ok' && (
                  <>
                    <div className="mt-2 space-y-0.5 text-xs text-slate-600">
                      {q.nights.map(({ date, row }) => (
                        <div key={date} className="flex justify-between">
                          <span>{fmtDateShort(date)}</span>
                          <span>{row?.min_total != null ? fmtYen(row.min_total) : '-'}</span>
                        </div>
                      ))}
                    </div>
                    {firstRow?.plan_name && (
                      <div className="mt-2 text-[11px] leading-snug text-slate-500">
                        初日プラン: {firstRow.plan_name}
                        {firstRow.with_breakfast != null &&
                          (firstRow.with_breakfast ? '（朝食あり）' : '（朝食なし）')}
                      </div>
                    )}
                    <div className="mt-2 flex gap-2">
                      {firstRow?.reserve_url && (
                        <a
                          href={firstRow.reserve_url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex-1 rounded-lg bg-rose-500 py-2 text-center text-sm font-bold text-white"
                        >
                          楽天トラベルで確認
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => onAddFavorite(g.key, checkin, nights, q.total)}
                        className="rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-600"
                      >
                        ★ 保存
                      </button>
                    </div>
                  </>
                )}
                {q.status !== 'ok' && (
                  <div className="mt-1 text-[11px] text-slate-400">
                    {q.nights
                      .map(
                        ({ date, row }) =>
                          `${fmtDateShort(date)}:${
                            !row ? '未取得' : row.is_available ? '空室あり' : '満室'
                          }`,
                      )
                      .join(' / ')}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-lg border border-slate-300 py-2 text-sm text-slate-500"
        >
          閉じる
        </button>
      </div>
    </div>
  )
}
