import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { CalendarView } from './components/CalendarView'
import { FavoritesView } from './components/FavoritesView'
import { LoginView } from './components/LoginView'
import { SearchView } from './components/SearchView'
import { SetPasswordView } from './components/SetPasswordView'
import { buildIndex } from './lib/calc'
import { lastUpdated, loadNightlyPrices } from './lib/data'
import {
  addFavorite,
  listFavorites,
  removeFavorite,
  setNotify,
  setShared,
} from './lib/favorites'
import { isDemo, supabase } from './lib/supabase'
import { ADULT_OPTIONS, gradeDef, type Favorite, type GradeKey, type NightlyPrice } from './lib/types'

type Tab = 'calendar' | 'search' | 'favorites'

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'calendar', label: 'カレンダー', icon: '📅' },
  { key: 'search', label: '最安検索', icon: '🔍' },
  { key: 'favorites', label: 'お気に入り', icon: '★' },
]

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(isDemo)
  const [tab, setTab] = useState<Tab>('calendar')
  const [adults, setAdults] = useState(2)
  const [rows, setRows] = useState<NightlyPrice[]>([])
  const [dataError, setDataError] = useState<string | null>(null)
  const [favorites, setFavorites] = useState<Favorite[]>([])
  const [favLoading, setFavLoading] = useState(true)
  const [toast, setToast] = useState<string | null>(null)

  // 招待リンク/パスワード再設定リンクから来た場合はパスワード設定画面を出す
  const [needsPassword, setNeedsPassword] = useState(
    () => /type=(invite|recovery|signup)/.test(window.location.hash),
  )

  // 認証状態の監視
  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'PASSWORD_RECOVERY') setNeedsPassword(true)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const loggedIn = isDemo || !!session
  const userId = session?.user.id ?? null

  // 価格データ・お気に入りのロード
  useEffect(() => {
    if (!loggedIn) return
    loadNightlyPrices()
      .then(setRows)
      .catch((e) => setDataError(String(e.message ?? e)))
  }, [loggedIn])

  const reloadFavorites = useCallback(() => {
    if (!loggedIn) return
    setFavLoading(true)
    listFavorites(userId)
      .then(setFavorites)
      .catch(() => setFavorites([]))
      .finally(() => setFavLoading(false))
  }, [loggedIn, userId])

  useEffect(reloadFavorites, [reloadFavorites])

  const index = useMemo(() => buildIndex(rows), [rows])
  const updated = useMemo(() => lastUpdated(rows), [rows])

  const showToast = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 2500)
  }

  const handleAddFavorite = async (
    grade: GradeKey,
    checkin: string,
    nights: number,
    total: number | null,
  ) => {
    try {
      await addFavorite(userId, {
        room_grade: grade,
        checkin_date: checkin,
        nights,
        adult_num: adults,
        price_at_saved: total,
      })
      showToast(`★ ${gradeDef(grade).short} ${checkin} を保存しました`)
      reloadFavorites()
    } catch (e) {
      showToast(String((e as Error).message ?? e))
    }
  }

  const handleToggleShare = async (fav: Favorite) => {
    try {
      await setShared(fav.id, !fav.is_shared)
      reloadFavorites()
    } catch (e) {
      showToast(String((e as Error).message ?? e))
    }
  }

  const askThreshold = (fav: Favorite): number | null => {
    const suggestion = fav.notify_threshold ?? fav.lowest_total ?? fav.price_at_saved
    const input = window.prompt(
      'いくら以下になったら通知しますか？（円・数字のみ）',
      suggestion != null ? String(suggestion) : '',
    )
    if (input == null) return null
    const value = parseInt(input.replace(/[^\d]/g, ''), 10)
    if (!value || value <= 0) {
      showToast('金額を数字で入力してください')
      return null
    }
    return value
  }

  const handleToggleNotify = async (fav: Favorite) => {
    try {
      if (fav.notify_on_drop) {
        if (window.confirm('値下がり通知をOFFにしますか？\n（キャンセルすると通知金額を変更できます）')) {
          await setNotify(fav.id, false, null)
          showToast('通知をOFFにしました')
        } else {
          const value = askThreshold(fav)
          if (value == null) return
          await setNotify(fav.id, true, value)
          showToast(`📧 ${value.toLocaleString('ja-JP')}円以下になったら通知します`)
        }
      } else {
        const value = askThreshold(fav)
        if (value == null) return
        await setNotify(fav.id, true, value)
        showToast(`📧 ${value.toLocaleString('ja-JP')}円以下になったら通知します`)
      }
      reloadFavorites()
    } catch (e) {
      showToast(String((e as Error).message ?? e))
    }
  }

  const handleRemove = async (fav: Favorite) => {
    if (!window.confirm('このお気に入りを削除しますか？')) return
    try {
      await removeFavorite(fav.id)
      reloadFavorites()
    } catch (e) {
      showToast(String((e as Error).message ?? e))
    }
  }

  if (!authReady) {
    return <div className="py-20 text-center text-sm text-slate-400">読み込み中…</div>
  }
  if (!isDemo && session && needsPassword) {
    return <SetPasswordView onDone={() => setNeedsPassword(false)} />
  }
  if (!loggedIn) {
    return <LoginView />
  }

  return (
    <div className="mx-auto min-h-screen max-w-lg pb-20">
      {/* ヘッダー */}
      <header className="sticky top-0 z-30 border-b border-teal-700/20 bg-teal-700 px-4 pb-2 pt-3 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-bold leading-tight">フサキ価格モニター</h1>
            <div className="text-[10px] text-teal-100">
              フサキビーチリゾート ホテル＆ヴィラズ（石垣島）
              {updated && ` / 更新: ${new Date(updated).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={adults}
              onChange={(e) => setAdults(Number(e.target.value))}
              className="rounded-lg border border-teal-500 bg-teal-600 px-1.5 py-1.5 text-xs text-white"
            >
              {ADULT_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  大人{n}名
                </option>
              ))}
            </select>
            {!isDemo && (
              <button
                type="button"
                onClick={() => supabase?.auth.signOut()}
                className="rounded-lg border border-teal-500 px-2 py-1.5 text-[11px] text-teal-100"
              >
                ログアウト
              </button>
            )}
          </div>
        </div>
      </header>

      {isDemo && (
        <div className="bg-amber-100 px-4 py-1.5 text-[11px] text-amber-700">
          デモモード: Supabase 未接続のためサンプルデータを表示中。お気に入りはこの端末にのみ保存されます。
        </div>
      )}
      {dataError && (
        <div className="bg-rose-100 px-4 py-1.5 text-[11px] text-rose-700">{dataError}</div>
      )}

      <main className="px-3 pt-3">
        {tab === 'calendar' && (
          <CalendarView
            index={index}
            adults={adults}
            updated={updated}
            onAddFavorite={handleAddFavorite}
          />
        )}
        {tab === 'search' && (
          <SearchView index={index} adults={adults} onAddFavorite={handleAddFavorite} />
        )}
        {tab === 'favorites' && (
          <FavoritesView
            index={index}
            favorites={favorites}
            loading={favLoading}
            onToggleShare={handleToggleShare}
            onToggleNotify={handleToggleNotify}
            onRemove={handleRemove}
          />
        )}

        <footer className="mt-6 border-t border-slate-200 pb-4 pt-3 text-center text-[10px] text-slate-400">
          価格は楽天トラベルの1泊料金合算による参考値です。
          <br />
          <a
            href="https://webservice.rakuten.co.jp/"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            Supported by Rakuten Developers
          </a>
        </footer>
      </main>

      {/* トースト */}
      {toast && (
        <div className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-full bg-slate-800 px-4 py-2 text-xs text-white shadow-lg">
          {toast}
        </div>
      )}

      {/* 下部タブ */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-lg">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`flex-1 py-2.5 text-center text-[11px] ${
                tab === t.key ? 'font-bold text-teal-600' : 'text-slate-400'
              }`}
            >
              <div className="text-base leading-none">{t.icon}</div>
              {t.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}
