import { addDays } from './dates'

const HOTEL_NO = '38599'

/**
 * 楽天トラベルのプラン一覧ページURL（チェックイン/アウト日・人数・1室入り）。
 * APIの reserveUrl は1泊検索の条件で飛んでしまうため、正しい泊数で組み立てる。
 */
export function rakutenPlanUrl(checkin: string, nights: number, adults: number): string {
  const checkout = addDays(checkin, nights)
  const [y1, m1, d1] = checkin.split('-').map(Number)
  const [y2, m2, d2] = checkout.split('-').map(Number)
  const params = new URLSearchParams({
    hid_isHojin: '0',
    hid_isDated: '0',
    f_dai: 'japan',
    f_chu: 'okinawa',
    f_shou: 'ritou',
    f_no: HOTEL_NO,
    f_nen1: String(y1),
    f_tuki1: String(m1),
    f_hi1: String(d1),
    f_nen2: String(y2),
    f_tuki2: String(m2),
    f_hi2: String(d2),
    f_otona_su: String(adults),
    f_heya_su: '1',
    f_flg: 'PLAN',
  })
  return `https://hotel.travel.rakuten.co.jp/hotelinfo/plan/${HOTEL_NO}?${params.toString()}`
}
