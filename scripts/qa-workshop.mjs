import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function parseArgs(argv) {
  const baseUrls = ['http://127.0.0.1:8787']
  let appUrl = ''
  let headless = true
  let serve = false

  let sawUrl = false

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]

    if ((a === '--url' && argv[i + 1]) || a.startsWith('--url=')) {
      const v = a === '--url' ? argv[++i] : a.slice('--url='.length)
      if (!v) continue

      if (!sawUrl) {
        baseUrls.length = 0
        sawUrl = true
      }

      baseUrls.push(v)
      continue
    }

    if ((a === '--app-url' && argv[i + 1]) || a.startsWith('--app-url=')) {
      appUrl = a === '--app-url' ? argv[++i] : a.slice('--app-url='.length)
      continue
    }

    if (a === '--headed') headless = false
    if (a === '--serve') serve = true
  }

  return {
    baseUrls: baseUrls.map((u) => u.replace(/\/$/, '')),
    appUrl: appUrl ? appUrl.replace(/\/$/, '') : '',
    headless,
    serve,
  }
}

function formatLocation(loc) {
  if (!loc) return ''
  const bits = []
  if (loc.url) bits.push(loc.url)
  if (typeof loc.lineNumber === 'number') bits.push(`:${loc.lineNumber}`)
  if (typeof loc.columnNumber === 'number') bits.push(`:${loc.columnNumber}`)
  return bits.join('')
}

function asText(err) {
  if (!err) return ''
  if (typeof err === 'string') return err
  if (err instanceof Error) return err.stack || err.message
  return String(err)
}

async function launchBrowser(headless) {
  try {
    return await chromium.launch({ headless })
  } catch (err) {
    const msg = asText(err)

    if (/libnspr4\.so|missing dependencies|install-deps|host system is missing dependencies/i.test(msg)) {
      throw new Error(
        [
          'Playwright browser runtime is unavailable in this environment.',
          'Install the required browser system libraries, or run `pnpm qa:workshop` in a browser-capable release environment.',
          '',
          msg,
        ].join('\n'),
      )
    }

    throw err
  }
}

function parseBaseUrl(baseUrl) {
  const u = new URL(baseUrl)
  return {
    host: u.hostname,
    port: Number(u.port || (u.protocol === 'https:' ? 443 : 80)),
  }
}

async function waitForServerReady(proc, { timeoutMs }) {
  const startedAt = Date.now()

  let stdout = ''
  let stderr = ''

  return await new Promise((resolve, reject) => {
    const onData = (buf, which) => {
      const s = buf.toString('utf8')
      if (which === 'stdout') stdout += s
      else stderr += s

      if (/Workshop:\s+http:\/\//.test(stdout + stderr)) {
        cleanup()
        resolve(undefined)
      }
    }

    const onExit = (code) => {
      cleanup()
      reject(new Error(`Static server exited early (code=${code ?? 'null'}).\n${stdout}\n${stderr}`))
    }

    const t = setInterval(() => {
      if (Date.now() - startedAt > timeoutMs) {
        cleanup()
        reject(new Error(`Timed out waiting for static server to start.\n${stdout}\n${stderr}`))
      }
    }, 50)

    const cleanup = () => {
      clearInterval(t)
      proc.stdout?.off('data', onStdout)
      proc.stderr?.off('data', onStderr)
      proc.off('exit', onExit)
    }

    const onStdout = (buf) => onData(buf, 'stdout')
    const onStderr = (buf) => onData(buf, 'stderr')

    proc.stdout?.on('data', onStdout)
    proc.stderr?.on('data', onStderr)
    proc.on('exit', onExit)
  })
}

function startStaticServer(baseUrl, root = 'deploy') {
  const { host, port } = parseBaseUrl(baseUrl)

  const proc = spawn(
    process.execPath,
    [path.join(__dirname, 'serve-deploy.mjs'), '--host', host, '--port', String(port), '--root', root],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  )

  return { proc, host, port }
}

async function safeGoto(page, url) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' })
  } catch (err) {
    const msg = asText(err)

    // If the document triggers a client-side redirect early in parsing, Playwright
    // can throw "Navigation ... is interrupted by another navigation".
    if (/interrupted by another navigation/i.test(msg)) return

    throw err
  }
}

function stableStringify(value) {
  if (value == null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v)).join(',')}]`

  const keys = Object.keys(value).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`
}

function normalizeReplayForParity(replay) {
  if (!replay || typeof replay !== 'object') return null

  return {
    schemaVersion: replay.schemaVersion,
    rulesetVersion: replay.rulesetVersion,
    ticksPerSecond: replay.ticksPerSecond,
    matchSeed: replay.matchSeed,
    tickCap: replay.tickCap,
    bots: (replay.bots || []).map((bot) => ({
      slotId: bot.slotId,
      loadout: bot.loadout ?? [null, null, null],
      loadoutIssues: bot.loadoutIssues ?? [],
    })),
    state: replay.state,
    events: replay.events,
  }
}

function hashReplayForParity(replay) {
  return createHash('sha256').update(stableStringify(normalizeReplayForParity(replay))).digest('hex')
}

async function waitForQaReplay(page, timeout = 30_000) {
  await page.waitForFunction(
    () => Boolean(globalThis.__NOWT_WORKSHOP_QA__?.getReplay?.()),
    null,
    { timeout },
  )

  return await page.evaluate(() => globalThis.__NOWT_WORKSHOP_QA__?.getReplay?.() ?? null)
}

async function runWorkshopParityQa({ deployBaseUrl, appBaseUrl, headless }) {
  const browser = await launchBrowser(headless)
  const context = await browser.newContext()
  const deployPage = await context.newPage()
  const appPage = await context.newPage()

  const failures = []
  const assert = (cond, msg) => {
    if (!cond) failures.push(msg)
  }

  console.log(`[qa:workshop] Baseline parity: deploy=${deployBaseUrl}/workshop/ app=${appBaseUrl}/workshop/`)

  await deployPage.goto(`${deployBaseUrl}/workshop/`, { waitUntil: 'domcontentloaded' })
  await deployPage.waitForSelector('#runBtn')
  await deployPage.click('#runBtn')
  await deployPage.waitForFunction(() => {
    const el = document.getElementById('runBtn')
    return Boolean(el && !el.disabled)
  }, null, { timeout: 30_000 })
  const deployReplay = await waitForQaReplay(deployPage)

  await appPage.goto(`${appBaseUrl}/workshop/`, { waitUntil: 'domcontentloaded' })
  await appPage.getByRole('button', { name: 'Run / Preview' }).click()
  await appPage.getByRole('button', { name: 'Run / Preview' }).waitFor({ state: 'visible', timeout: 30_000 })
  const appReplay = await waitForQaReplay(appPage)

  const deployHash = hashReplayForParity(deployReplay)
  const appHash = hashReplayForParity(appReplay)

  assert(Boolean(deployReplay), 'Expected deploy Workshop QA hook to expose a replay after running baseline match.')
  assert(Boolean(appReplay), 'Expected app Workshop QA hook to expose a replay after running baseline match.')
  assert(
    deployHash === appHash,
    `Expected deploy/app baseline replay parity. deploy=${deployHash} app=${appHash}`,
  )

  await browser.close()

  return {
    failures,
    deployHash,
    appHash,
  }
}

async function runWorkshopQa({ baseUrl, headless }) {
  const failures = []

  /** @type {Array<{text: string, location: string}>} */
  const consoleErrors = []
  /** @type {string[]} */
  const pageErrors = []
  /** @type {Array<{url: string, method: string, failure: string}>} */
  const requestFailures = []

  /** @type {Array<{key: string, url: string, status: number, headers: Record<string, string>}>} */
  const keyResourceHeaders = []

  const keyPaths = [
    { key: 'workshop.js', path: '/workshop/workshop.js' },
    { key: 'engineRunner.worker.js', path: '/workshop/engineRunner.worker.js' },
    { key: 'engine/src/index.js', path: '/engine/src/index.js' },
  ]

  /** @type {Set<string>} */
  const recordedKeyPaths = new Set()

  /** @type {Array<{url: string, status: number, contentType: string}>} */
  const suspiciousJsResponses = []

  const assert = (cond, msg) => {
    if (!cond) failures.push(msg)
  }

  const browser = await launchBrowser(headless)
  const context = await browser.newContext()
  const page = await context.newPage()

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return
    consoleErrors.push({ text: msg.text(), location: formatLocation(msg.location()) })
  })

  page.on('pageerror', (err) => {
    pageErrors.push(asText(err))
  })

  page.on('requestfailed', (req) => {
    const f = req.failure()
    requestFailures.push({
      url: req.url(),
      method: req.method(),
      failure: f?.errorText || 'request failed',
    })
  })

  page.on('response', async (res) => {
    const url = res.url()

    let pathname = ''
    try {
      pathname = new URL(url).pathname
    } catch {
      return
    }

    for (const kp of keyPaths) {
      if (pathname !== kp.path) continue
      if (recordedKeyPaths.has(kp.key)) continue

      recordedKeyPaths.add(kp.key)
      keyResourceHeaders.push({
        key: kp.key,
        url,
        status: res.status(),
        headers: res.headers(),
      })
    }

    // Also capture any JS-like resources that came back as HTML or error codes.
    if (!pathname.endsWith('.js') && !pathname.endsWith('.mjs')) return

    const status = res.status()
    const headers = res.headers()
    const contentType = headers['content-type'] || ''

    if (status >= 400 || /\btext\/html\b/i.test(contentType)) {
      suspiciousJsResponses.push({ url, status, contentType })
    }
  })

  const workshopNoSlash = `${baseUrl}/workshop`
  const workshopSlash = `${baseUrl}/workshop/`

  console.log(`[qa:workshop] Loading ${workshopNoSlash}`)
  await safeGoto(page, workshopNoSlash)
  await page.waitForURL('**/workshop/', { timeout: 10_000 })
  await page.waitForSelector('#runBtn')

  assert(
    page.url().endsWith('/workshop/'),
    `Expected redirect to trailing slash, got: ${page.url()} (loaded from ${workshopNoSlash})`
  )

  console.log(`[qa:workshop] Loading ${workshopSlash}`)
  await page.goto(workshopSlash, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#runBtn')

  // (2) Opponent selects populated (and include example bots)
  for (const id of ['opponent2Select', 'opponent3Select', 'opponent4Select']) {
    const texts = await page.locator(`#${id} option`).evaluateAll((els) =>
      els.map((e) => (e.textContent || '').trim())
    )

    assert(texts.length >= 6, `Expected #${id} to have >=6 options, got ${texts.length}.`)
    assert(texts.some((t) => /^Example:\s*/.test(t)), `Expected #${id} to include "Example:" options.`)
  }

  // (3) Run / Preview produces a replay
  const scrubMaxBefore = Number((await page.getAttribute('#scrub', 'max')) || '0')

  console.log('[qa:workshop] Clicking Run / Preview')
  await page.click('#runBtn')

  await page.waitForFunction(() => {
    const el = document.getElementById('runBtn')
    return Boolean(el && !el.disabled)
  }, null, { timeout: 30_000 })
  await page.waitForFunction(() => {
    const el = document.getElementById('scrub')
    return Number(el?.max || 0) > 0
  }, null, { timeout: 30_000 })

  const tickLabelText = (await page.locator('#tickLabel').innerText()).trim()
  const scrubMaxAfter = Number((await page.getAttribute('#scrub', 'max')) || '0')
  const runNoticeText = (await page.locator('#runNotice').innerText()).trim()
  const inspectText = (await page.locator('#inspectStats').innerText()).trim()

  const m = /tick\s+(\d+)\s*\/\s*(\d+)/i.exec(tickLabelText)
  const totalTicks = m ? Number(m[2]) : 0

  assert(totalTicks > 0, `Expected tick cap > 0 after run; got tick label: ${tickLabelText}`)
  assert(scrubMaxAfter > 0, `Expected scrub max > 0 after run; got: ${scrubMaxAfter}`)
  assert(
    scrubMaxAfter !== scrubMaxBefore,
    `Expected scrub max to update after run; before=${scrubMaxBefore} after=${scrubMaxAfter}`
  )
  assert(!/^Run failed:/i.test(runNoticeText), `Expected run to succeed, got notice: ${runNoticeText}`)
  assert(
    /\bHP\b/.test(inspectText) && /\bAmmo\b/.test(inspectText),
    `Expected inspector to show bot stats; got: ${inspectText}`
  )
  assert(/Target bullet/.test(inspectText), `Expected inspector to show Target bullet row; got: ${inspectText}`)

  const targetBulletEvidence = await page.evaluate(() => {
    const scrub = /** @type {HTMLInputElement | null} */ (document.getElementById('scrub'))
    const inspect = document.getElementById('inspectStats')
    const tabButtons = Array.from(document.querySelectorAll('#inspectTabs button[data-id]'))
    if (!scrub || !inspect || !tabButtons.length) return null

    const originalTick = String(scrub.value || '0')
    const originalTab = document.querySelector('#inspectTabs button[data-id][aria-pressed="true"]')?.getAttribute('data-id') || null

    const setTick = (tick) => {
      scrub.value = String(tick)
      scrub.dispatchEvent(new Event('input', { bubbles: true }))
      scrub.dispatchEvent(new Event('change', { bubbles: true }))
    }

    let found = null

    for (let tick = 0; tick <= Number(scrub.max || 0); tick++) {
      setTick(tick)
      for (const tab of tabButtons) {
        tab.click()
        const text = (inspect.textContent || '').replace(/\s+/g, ' ').trim()
        if (/Target bullet/i.test(text) && !/Target bullet\s*none/i.test(text)) {
          const match = /Target bullet\s*([A-Z0-9]+)/i.exec(text)
          const botId = tab.getAttribute('data-id') || 'unknown'
          const targetBulletId = match?.[1] || 'unknown'
          found = { tick, botId, targetBulletId }
          break
        }
      }
      if (found) break
    }

    setTick(originalTick)
    if (originalTab) {
      const tab = document.querySelector(`#inspectTabs button[data-id="${originalTab}"]`)
      if (tab instanceof HTMLElement) tab.click()
    }
    return found
  })

  assert(
    Boolean(targetBulletEvidence?.targetBulletId),
    `Expected at least one inspected bot/tick to expose a non-empty Target bullet value; got: ${JSON.stringify(targetBulletEvidence)}`
  )

  // (4) Tick events filter + raw output (basic smoke)
  await page.waitForSelector('#tickEventsFilterInput')
  await page.waitForSelector('#tickEventsFilterStatus')

  // Show all events so we reliably have BOT_EXEC entries for other bots.
  await page.click('#tickEventsAllBtn')
  await page.waitForFunction(() => {
    const t = document.getElementById('tickEventsList')?.textContent || ''
    return t.length > 0
  })

  const filterInput = page.locator('#tickEventsFilterInput')

  await filterInput.fill('BOT_EXEC')
  await page.waitForFunction(() => {
    const t = document.getElementById('tickEventsList')?.textContent || ''
    return t.includes('BOT_EXEC')
  })

  const filterStatus1 = (await page.locator('#tickEventsFilterStatus').innerText()).trim()
  const listText1 = (await page.locator('#tickEventsList').innerText()).trim()

  assert(/match/i.test(filterStatus1) && /BOT_EXEC/.test(filterStatus1), `Expected filter status to mention BOT_EXEC; got: ${filterStatus1}`)
  assert(/BOT_EXEC/.test(listText1), `Expected filtered tick events list to contain BOT_EXEC; got: ${listText1.slice(0, 200)}`)

  await filterInput.fill('zzzz-no-match')
  await page.waitForFunction(() => {
    const t = document.getElementById('tickEventsList')?.textContent || ''
    return t.includes('(no events)')
  })

  const filterStatus2 = (await page.locator('#tickEventsFilterStatus').innerText()).trim()
  assert(/0\s*\//.test(filterStatus2), `Expected filter status to show 0 matches; got: ${filterStatus2}`)

  // Raw mode should return JSON with query + counts when filter is non-empty.
  await page.click('#tickEventsRawBtn')
  await page.waitForSelector('#eventLog', { state: 'visible' })

  const rawText1 = (await page.locator('#eventLog').innerText()).trim()
  let raw1 = null
  try {
    raw1 = JSON.parse(rawText1)
  } catch (e) {
    assert(false, `Expected raw output to be JSON; got: ${rawText1.slice(0, 200)}`)
  }

  if (raw1) {
    assert(raw1.query === 'zzzz-no-match', `Expected raw JSON query to equal filter input; got: ${raw1.query}`)
    assert(typeof raw1.totalCount === 'number' && raw1.totalCount >= 0, `Expected raw JSON totalCount number; got: ${raw1.totalCount}`)
    assert(raw1.matchedCount === 0, `Expected raw JSON matchedCount=0; got: ${raw1.matchedCount}`)
    assert(Array.isArray(raw1.eventsWithNames), 'Expected raw JSON eventsWithNames to be an array')
  }

  // Clearing filter should restore backward-compatible raw shape (no query/totalCount).
  await filterInput.fill('')
  await page.waitForFunction(() => {
    const t = document.getElementById('tickEventsFilterStatus')
    return !t || t.style.display === 'none' || (t.textContent || '').trim() === ''
  })

  const rawText2 = (await page.locator('#eventLog').innerText()).trim()
  let raw2 = null
  try {
    raw2 = JSON.parse(rawText2)
  } catch (e) {
    assert(false, `Expected raw output to be JSON after clearing filter; got: ${rawText2.slice(0, 200)}`)
  }

  if (raw2) {
    assert(!('query' in raw2), `Expected raw JSON (unfiltered) to omit query; got keys: ${Object.keys(raw2).join(', ')}`)
    assert(Array.isArray(raw2.events) && Array.isArray(raw2.eventsWithNames), 'Expected raw JSON to include events and eventsWithNames arrays')
  }

  // (5) Replay loadout warnings surface in the deploy inspector when the engine normalizes an invalid loadout.
  await page.locator('#myBotsSelect').selectOption({ index: 0 })
  await page.locator('#botEditor').evaluate((el) => {
    el.value = `;@slot1 BULLET
;@slot2 LASER
;@slot3 ARMOR

;@name qa invalid loadout

LABEL LOOP
  WAIT 1
  GOTO LOOP
`
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await page.click('#myBotApplyBtn')
  await page.click('#runBtn')

  await page.waitForFunction(() => {
    const el = document.getElementById('runBtn')
    return Boolean(el && !el.disabled)
  }, null, { timeout: 30_000 })
  await page.waitForFunction(() => {
    const tab = document.querySelector('#inspectTabs button[data-id="BOT1"]')
    const stats = document.getElementById('inspectStats')
    return Boolean(tab?.textContent?.includes('warn') && stats?.textContent?.includes('Loadout warning'))
  }, null, { timeout: 30_000 })

  const warnedTabText = (await page.locator('#inspectTabs button[data-id="BOT1"]').innerText()).trim()
  const warnedInspectText = (await page.locator('#inspectStats').innerText()).trim()

  assert(/warn/i.test(warnedTabText), `Expected BOT1 tab to show warning marker; got: ${warnedTabText}`)
  assert(/Loadout warning/.test(warnedInspectText), `Expected inspector to show loadout warning; got: ${warnedInspectText}`)
  assert(/UNKNOWN_MODULE/.test(warnedInspectText), `Expected inspector warning to include UNKNOWN_MODULE; got: ${warnedInspectText}`)

  // (6) Randomize opponents changes selections and successfully runs
  const beforeOpponents = {
    BOT2: await page.inputValue('#opponent2Select'),
    BOT3: await page.inputValue('#opponent3Select'),
    BOT4: await page.inputValue('#opponent4Select'),
  }

  console.log('[qa:workshop] Clicking Randomize opponents')
  await page.click('#randomizeOpponentsBtn')

  await page.waitForFunction(() => {
    const el = document.getElementById('randomizeOpponentsBtn')
    return Boolean(el && !el.disabled)
  }, null, { timeout: 30_000 })
  await page.waitForFunction(() => {
    const el = document.getElementById('runBtn')
    return Boolean(el && !el.disabled)
  }, null, { timeout: 30_000 })
  await page.waitForFunction(() => {
    const text = document.getElementById('runNotice')?.textContent || ''
    return !/^Run failed:/i.test(text)
  }, null, { timeout: 30_000 })

  const afterOpponents = {
    BOT2: await page.inputValue('#opponent2Select'),
    BOT3: await page.inputValue('#opponent3Select'),
    BOT4: await page.inputValue('#opponent4Select'),
  }

  const changed =
    beforeOpponents.BOT2 !== afterOpponents.BOT2 ||
    beforeOpponents.BOT3 !== afterOpponents.BOT3 ||
    beforeOpponents.BOT4 !== afterOpponents.BOT4

  assert(
    changed,
    `Expected Randomize opponents to change at least one selection; before=${JSON.stringify(beforeOpponents)} after=${JSON.stringify(afterOpponents)}`
  )

  const runNoticeText2 = (await page.locator('#runNotice').innerText()).trim()
  assert(!/^Run failed:/i.test(runNoticeText2), `Expected randomize+run to succeed, got notice: ${runNoticeText2}`)

  await browser.close()

  return {
    failures,
    consoleErrors,
    pageErrors,
    requestFailures,
    keyResourceHeaders,
    suspiciousJsResponses,
  }
}

function printReport({ baseUrl, result }) {
  const prefix = `[qa:workshop] (${baseUrl})`

  if (result.keyResourceHeaders.length) {
    console.log(`\n${prefix} Key resource response headers:`)
    for (const r of result.keyResourceHeaders) {
      console.log(`- ${r.key}: ${r.status} ${r.url}`)
      console.log(JSON.stringify(r.headers, null, 2))
    }
  } else {
    console.log(`\n${prefix} Key resource response headers: (none captured)`) // eslint-disable-line no-console
  }

  if (result.suspiciousJsResponses.length) {
    console.log(`\n${prefix} Suspicious JS responses (status>=400 or text/html):`)
    for (const r of result.suspiciousJsResponses) {
      console.log(`- ${r.status} ${r.url} (content-type: ${r.contentType || '(none)'})`)
    }
  }

  if (result.consoleErrors.length) {
    console.log(`\n${prefix} Console errors:`)
    for (const e of result.consoleErrors) {
      console.log(`- ${e.text}${e.location ? ` (${e.location})` : ''}`)
    }
  }

  if (result.pageErrors.length) {
    console.log(`\n${prefix} Unhandled page errors:`)
    for (const e of result.pageErrors) console.log(`- ${e}`)
  }

  if (result.requestFailures.length) {
    console.log(`\n${prefix} Network request failures:`)
    for (const r of result.requestFailures) {
      console.log(`- ${r.method} ${r.url}: ${r.failure}`)
    }
  }

  if (result.failures.length) {
    console.log(`\n${prefix} FAILURES:`)
    for (const f of result.failures) console.log(`- ${f}`)
  } else {
    console.log(`\n${prefix} OK`)
  }
}

async function main() {
  const { baseUrls, appUrl, headless, serve } = parseArgs(process.argv.slice(2))

  /** @type {import('node:child_process').ChildProcess | null} */
  let serverProc = null
  /** @type {import('node:child_process').ChildProcess | null} */
  let appServerProc = null

  if (serve) {
    const localUrl = baseUrls.find((u) => {
      try {
        const p = new URL(u)
        return p.hostname === '127.0.0.1' || p.hostname === 'localhost'
      } catch {
        return false
      }
    })

    if (!localUrl) {
      throw new Error(`--serve requires a local base URL (got: ${baseUrls.join(', ')})`)
    }

    const started = startStaticServer(localUrl, 'deploy')
    serverProc = started.proc
    await waitForServerReady(serverProc, { timeoutMs: 10_000 })

    if (appUrl) {
      const appStarted = startStaticServer(appUrl, path.join('apps', 'web', 'dist'))
      appServerProc = appStarted.proc
      await waitForServerReady(appServerProc, { timeoutMs: 10_000 })
    }
  }

  try {
    let anyFailures = false

    for (const baseUrl of baseUrls) {
      const result = await runWorkshopQa({ baseUrl, headless })
      printReport({ baseUrl, result })
      if (result.failures.length) anyFailures = true
    }

    if (appUrl) {
      const parityResult = await runWorkshopParityQa({
        deployBaseUrl: baseUrls[0],
        appBaseUrl: appUrl,
        headless,
      })

      const prefix = `[qa:workshop] (parity ${baseUrls[0]} vs ${appUrl})`
      if (parityResult.failures.length) {
        console.log(`\n${prefix} FAILURES:`)
        for (const failure of parityResult.failures) console.log(`- ${failure}`)
      } else {
        console.log(`\n${prefix} OK (${parityResult.deployHash})`)
      }

      if (parityResult.failures.length) anyFailures = true
    }

    if (anyFailures) process.exitCode = 1
  } finally {
    if (serverProc) {
      serverProc.kill('SIGTERM')
    }
    if (appServerProc) {
      appServerProc.kill('SIGTERM')
    }
  }
}

await main()
