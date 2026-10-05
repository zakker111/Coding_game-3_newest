import { chromium } from 'playwright'
import crypto from 'node:crypto'

const browser = await chromium.launch({ headless: true })
async function getReplay(url, mode) {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  if (mode === 'app') {
    await page.evaluate(() => window.localStorage.clear())
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: 'Run / Preview' }).click()
    await page.getByRole('button', { name: 'Run / Preview' }).waitFor({ state: 'visible', timeout: 30000 })
  } else {
    await page.waitForSelector('#runBtn')
    await page.click('#runBtn')
    await page.waitForFunction(() => { const el = document.getElementById('runBtn'); return el && !el.disabled }, null, { timeout: 30000 })
  }
  await page.waitForFunction(() => Boolean(globalThis.__NOWT_WORKSHOP_QA__?.getReplay?.()), null, { timeout: 30000 })
  const r = await page.evaluate(() => globalThis.__NOWT_WORKSHOP_QA__.getReplay())
  await ctx.close()
  return r
}
const deploy = await getReplay('http://127.0.0.1:8787/workshop/', 'deploy')
const app = await getReplay('http://127.0.0.1:4173/workshop/', 'app')
await browser.close()

// top-level keys diff
for (const k of new Set([...Object.keys(deploy), ...Object.keys(app)])) {
  const a = JSON.stringify(deploy[k]), b = JSON.stringify(app[k])
  if (a !== b) console.log('DIFF key:', k, '| deploy:', (a||'').slice(0,120), '| app:', (b||'').slice(0,120))
}
if (JSON.stringify(deploy.bots) !== JSON.stringify(app.bots)) {
  console.log('BOTS DIFF:')
  deploy.bots.forEach((bd, i) => {
    const ba = app.bots[i]
    if (JSON.stringify(bd) !== JSON.stringify(ba)) console.log(i, 'deploy:', JSON.stringify(bd).slice(0,200), '\n   app:', JSON.stringify(ba).slice(0,200))
  })
}
