import { addDays } from './dates'

const HOTEL_NO = '38599'

// ANA楽パックのフライト設定（羽田⇔石垣 直行便）
const ANA_OUTBOUND_FLIGHT = '89' // 往路: ANA89 (羽田8時発)
export type AnaReturnFlight = '90' | '92' // 復路: ANA90(12時発) / ANA92(15時発)
const DEP_AIRPORT = 'HND'
const ARR_AIRPORT = 'ISG'

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

/**
 * ANA楽パック（航空券+宿泊）のプラン一覧URL。
 * 日付・羽田⇔石垣・人数・1室 と希望便（往路ANA89/復路ANA92）を
 * 設定した状態で開く。便の希望はプラン選択後のフライト画面に引き継がれる。
 * ※旅程ページへの直接POSTはセッションが無いと拒否されるため、
 *   正規の入口であるプラン一覧をGETで開く方式にしている。
 */
export function anaRakupackUrl(
  checkin: string,
  nights: number,
  adults: number,
  returnFlight: AnaReturnFlight,
): string {
  const checkout = addDays(checkin, nights)
  const [y1, m1, d1] = checkin.split('-').map(Number)
  const [y2, m2, d2] = checkout.split('-').map(Number)
  const params = new URLSearchParams({
    noTomariHotel: HOTEL_NO,
    dHatuToujyouYy: String(y1),
    dHatuToujyouMm: String(m1),
    dHatuToujyouDd: String(d1),
    dTyakuToujyouYy: String(y2),
    dTyakuToujyouMm: String(m2),
    dTyakuToujyouDd: String(d2),
    cdHatuKuukou: DEP_AIRPORT,
    cdTyakuKuukou: ARR_AIRPORT,
    cdHatuKuukouHukuro: ARR_AIRPORT,
    cdTyakuKuukouHukuro: DEP_AIRPORT,
    dCheckInYy: String(y1),
    dCheckInMm: String(m1),
    dCheckInDd: String(d1),
    dCheckOutYy: String(y2),
    dCheckOutMm: String(m2),
    dCheckOutDd: String(d2),
    suOtona: String(adults),
    suTomariHeya: '1',
    nsBinOuro: `Y-${ANA_OUTBOUND_FLIGHT}`,
    nsBinHukuro: `Y-${returnFlight}`,
  })
  return `https://package.travel.rakuten.co.jp/anafrt/planList/hotelPlanList?${params.toString()}`
}
