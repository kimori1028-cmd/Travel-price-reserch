import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** Supabase 未設定ならデモモード（サンプルデータ + 端末内お気に入り）で動く */
export const isDemo = !url || !anonKey

export const supabase: SupabaseClient | null = isDemo
  ? null
  : createClient(url!, anonKey!)
