import { isDemo, supabase } from './supabase'
import type { Favorite, GradeKey, NotifyMode } from './types'

const LS_KEY = 'fusaki_favorites_v1'

export interface NewFavorite {
  room_grade: GradeKey
  checkin_date: string
  nights: number
  adult_num: number
  price_at_saved: number | null
}

function loadLocal(): Favorite[] {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]') as Favorite[]
  } catch {
    return []
  }
}

function saveLocal(favs: Favorite[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(favs))
}

export async function listFavorites(userId: string | null): Promise<Favorite[]> {
  if (isDemo || !supabase) {
    return loadLocal().map((f) => ({ ...f, is_mine: true, owner_name: 'この端末' }))
  }
  const { data, error } = await supabase
    .from('favorites')
    .select('*')
    .order('checkin_date', { ascending: true })
  if (error) throw new Error(`お気に入りの取得に失敗: ${error.message}`)
  const favs = (data ?? []) as Favorite[]

  const ownerIds = [...new Set(favs.map((f) => f.owner_id))]
  const names = new Map<string, string>()
  if (ownerIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id,display_name')
      .in('id', ownerIds)
    for (const p of profiles ?? []) names.set(p.id, p.display_name)
  }
  return favs.map((f) => ({
    ...f,
    is_mine: f.owner_id === userId,
    owner_name: names.get(f.owner_id) ?? '不明',
  }))
}

export async function addFavorite(userId: string | null, fav: NewFavorite): Promise<void> {
  if (isDemo || !supabase) {
    const favs = loadLocal()
    favs.push({
      ...fav,
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      owner_id: 'local',
      note: null,
      lowest_total: fav.price_at_saved,
      notify_on_drop: false,
      notify_mode: 'threshold',
      notify_threshold: null,
      is_shared: false,
      created_at: new Date().toISOString(),
    })
    saveLocal(favs)
    return
  }
  const { error } = await supabase
    .from('favorites')
    .insert({ ...fav, owner_id: userId, lowest_total: fav.price_at_saved })
  if (error) throw new Error(`お気に入りの追加に失敗: ${error.message}`)
}

export async function setNotify(
  id: string,
  on: boolean,
  mode: NotifyMode,
  threshold: number | null,
): Promise<void> {
  // 設定変更時は「通知済み価格」をリセットして、次に条件を満たせば必ず通知されるようにする
  const patch = {
    notify_on_drop: on,
    notify_mode: mode,
    notify_threshold: mode === 'threshold' ? threshold : null,
    last_notified_total: null,
  }
  if (isDemo || !supabase) {
    saveLocal(loadLocal().map((f) => (f.id === id ? { ...f, ...patch } : f)))
    return
  }
  const { error } = await supabase.from('favorites').update(patch).eq('id', id)
  if (error) throw new Error(`通知設定の変更に失敗: ${error.message}`)
}

export async function setShared(id: string, shared: boolean): Promise<void> {
  if (isDemo || !supabase) return
  const { error } = await supabase.from('favorites').update({ is_shared: shared }).eq('id', id)
  if (error) throw new Error(`共有設定の変更に失敗: ${error.message}`)
}

export async function removeFavorite(id: string): Promise<void> {
  if (isDemo || !supabase) {
    saveLocal(loadLocal().filter((f) => f.id !== id))
    return
  }
  const { error } = await supabase.from('favorites').delete().eq('id', id)
  if (error) throw new Error(`お気に入りの削除に失敗: ${error.message}`)
}
