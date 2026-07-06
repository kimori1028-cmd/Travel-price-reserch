import { addDays } from './dates'

const HOTEL_NO = '38599'

// ANA楽パックの固定フライト設定（羽田⇔石垣 直行便）
const ANA_OUTBOUND_FLIGHT = '89' // 往路: ANA89 (HND→ISG)
const ANA_RETURN_FLIGHT = '92'   // 復路: ANA92 (ISG→HND)
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
 * ANA楽パック（航空券+宿泊）の旅程ページを、日付・人数・便名
 * （往路ANA89 / 復路ANA92）を選択済みの状態で新しいタブに開く。
 * 楽パックの検索はGETリンク不可（POST必須）のため、フォームを組み立てて送信する。
 */
export function openAnaRakupack(checkin: string, nights: number, adults: number): void {
  const checkout = addDays(checkin, nights)
  const [y1, m1, d1] = checkin.split('-').map(Number)
  const [y2, m2, d2] = checkout.split('-').map(Number)
  const fields: Record<string, string> = {
    searchType: 'plan',
    sortType: '7',
    noPage: '1',
    isResearch: 'false',
    hotelNo: HOTEL_NO,
    noTomariHotel: HOTEL_NO,
    roomClass: '',
    planId: '',
    cdDepartureStationG: '',
    cdArrivalStationG: '',
    cdDepartureStationR: '',
    cdArrivalStationR: '',
    ddp_vs: '',
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
    cdTomariTiikiKen: 'okinawa',
    cdTomariTiiki: 'ritou',
    suOtona: String(adults),
    suSyogakkouKougakunen: '0',
    suSyogakkouTeigakunen: '0',
    suYouziSyokuziFutonTuki: '0',
    suYouziSyokuziNomi: '0',
    suYouziFutonNomi: '0',
    suYouziSyokuziFutonFuyou: '0',
    suNyuYouzi: '0',
    suTomariHeya: '1',
    cdAlliance: '',
    cdAffiliate: '',
    fDptab: '',
    fRcUmu: '0',
    smartFlg: '',
    nsBinOuro: `Y-${ANA_OUTBOUND_FLIGHT}`,
    nsBinHukuro: `Y-${ANA_RETURN_FLIGHT}`,
  }
  const form = document.createElement('form')
  form.action = 'https://package.travel.rakuten.co.jp/anafrt/itinerary/'
  form.method = 'POST'
  form.target = '_blank'
  form.style.display = 'none'
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = name
    input.value = value
    form.appendChild(input)
  }
  document.body.appendChild(form)
  form.submit()
  window.setTimeout(() => form.remove(), 1000)
}
