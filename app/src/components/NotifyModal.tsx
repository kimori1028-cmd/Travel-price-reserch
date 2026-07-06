import { useState } from 'react'
import { fmtDateJa } from '../lib/dates'
import { gradeDef, type Favorite, type NotifyMode } from '../lib/types'

interface Props {
  fav: Favorite
  onClose: () => void
  onSave: (on: boolean, mode: NotifyMode, threshold: number | null) => void
}

export function NotifyModal({ fav, onClose, onSave }: Props) {
  const g = gradeDef(fav.room_grade)
  const [mode, setMode] = useState<NotifyMode>(
    fav.notify_on_drop ? fav.notify_mode : 'threshold',
  )
  const [amount, setAmount] = useState<string>(
    fav.notify_threshold != null
      ? String(fav.notify_threshold)
      : fav.lowest_total != null
        ? String(fav.lowest_total)
        : fav.price_at_saved != null
          ? String(fav.price_at_saved)
          : '',
  )
  const [error, setError] = useState<string | null>(null)

  const save = () => {
    if (mode === 'threshold') {
      const value = parseInt(amount.replace(/[^\d]/g, ''), 10)
      if (!value || value <= 0) {
        setError('通知する金額を数字で入力してください。')
        return
      }
      onSave(true, 'threshold', value)
    } else {
      onSave(true, 'new_low', null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={onClose}>
      <div
        className="w-full rounded-t-2xl bg-white p-4 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-300" />
        <h2 className="text-base font-bold">値下がりメール通知</h2>
        <div className="mb-3 text-xs text-slate-500">
          {fmtDateJa(fav.checkin_date)}発 {fav.nights}泊 / 大人{fav.adult_num}名{' '}
          <span className={g.color}>{g.label}</span>
        </div>

        <div className="space-y-2">
          <label
            className={`flex items-start gap-2 rounded-xl border p-3 ${
              mode === 'threshold' ? 'border-teal-500 bg-teal-50' : 'border-slate-200'
            }`}
          >
            <input
              type="radio"
              name="mode"
              checked={mode === 'threshold'}
              onChange={() => setMode('threshold')}
              className="mt-0.5 h-4 w-4 accent-teal-600"
            />
            <div className="flex-1">
              <div className="text-sm font-bold">指定金額以下になったら通知</div>
              <div className="mb-2 text-[11px] text-slate-500">
                合計の参考価格が設定額以下になったらメールします。
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  inputMode="numeric"
                  value={amount}
                  onFocus={() => setMode('threshold')}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="例: 280000"
                  className="w-36 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                />
                <span className="text-sm text-slate-500">円以下</span>
              </div>
            </div>
          </label>

          <label
            className={`flex items-start gap-2 rounded-xl border p-3 ${
              mode === 'new_low' ? 'border-teal-500 bg-teal-50' : 'border-slate-200'
            }`}
          >
            <input
              type="radio"
              name="mode"
              checked={mode === 'new_low'}
              onChange={() => setMode('new_low')}
              className="mt-0.5 h-4 w-4 accent-teal-600"
            />
            <div className="flex-1">
              <div className="text-sm font-bold">最安値を更新したら通知</div>
              <div className="text-[11px] text-slate-500">
                これまでの最安値
                {fav.lowest_total != null && `（${fav.lowest_total.toLocaleString('ja-JP')}円）`}
                を下回るたびにメールします。金額の設定は不要です。
              </div>
            </div>
          </label>
        </div>

        {error && <p className="mt-2 text-xs text-rose-500">{error}</p>}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={save}
            className="flex-1 rounded-lg bg-teal-600 py-2.5 font-bold text-white"
          >
            この設定で通知ON
          </button>
          {fav.notify_on_drop && (
            <button
              type="button"
              onClick={() => onSave(false, mode, null)}
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-500"
            >
              通知OFF
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-2 w-full py-1 text-center text-xs text-slate-400"
        >
          キャンセル
        </button>
      </div>
    </div>
  )
}
