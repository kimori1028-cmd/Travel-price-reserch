import { stayQuote, type PriceIndex } from '../lib/calc'
import { fmtDateJa, fmtMan, fmtYen } from '../lib/dates'
import { rakutenPlanUrl } from '../lib/rakuten'
import { gradeDef, type Favorite } from '../lib/types'

interface Props {
  index: PriceIndex
  favorites: Favorite[]
  loading: boolean
  onToggleShare: (fav: Favorite) => void
  onToggleNotify: (fav: Favorite) => void
  onRemove: (fav: Favorite) => void
}

export function FavoritesView({
  index,
  favorites,
  loading,
  onToggleShare,
  onToggleNotify,
  onRemove,
}: Props) {
  if (loading) {
    return <div className="py-10 text-center text-sm text-slate-400">読み込み中…</div>
  }
  if (favorites.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-slate-400">
        お気に入りはまだありません。
        <br />
        カレンダーや検索結果の「★ 保存」から追加できます。
      </div>
    )
  }

  const mine = favorites.filter((f) => f.is_mine)
  const shared = favorites.filter((f) => !f.is_mine)

  const card = (f: Favorite) => {
    const g = gradeDef(f.room_grade)
    const q = stayQuote(index, f.adult_num, f.room_grade, f.checkin_date, f.nights)
    const current = q.status === 'ok' ? q.total : null
    const diff =
      current != null && f.price_at_saved != null ? current - f.price_at_saved : null
    return (
      <div key={f.id} className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-sm font-bold">
              {fmtDateJa(f.checkin_date)}発 {f.nights}泊 / 大人{f.adult_num}名
            </div>
            <div className={`text-xs font-bold ${g.color}`}>{g.label}</div>
            {!f.is_mine && (
              <div className="mt-0.5 text-[11px] text-slate-400">
                {f.owner_name} さんの共有
              </div>
            )}
          </div>
          <div className="text-right">
            {current != null ? (
              <>
                <div className="text-base font-bold">{fmtYen(current)}</div>
                {diff != null && diff !== 0 && (
                  <div
                    className={`text-[11px] font-bold ${
                      diff > 0 ? 'text-rose-500' : 'text-emerald-600'
                    }`}
                  >
                    保存時から{diff > 0 ? '+' : ''}
                    {diff.toLocaleString('ja-JP')}円
                  </div>
                )}
              </>
            ) : q.status === 'unavailable' ? (
              <div className="text-sm font-bold text-rose-500">満室の夜あり</div>
            ) : (
              <div className="text-xs text-slate-400">価格データなし</div>
            )}
            {f.price_at_saved != null && (
              <div className="text-[11px] text-slate-400">保存時 {fmtYen(f.price_at_saved)}</div>
            )}
            {f.lowest_total != null && (
              <div className="text-[11px] text-emerald-600">
                これまで最安 {fmtYen(f.lowest_total)}
              </div>
            )}
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <a
            href={rakutenPlanUrl(f.checkin_date, f.nights, f.adult_num)}
            target="_blank"
            rel="noreferrer"
            className="flex-1 rounded-lg bg-rose-500 py-1.5 text-center text-xs font-bold text-white"
          >
            楽天トラベルで確認
          </a>
          {f.is_mine && (
            <>
              <button
                type="button"
                onClick={() => onToggleShare(f)}
                className={`rounded-lg border px-2.5 py-1.5 text-xs font-bold ${
                  f.is_shared
                    ? 'border-teal-500 bg-teal-50 text-teal-600'
                    : 'border-slate-300 text-slate-500'
                }`}
              >
                {f.is_shared ? '共有中' : '共有'}
              </button>
              <button
                type="button"
                onClick={() => onToggleNotify(f)}
                title="指定金額以下になったらメール通知"
                className={`rounded-lg border px-2.5 py-1.5 text-xs font-bold ${
                  f.notify_on_drop && f.notify_threshold != null
                    ? 'border-amber-500 bg-amber-50 text-amber-600'
                    : 'border-slate-300 text-slate-500'
                }`}
              >
                {f.notify_on_drop && f.notify_threshold != null
                  ? `📧 ${fmtMan(f.notify_threshold)}以下`
                  : '📧 通知'}
              </button>
              <button
                type="button"
                onClick={() => onRemove(f)}
                className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-500"
              >
                削除
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 pb-4">
      <div>
        <h3 className="mb-2 text-xs font-bold text-slate-500">自分のお気に入り</h3>
        <div className="space-y-2">{mine.map(card)}</div>
        {mine.length === 0 && (
          <div className="text-xs text-slate-400">自分のお気に入りはありません。</div>
        )}
      </div>
      {shared.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-bold text-slate-500">共有されたお気に入り</h3>
          <div className="space-y-2">{shared.map(card)}</div>
        </div>
      )}
      <p className="text-[11px] leading-relaxed text-slate-400">
        ・チェックイン日を過ぎたお気に入りは自動的に削除されます。
        <br />
        ・「📧 通知」で金額を設定すると、参考価格がその金額以下になった時にメールが届きます
        （メール送信の設定がされている場合）。お気に入りの日程は1時間ごとに価格チェックされます。
      </p>
    </div>
  )
}
