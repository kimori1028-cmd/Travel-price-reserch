import { chromium } from 'playwright-core'
const OUT = '/tmp/claude-0/-home-user-Travel-price-reserch/f5f513d1-beb1-5da2-a2b6-fd6def202841/scratchpad'
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  proxy: { server: process.env.HTTPS_PROXY },
})
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, ignoreHTTPSErrors: true })
const page = await ctx.newPage()
// まず通常ページが開けるか(プロキシ経由の外部アクセス確認)
const r = await page.goto('https://package.travel.rakuten.co.jp/anafrt/planList/hotelPlanList?noTomariHotel=38599', { timeout: 60000 }).catch(e => ({ err: String(e) }))
console.log('planList status:', r?.status ? r.status() : r?.err)
console.log('TITLE:', await page.title().catch(()=>'-'))
await page.screenshot({ path: OUT + '/13_planlist.png' })
await browser.close()
