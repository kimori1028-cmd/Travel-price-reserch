import { useState } from 'react'
import { supabase } from '../lib/supabase'

export function LoginView() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supabase) return
    setBusy(true)
    setError(null)
    setNotice(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError('ログインできませんでした。メールアドレスとパスワードを確認してください。')
    setBusy(false)
  }

  const sendReset = async () => {
    if (!supabase) return
    if (!email) {
      setError('先にメールアドレスを入力してください。')
      return
    }
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    })
    setBusy(false)
    if (error) {
      setError(`送信に失敗しました: ${error.message}`)
    } else {
      setNotice('パスワード設定用のメールを送りました。メール内のリンクを開いてください。')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <form onSubmit={signIn} className="w-full max-w-sm rounded-2xl bg-white p-6 shadow">
        <h1 className="mb-1 text-center text-lg font-bold text-teal-700">フサキ価格モニター</h1>
        <p className="mb-5 text-center text-xs text-slate-400">
          身内向けツールです。配布されたアカウントでログインしてください。
        </p>
        <label className="mb-3 block">
          <span className="text-xs font-bold text-slate-500">メールアドレス</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
            autoComplete="email"
          />
        </label>
        <label className="mb-4 block">
          <span className="text-xs font-bold text-slate-500">パスワード</span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
            autoComplete="current-password"
          />
        </label>
        {error && <p className="mb-3 text-xs text-rose-500">{error}</p>}
        {notice && <p className="mb-3 text-xs text-teal-600">{notice}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-teal-600 py-2.5 font-bold text-white disabled:opacity-50"
        >
          {busy ? 'ログイン中…' : 'ログイン'}
        </button>
        <button
          type="button"
          onClick={sendReset}
          disabled={busy}
          className="mt-3 w-full text-center text-xs text-slate-400 underline"
        >
          パスワードを忘れた／設定し直す
        </button>
      </form>
    </div>
  )
}
