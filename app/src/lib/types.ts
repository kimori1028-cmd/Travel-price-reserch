export type GradeKey = 'villa_standard' | 'superior_twin' | 'patio_superior_twin'

export interface GradeDef {
  key: GradeKey
  label: string
  short: string
  /** Tailwind クラス（タブ・バッジ用） */
  color: string
  bgSoft: string
}

export const GRADES: GradeDef[] = [
  {
    key: 'villa_standard',
    label: 'ヴィラスタンダード',
    short: 'ヴィラ',
    color: 'text-emerald-700',
    bgSoft: 'bg-emerald-50 border-emerald-300',
  },
  {
    key: 'superior_twin',
    label: 'スーペリアツイン',
    short: 'スーペリア',
    color: 'text-sky-700',
    bgSoft: 'bg-sky-50 border-sky-300',
  },
  {
    key: 'patio_superior_twin',
    label: 'パティオスーペリアツイン',
    short: 'パティオ',
    color: 'text-violet-700',
    bgSoft: 'bg-violet-50 border-violet-300',
  },
]

export function gradeDef(key: string): GradeDef {
  return GRADES.find((g) => g.key === key) ?? GRADES[0]
}

export interface NightlyPrice {
  room_grade: GradeKey
  stay_date: string
  adult_num: number
  min_total: number | null
  plan_name: string | null
  room_name: string | null
  with_breakfast: boolean | null
  reserve_url: string | null
  is_available: boolean
  fetched_at: string
}

export interface Favorite {
  id: string
  owner_id: string
  room_grade: GradeKey
  checkin_date: string
  nights: number
  adult_num: number
  note: string | null
  price_at_saved: number | null
  lowest_total: number | null
  notify_on_drop: boolean
  is_shared: boolean
  created_at: string
  /** 表示用（profiles から解決） */
  owner_name?: string
  is_mine?: boolean
}

export const NIGHT_OPTIONS = [3, 4] as const
export const ADULT_OPTIONS = [1, 2, 3, 4] as const
