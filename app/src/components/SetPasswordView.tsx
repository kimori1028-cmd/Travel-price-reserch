import { useState } from 'react'
import { supabase } from '../lib/supabase'

interface Props {
  onDone: () => void
}

/** 招待リンク/再設定リンクから遷移してきたユーザーの新パスワード設定画面 */
export function SetPasswordView({ onDone }: Props) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supabase) return
    if (password.length < 8) {
      setError('パスワードは8文字以上にしてください。')
      return
    }
    if (password !== confirm) {
      setError('確認用のパスワードが一致しません。')
      return
    }
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) {
      setError(`設定に失敗しました: ${error.message}`)
      return
    }
    window.location.hash = ''
    onDone()
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl bg-white p-6 shadow">
        <h1 className="mb-1 text-center text-lg font-bold text-teal-700">パスワードの設定</h1>
        <p className="mb-5 text-center text-xs text-slate-400">
          今後のログインに使うパスワードを決めてください。
        </p>
        <label className="mb-3 block">
          <span className="text-xs font-bold text-slate-500">新しいパスワード（8文字以上）</span>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
            autoComplete="new-password"
          />
        </label>
        <label className="mb-4 block">
          <span className="text-xs font-bold text-slate-500">新しいパスワード（確認）</span>
          <input
            type="password"
            required
            minLength={8}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
            autoComplete="new-password"
          />
        </label>
        {error && <p className="mb-3 text-xs text-rose-500">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-teal-600 py-2.5 font-bold text-white disabled:opacity-50"
        >
          {busy ? '設定中…' : 'この内容で設定する'}
        </button>
      </form>
    </div>
  )
}
