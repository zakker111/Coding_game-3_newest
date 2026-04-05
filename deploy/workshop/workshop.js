import { attachArenaRenderer } from './arena.js'
import { DEFAULT_OPPONENT_EXAMPLE_IDS, EXAMPLE_BOTS, OPPONENT_EXAMPLE_POOL_IDS } from './exampleBots.js'

let engineWorker = null
let engineWorkerFailure = null

try {
  engineWorker = new Worker(new URL('./engineRunner.worker.js', import.meta.url), { type: 'module' })
} catch (err) {
  engineWorkerFailure = err instanceof Error ? err : new Error(String(err))
}

let engineRequestId = 0
const pendingEngineRuns = new Map()

function rejectAllPendingEngineRuns(err) {
  for (const pending of pendingEngineRuns.values()) pending.reject(err)
  pendingEngineRuns.clear()
}

function markEngineWorkerFailed(err) {
  if (engineWorkerFailure) return
  engineWorkerFailure = err instanceof Error ? err : new Error(String(err))
  rejectAllPendingEngineRuns(engineWorkerFailure)
}

if (engineWorker) {
  engineWorker.addEventListener('error', (event) => {
    const msg = typeof event?.message === 'string' && event.message ? event.message : 'Engine worker error'
    markEngineWorkerFailed(new Error(msg))
  })

  engineWorker.addEventListener('messageerror', () => {
    markEngineWorkerFailed(new Error('Engine worker message error'))
  })

  engineWorker.addEventListener('message', (event) => {
    const msg = event.data
    if (!msg || typeof msg !== 'object') return

    if (msg.type !== 'RUN_RESULT') return

    const pending = pendingEngineRuns.get(msg.requestId)
    if (!pending) return
    pendingEngineRuns.delete(msg.requestId)

    if (msg.ok) {
      pending.resolve(msg.replay)
    } else {
      pending.reject(new Error(msg.error?.message || 'Engine worker error'))
    }
  })
}

function runMatchInEngineWorker({ seed, tickCap, bots }) {
  if (!engineWorker) {
    return Promise.reject(engineWorkerFailure || new Error('Engine worker unavailable'))
  }
  if (engineWorkerFailure) {
    return Promise.reject(engineWorkerFailure)
  }

  const requestId = ++engineRequestId

  return new Promise((resolve, reject) => {
    pendingEngineRuns.set(requestId, { resolve, reject })
    engineWorker.postMessage({ requestId, seed, tickCap, bots })
  })
}

const SLOT_IDS = ['BOT1', 'BOT2', 'BOT3', 'BOT4']

const LEGACY_DRAFTS_KEY = 'nowt:deploy:drafts:v1'

const MY_BOTS_KEY = 'nowt:deploy:myBots:v1'
const MY_BOTS_NEXT_ID_KEY = 'nowt:deploy:myBotsNextId:v1'
const SELECTED_MY_BOT_ID_KEY = 'nowt:deploy:selectedMyBotId:v1'
const MY_BOT_DRAFTS_KEY = 'nowt:deploy:myBotDrafts:v1'

const OPPONENTS_KEY = 'nowt:deploy:opponents:v1'
const OPPONENT_NONCE_KEY = 'nowt:deploy:opponentNonce:v1'

const SLOT_APPEARANCE = {
  BOT1: { kind: 'COLOR', color: '#4ade80' },
  BOT2: { kind: 'COLOR', color: '#60a5fa' },
  BOT3: { kind: 'COLOR', color: '#f472b6' },
  BOT4: { kind: 'COLOR', color: '#fbbf24' },
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v))
}

/** FNV-1a 32-bit hash of UTF-16 code units. Deterministic across JS engines. */
function fnv1a32(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function loadoutSig(loadout) {
  const a = Array.isArray(loadout) ? loadout : [null, null, null]
  return a
    .slice(0, 3)
    .map((s) => (s == null ? 'EMPTY' : String(s)))
    .join(',')
}

function getReplayHeaderBotsBySlot(replay) {
  const out = {}
  for (const bot of replay?.bots || []) out[bot.slotId] = bot
  return out
}

function getReplayLoadoutIssuesBySlot(replay) {
  const headerBotsBySlot = getReplayHeaderBotsBySlot(replay)
  const out = {}
  for (const slotId of SLOT_IDS) out[slotId] = headerBotsBySlot[slotId]?.loadoutIssues || []
  return out
}

function formatReplayLoadoutIssue(issue) {
  return `${issue.kind} (slot ${issue.slot}${issue.module ? `: ${issue.module}` : ''})`
}

function mixSeed(seed, bots) {
  let h = seed >>> 0
  for (const b of bots) {
    h ^= fnv1a32(`${b.slotId}\n${b.sourceText}\n${loadoutSig(b.loadout)}\n`)
    h = Math.imul(h, 2654435761) >>> 0
  }
  return h >>> 0
}

function computeRunSignature(seed, tickCap, specsBySlot) {
  let h = fnv1a32(`seed:${seed}\ntickCap:${tickCap}\n`)
  for (const slotId of SLOT_IDS) {
    const spec = specsBySlot?.[slotId]
    h ^= fnv1a32(`${slotId}\n${spec?.sourceText ?? ''}\n${loadoutSig(spec?.loadout)}\n`)
    h = Math.imul(h, 2654435761) >>> 0
  }
  return h >>> 0
}

function parseLoadoutFromSource(sourceText) {
  const lines = String(sourceText || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')

  /** @type {[any, any, any]} */
  const loadout = [null, null, null]

  let headerCommentLinesSeen = 0
  let sawDirective = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // Only scan the leading comment header.
    if (!trimmed.startsWith(';')) break

    headerCommentLinesSeen++

    // Accept `;@slot1 BULLET` as well as `;@slot1: BULLET` / `;@slot1 = BULLET`.
    const m = trimmed.match(/^;\s*@slot([123])\s*[:=]?\s*(\S+)\s*$/i)
    if (m) {
      sawDirective = true

      const slot = Number(m[1])
      const raw = String(m[2] || '')
        .trim()
        .toUpperCase()

      if (slot < 1 || slot > 3) continue

      if (raw === 'EMPTY' || raw === 'NONE') loadout[slot - 1] = null
      else if (raw === 'BULLET' || raw === 'SAW' || raw === 'SHIELD' || raw === 'ARMOR') loadout[slot - 1] = raw
      else loadout[slot - 1] = null
    }

    // Workshop contract: only the first 3 non-blank comment lines are considered.
    if (headerCommentLinesSeen >= 3) break
  }

  // If no explicit loadout is declared in the script, default to all-empty.
  if (!sawDirective) return { loadout: [null, null, null], hasDirectives: false }

  return { loadout, hasDirectives: true }
}

function deriveLoadoutForSlot(slotId, sourceText) {
  const parsed = parseLoadoutFromSource(sourceText)
  if (parsed.hasDirectives) return parsed.loadout

  // Deploy workshop fallback: if BOT1 has no directives, give it a weapon so the page is playable.
  if (slotId === 'BOT1') return ['BULLET', null, null]

  return [null, null, null]
}

function createEl(tag, props = {}, children = []) {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') el.className = v
    else if (k === 'text') el.textContent = v
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v)
    else el.setAttribute(k, String(v))
  }
  for (const c of children) el.appendChild(c)
  return el
}

function xorshift32(seed) {
  let x = seed >>> 0
  if (x === 0) x = 0x6d2b79f5

  return () => {
    x ^= x << 13
    x >>>= 0
    x ^= x >>> 17
    x >>>= 0
    x ^= x << 5
    x >>>= 0
    return x >>> 0
  }
}

function shuffleInPlaceDeterministic(arr, nextU32) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = nextU32() % (i + 1)
    const tmp = arr[i]
    arr[i] = arr[j]
    arr[j] = tmp
  }
  return arr
}

function readOpponentNonce() {
  try {
    const raw = localStorage.getItem(OPPONENT_NONCE_KEY)
    const n = raw == null ? 0 : Number(raw)
    return Number.isFinite(n) ? (n >>> 0) : 0
  } catch {
    return 0
  }
}

function writeOpponentNonce(nonce) {
  try {
    localStorage.setItem(OPPONENT_NONCE_KEY, String(nonce >>> 0))
  } catch {
    // ignore
  }
}

function readLegacyDrafts() {
  try {
    const raw = localStorage.getItem(LEGACY_DRAFTS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const next = {}
    for (const id of SLOT_IDS) {
      if (typeof parsed?.[id] === 'string') next[id] = parsed[id]
    }
    return next
  } catch {
    return null
  }
}

function readMyBots() {
  try {
    const raw = localStorage.getItem(MY_BOTS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    const out = []
    for (const b of parsed) {
      if (!b || typeof b !== 'object') continue
      if (typeof b.id !== 'string') continue
      if (typeof b.name !== 'string') continue
      if (typeof b.sourceText !== 'string') continue
      out.push({ id: b.id, name: b.name, sourceText: b.sourceText })
    }
    return out
  } catch {
    return []
  }
}

function writeMyBots(bots) {
  try {
    localStorage.setItem(MY_BOTS_KEY, JSON.stringify(bots))
  } catch {
    // ignore
  }
}

function readMyBotDrafts() {
  try {
    const raw = localStorage.getItem(MY_BOT_DRAFTS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}

    const out = {}
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof k === 'string' && typeof v === 'string') out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

function writeMyBotDrafts(drafts) {
  try {
    localStorage.setItem(MY_BOT_DRAFTS_KEY, JSON.stringify(drafts))
  } catch {
    // ignore
  }
}

function readNextMyBotId() {
  try {
    const raw = localStorage.getItem(MY_BOTS_NEXT_ID_KEY)
    const n = raw == null ? 1 : Number(raw)
    return Number.isFinite(n) ? Math.max(1, Math.floor(n)) : 1
  } catch {
    return 1
  }
}

function writeNextMyBotId(nextId) {
  try {
    localStorage.setItem(MY_BOTS_NEXT_ID_KEY, String(Math.max(1, Math.floor(nextId))))
  } catch {
    // ignore
  }
}

function allocateMyBotId() {
  const n = readNextMyBotId()
  writeNextMyBotId(n + 1)
  return `my${n}`
}

function readSelectedMyBotId() {
  try {
    const raw = localStorage.getItem(SELECTED_MY_BOT_ID_KEY)
    return typeof raw === 'string' ? raw : null
  } catch {
    return null
  }
}

function writeSelectedMyBotId(id) {
  try {
    localStorage.setItem(SELECTED_MY_BOT_ID_KEY, id)
  } catch {
    // ignore
  }
}

function opponentValue(ref) {
  return `${ref.kind}:${ref.id}`
}

function parseOpponentValue(v) {
  if (typeof v !== 'string') return null
  const i = v.indexOf(':')
  if (i <= 0) return null
  const kind = v.slice(0, i)
  const id = v.slice(i + 1)

  if (kind !== 'ex' && kind !== 'my') return null
  if (!id) return null

  return { kind, id }
}

function defaultOpponentSelections() {
  return {
    BOT2: `ex:${DEFAULT_OPPONENT_EXAMPLE_IDS[0]}`,
    BOT3: `ex:${DEFAULT_OPPONENT_EXAMPLE_IDS[1]}`,
    BOT4: `ex:${DEFAULT_OPPONENT_EXAMPLE_IDS[2]}`,
  }
}

function readOpponentSelections() {
  try {
    const raw = localStorage.getItem(OPPONENTS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)

    const out = {}
    for (const slotId of ['BOT2', 'BOT3', 'BOT4']) {
      if (typeof parsed?.[slotId] === 'string') out[slotId] = parsed[slotId]
    }

    if (!out.BOT2 || !out.BOT3 || !out.BOT4) return null
    return out
  } catch {
    return null
  }
}

function writeOpponentSelections(sel) {
  try {
    localStorage.setItem(OPPONENTS_KEY, JSON.stringify(sel))
  } catch {
    // ignore
  }
}

function exampleBotOption(id) {
  const ex = EXAMPLE_BOTS[id]
  return {
    value: `ex:${id}`,
    label: `Example: ${ex?.displayName ?? id}`,
  }
}

function myBotOption(bot) {
  return {
    value: `my:${bot.id}`,
    label: `My: ${bot.name}`,
  }
}

function opponentPoolOptions(myBots, selectedMyBotId) {
  const opts = []

  for (const id of OPPONENT_EXAMPLE_POOL_IDS) opts.push(exampleBotOption(id))

  const my = myBots
    .filter((b) => b.id !== selectedMyBotId)
    .slice()
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  for (const b of my) opts.push(myBotOption(b))

  return opts
}

function normalizeOpponentSelections(sel, options) {
  const optionSet = new Set(options.map((o) => o.value))
  const desired = {
    BOT2: sel.BOT2,
    BOT3: sel.BOT3,
    BOT4: sel.BOT4,
  }

  /** @type {Set<string>} */
  const used = new Set()
  for (const slotId of ['BOT2', 'BOT3', 'BOT4']) {
    const v = desired[slotId]
    if (!optionSet.has(v) || used.has(v)) desired[slotId] = ''
    else used.add(v)
  }

  for (const slotId of ['BOT2', 'BOT3', 'BOT4']) {
    if (desired[slotId]) continue

    const next = options.find((o) => !used.has(o.value))?.value
    if (next) {
      desired[slotId] = next
      used.add(next)
    }
  }

  return desired
}

function ensureInitialMyBots() {
  let myBots = readMyBots()
  if (myBots.length) return myBots

  const legacy = readLegacyDrafts()

  const selected = {
    id: allocateMyBotId(),
    name: 'Starter',
    sourceText: legacy?.BOT1 ?? EXAMPLE_BOTS.bot0.sourceText,
  }

  myBots = [selected]

  if (legacy?.BOT2 && legacy.BOT2 !== EXAMPLE_BOTS.bot2.sourceText) {
    myBots.push({ id: allocateMyBotId(), name: 'Imported (BOT2)', sourceText: legacy.BOT2 })
  }
  if (legacy?.BOT3 && legacy.BOT3 !== EXAMPLE_BOTS.bot3.sourceText) {
    myBots.push({ id: allocateMyBotId(), name: 'Imported (BOT3)', sourceText: legacy.BOT3 })
  }
  if (legacy?.BOT4 && legacy.BOT4 !== EXAMPLE_BOTS.bot4.sourceText) {
    myBots.push({ id: allocateMyBotId(), name: 'Imported (BOT4)', sourceText: legacy.BOT4 })
  }

  writeMyBots(myBots)
  writeSelectedMyBotId(selected.id)

  return myBots
}

function getBotById(bots, id) {
  return bots.find((b) => b.id === id) ?? null
}

function opponentInfoFromValue(v, myBots) {
  const ref = parseOpponentValue(v)
  if (!ref) return null

  if (ref.kind === 'ex') {
    const ex = EXAMPLE_BOTS[ref.id]
    if (!ex) return null
    return { displayName: ex.displayName ?? ref.id, sourceText: ex.sourceText }
  }

  const mb = getBotById(myBots, ref.id)
  if (!mb) return null
  return { displayName: mb.name, sourceText: draftTextForMyBot(mb) }
}

// DOM
const seedInput = document.getElementById('seedInput')
const tickCapInput = document.getElementById('tickCapInput')
const opponent2Select = document.getElementById('opponent2Select')
const opponent3Select = document.getElementById('opponent3Select')
const opponent4Select = document.getElementById('opponent4Select')
const randomizeOpponentsBtn = document.getElementById('randomizeOpponentsBtn')
const runBtn = document.getElementById('runBtn')
const runNotice = document.getElementById('runNotice')
const workshopBuildTag = document.getElementById('workshopBuildTag')

const myBotsSelect = document.getElementById('myBotsSelect')
const myBotNameInput = document.getElementById('myBotNameInput')
const myBotNewBtn = document.getElementById('myBotNewBtn')
const myBotDeleteBtn = document.getElementById('myBotDeleteBtn')
const myBotRenameBtn = document.getElementById('myBotRenameBtn')
const myBotApplyBtn = document.getElementById('myBotApplyBtn')
const myBotApplyStatus = document.getElementById('myBotApplyStatus')
const botEditor = document.getElementById('botEditor')

const inspectTabs = document.getElementById('inspectTabs')
const inspectStats = document.getElementById('inspectStats')
const execBox = document.getElementById('execBox')
const tickEventsList = document.getElementById('tickEventsList')
const tickEventsAllBtn = document.getElementById('tickEventsAllBtn')
const tickEventsRawBtn = document.getElementById('tickEventsRawBtn')
const tickEventsFilterInput = document.getElementById('tickEventsFilterInput')
const tickEventsFilterStatus = document.getElementById('tickEventsFilterStatus')
const eventLog = document.getElementById('eventLog')

const tickLabel = document.getElementById('tickLabel')
const playPauseBtn = document.getElementById('playPauseBtn')
const stepBtn = document.getElementById('stepBtn')
const restartBtn = document.getElementById('restartBtn')
const speedSelect = document.getElementById('speedSelect')
const scrub = document.getElementById('scrub')

const canvas = document.getElementById('arenaCanvas')

const WORKSHOP_BUILD = '0.3.5'
if (workshopBuildTag) workshopBuildTag.textContent = `v${WORKSHOP_BUILD}`

// State
let myBots = ensureInitialMyBots()
let myBotDrafts = readMyBotDrafts()
let selectedMyBotId = readSelectedMyBotId() ?? myBots[0]?.id ?? null
if (!getBotById(myBots, selectedMyBotId) && myBots[0]) selectedMyBotId = myBots[0].id

let opponentSelections = readOpponentSelections() ?? defaultOpponentSelections()

let selectedBotId = 'BOT1'

let replay = null
let playing = false
let speed = 1

let lastRunSignature = 0
let replayStale = false

let lastRunError = ''

let runInProgress = false
let randomizeInProgress = false

let showRawTickEvents = false
let showAllTickEvents = false
let tickEventsFilter = ''

const tickEventGroupCollapsed = {}

// We interpret tick as end-of-tick snapshot index.
// When playing, render tick `t` with alpha in [0,1] interpolating from state[t-1] -> state[t].
let tick = 0
let alpha = 1

let rafId = 0
let lastNow = 0
let accMs = 0

const render = attachArenaRenderer(canvas)

function clearRunError() {
  lastRunError = ''
}

function renderTabs(container, currentId, onSelect, issueCounts = {}) {
  container.innerHTML = ''
  for (const id of SLOT_IDS) {
    const btn = createEl('button', {
      class: `tab ${id === currentId ? 'active' : ''}`,
      'data-id': id,
      type: 'button',
      onClick: () => onSelect(id),
      'aria-label': issueCounts[id] ? `${id} (${issueCounts[id]} loadout warning${issueCounts[id] === 1 ? '' : 's'})` : id,
      title: issueCounts[id] ? `${issueCounts[id]} loadout warning${issueCounts[id] === 1 ? '' : 's'}` : '',
    })
    btn.appendChild(createEl('span', { text: id }))
    if (issueCounts[id]) {
      btn.appendChild(
        createEl('span', {
          text: 'warn',
          style: 'margin-left: 6px; color: #fecaca; font-size: 11px; font-weight: 700',
        }),
      )
    }
    container.appendChild(btn)
  }
}

function setSelectOptions(select, options, selectedValue) {
  select.innerHTML = ''
  for (const opt of options) {
    const o = createEl('option', { value: opt.value, text: opt.label })
    if (opt.value === selectedValue) o.selected = true
    select.appendChild(o)
  }
}

function draftTextForMyBot(bot) {
  if (!bot) return ''
  const d = myBotDrafts?.[bot.id]
  return typeof d === 'string' ? d : bot.sourceText
}

function isMyBotDirty(bot) {
  if (!bot) return false
  return draftTextForMyBot(bot) !== bot.sourceText
}

function updateMyBotDraftUI() {
  const bot = selectedMyBotId ? getBotById(myBots, selectedMyBotId) : null
  const dirty = isMyBotDirty(bot)

  myBotApplyBtn.disabled = !dirty
  myBotApplyStatus.textContent = dirty ? 'Draft (not saved)' : 'Saved'

  runBtn.disabled = runInProgress
  runBtn.textContent = runInProgress ? 'Running…' : 'Run / Preview'

  if (!randomizeInProgress) {
    randomizeOpponentsBtn.disabled = runInProgress
  }

  let notice = ''
  if (lastRunError) {
    notice = lastRunError
  } else if (replay && replayStale) {
    notice = 'Replay is stale — click “Run / Preview” to regenerate.'
  } else if (dirty) {
    notice = 'BOT1 has unsaved edits. Run uses the draft; click “Update bot” to save.'
  }
  runNotice.textContent = notice
}

function updateMyBotsUI() {
  myBots = readMyBots()
  if (!myBots.length) myBots = ensureInitialMyBots()

  const idSet = new Set(myBots.map((b) => b.id))
  let draftsChanged = false
  for (const id of Object.keys(myBotDrafts)) {
    if (idSet.has(id)) continue
    delete myBotDrafts[id]
    draftsChanged = true
  }
  if (draftsChanged) writeMyBotDrafts(myBotDrafts)

  if (!getBotById(myBots, selectedMyBotId) && myBots[0]) selectedMyBotId = myBots[0].id
  if (selectedMyBotId) writeSelectedMyBotId(selectedMyBotId)

  setSelectOptions(
    myBotsSelect,
    myBots.map((b) => ({ value: b.id, label: b.name })),
    selectedMyBotId
  )

  const bot = selectedMyBotId ? getBotById(myBots, selectedMyBotId) : null

  myBotNameInput.value = bot?.name ?? ''
  botEditor.value = bot ? draftTextForMyBot(bot) : ''
  myBotDeleteBtn.disabled = myBots.length <= 1

  updateMyBotDraftUI()
}

function updateOpponentsUI() {
  const pool = opponentPoolOptions(myBots, selectedMyBotId)
  opponentSelections = normalizeOpponentSelections(opponentSelections, pool)
  writeOpponentSelections(opponentSelections)

  setSelectOptions(opponent2Select, pool, opponentSelections.BOT2)
  setSelectOptions(opponent3Select, pool, opponentSelections.BOT3)
  setSelectOptions(opponent4Select, pool, opponentSelections.BOT4)
}

function isRelevantEvent(e, botId) {
  switch (e?.type) {
    case 'BOT_EXEC':
    case 'BOT_MOVED':
    case 'RESOURCE_DELTA':
    case 'BUMP_WALL':
      return e.botId === botId
    case 'BUMP_BOT':
      return e.botId === botId || e.otherBotId === botId
    case 'BULLET_SPAWN':
      return e.ownerBotId === botId || e.targetBotId === botId
    case 'BULLET_HIT':
      return e.victimBotId === botId
    case 'DAMAGE':
      return e.victimBotId === botId || e.sourceBotId === botId
    case 'BOT_DIED':
      return e.victimBotId === botId || e.creditedBotId === botId
    case 'POWERUP_PICKUP':
      return e.botId === botId
    case 'POWERUP_SPAWN':
    case 'POWERUP_DESPAWN':
      return true
    default:
      return false
  }
}

function botDisplayName(replay, botId) {
  const headerBot = (replay?.bots || []).find((b) => b && b.slotId === botId)
  const displayName = headerBot && typeof headerBot.displayName === 'string' ? headerBot.displayName : botId
  return displayName || botId
}

function botLabel(replay, botId) {
  const name = botDisplayName(replay, botId)
  return name && name !== botId ? `${botId} (${name})` : botId
}

function formatTickEventLine(replay, e) {
  const line = { label: e?.type ?? 'EVENT', detail: '', tone: 'muted' }

  switch (e?.type) {
    case 'BOT_EXEC': {
      line.label = `${botLabel(replay, e.botId)} BOT_EXEC`
      line.detail = `${e.instrText}  (pc ${e.pcBefore}→${e.pcAfter}, ${e.result}${e.reason ? `, ${e.reason}` : ''})`
      line.tone = e.result === 'EXECUTED' ? 'good' : e.reason ? 'bad' : 'muted'
      return line
    }
    case 'BOT_MOVED':
      line.label = `${botLabel(replay, e.botId)} moved`
      line.detail = `${e.fromPos.x},${e.fromPos.y} → ${e.toPos.x},${e.toPos.y}${e.dir ? ` (${e.dir})` : ''}`
      return line
    case 'BUMP_WALL':
      line.label = `${botLabel(replay, e.botId)} bumped wall`
      line.detail = `${e.dir} (damage ${e.damage})`
      line.tone = e.damage > 0 ? 'bad' : 'muted'
      return line
    case 'BUMP_BOT':
      line.label = `bump`
      line.detail = `${botLabel(replay, e.botId)} ↔ ${botLabel(replay, e.otherBotId)} (${e.dir})`
      return line
    case 'RESOURCE_DELTA': {
      line.label = `${botLabel(replay, e.botId)} resources`
      const parts = []
      if (e.healthDelta) parts.push(`HP ${e.healthDelta > 0 ? '+' : ''}${e.healthDelta}`)
      if (e.ammoDelta) parts.push(`AMMO ${e.ammoDelta > 0 ? '+' : ''}${e.ammoDelta}`)
      if (e.energyDelta) parts.push(`ENERGY ${e.energyDelta > 0 ? '+' : ''}${e.energyDelta}`)
      line.detail = `${parts.join(', ') || '(no delta)'} (${e.cause})`
      line.tone = e.healthDelta < 0 ? 'bad' : e.healthDelta > 0 ? 'good' : 'muted'
      return line
    }
    case 'DAMAGE':
      line.label = `damage`
      line.detail = `${botLabel(replay, e.victimBotId)} -${e.amount} (${e.source}${e.sourceBotId ? ` by ${botLabel(replay, e.sourceBotId)}` : ''}, ${e.kind})`
      line.tone = 'bad'
      return line
    case 'BOT_DIED':
      line.label = `death`
      line.detail = `${botLabel(replay, e.victimBotId)} died${e.creditedBotId ? ` (credited ${botLabel(replay, e.creditedBotId)})` : ''}`
      line.tone = 'bad'
      return line
    case 'BULLET_SPAWN':
      line.label = `bullet spawn`
      line.detail = `${botLabel(replay, e.ownerBotId)} @ ${e.pos.x},${e.pos.y} vel ${e.vel.x},${e.vel.y}`
      return line
    case 'BULLET_HIT':
      line.label = `bullet hit`
      line.detail = `${e.bulletId} hit ${botLabel(replay, e.victimBotId)} (${e.damage})`
      line.tone = 'bad'
      return line
    case 'BULLET_DESPAWN':
      line.label = `bullet despawn`
      line.detail = `${e.bulletId} (${e.reason})`
      return line
    case 'POWERUP_PICKUP':
      line.label = `powerup pickup`
      line.detail = `${botLabel(replay, e.botId)} picked ${e.powerupType} (${e.loc.sector}/${e.loc.zone})`
      line.tone = 'good'
      return line
    case 'POWERUP_SPAWN':
      line.label = `powerup spawn`
      line.detail = `${e.powerupType} at ${e.loc.sector}/${e.loc.zone}`
      return line
    case 'POWERUP_DESPAWN':
      line.label = `powerup despawn`
      line.detail = `${e.powerupId} (${e.reason})`
      return line
    case 'MATCH_END':
      line.label = 'match end'
      line.detail = e.endReason
      return line
    default:
      line.label = e?.type ?? 'EVENT'
      line.detail = ''
      return line
  }
}

function groupTickEvents(events) {
  const groups = {
    movement: [],
    combat: [],
    resources: [],
    other: [],
  }

  for (const e of events) {
    switch (e?.type) {
      case 'BOT_MOVED':
      case 'BUMP_WALL':
      case 'BUMP_BOT':
        groups.movement.push(e)
        break
      case 'BULLET_SPAWN':
      case 'BULLET_HIT':
      case 'BULLET_DESPAWN':
      case 'DAMAGE':
      case 'BOT_DIED':
        groups.combat.push(e)
        break
      case 'RESOURCE_DELTA':
      case 'POWERUP_PICKUP':
      case 'POWERUP_SPAWN':
      case 'POWERUP_DESPAWN':
        groups.resources.push(e)
        break
      default:
        groups.other.push(e)
        break
    }
  }

  return groups
}

function tickEventSearchText(replay, e) {
  const { label, detail } = formatTickEventLine(replay, e)

  const parts = [label, detail]
  const botIdKeys = ['botId', 'otherBotId', 'ownerBotId', 'targetBotId', 'victimBotId', 'sourceBotId', 'creditedBotId']

  for (const k of botIdKeys) {
    const id = e?.[k]
    if (typeof id !== 'string') continue
    parts.push(botDisplayName(replay, id))
  }

  return parts.filter(Boolean).join(' ')
}

function tickEventMatchesFilter(replay, e, q) {
  const qq = typeof q === 'string' ? q.trim().toLowerCase() : ''
  if (!qq) return true
  return tickEventSearchText(replay, e).toLowerCase().includes(qq)
}

function updateInspector() {
  const replayLoadoutIssuesBySlot = getReplayLoadoutIssuesBySlot(replay)
  const selectedBotLoadoutIssues = replayLoadoutIssuesBySlot[selectedBotId] || []
  const selectedBotLoadoutIssueLines = selectedBotLoadoutIssues.map((issue) => formatReplayLoadoutIssue(issue))

  if (inspectTabs) {
    const issueCounts = {}
    for (const slotId of SLOT_IDS) issueCounts[slotId] = replayLoadoutIssuesBySlot[slotId]?.length || 0
    renderTabs(inspectTabs, selectedBotId, (id) => {
      selectedBotId = id
      updateInspector()
      draw()
    }, issueCounts)
  }

  if (tickEventsAllBtn) tickEventsAllBtn.classList.toggle('active', showAllTickEvents)
  if (tickEventsRawBtn) tickEventsRawBtn.classList.toggle('active', showRawTickEvents)

  if (!replay) {
    if (inspectStats) inspectStats.innerHTML = '<div class="muted">Run a match to inspect bots.</div>'
    if (execBox) execBox.textContent = ''
    if (tickEventsFilterStatus) {
      tickEventsFilterStatus.style.display = 'none'
      tickEventsFilterStatus.textContent = ''
    }

    if (showRawTickEvents) {
      if (tickEventsList) tickEventsList.style.display = 'none'
      if (eventLog) {
        eventLog.style.display = ''
        eventLog.textContent = ''
      }
    } else {
      if (eventLog) eventLog.style.display = 'none'
      if (tickEventsList) {
        tickEventsList.style.display = ''
        tickEventsList.textContent = ''
      }
    }

    return
  }

  const t = clamp(tick, 0, replay.tickCap)
  const snap = replay.state?.[t]
  const bot = snap?.bots?.find((b) => b.botId === selectedBotId)

  if (inspectStats) {
    if (!bot) {
      inspectStats.innerHTML = '<div class="muted">Bot not found in replay.</div>'
    } else {
      inspectStats.innerHTML = ''
      const displayName = botDisplayName(replay, bot.botId)

      inspectStats.appendChild(kvRow('Bot', bot.botId))
      inspectStats.appendChild(kvRow('Name', displayName))
      inspectStats.appendChild(kvRow('HP', String(bot.hp)))
      inspectStats.appendChild(kvRow('Ammo', String(bot.ammo)))
      inspectStats.appendChild(kvRow('Energy', String(bot.energy)))
      inspectStats.appendChild(kvRow('Alive', bot.alive ? 'yes' : 'no'))
      inspectStats.appendChild(kvRow('PC', String(bot.pc)))
      inspectStats.appendChild(kvRow('Pos', `${bot.pos.x.toFixed(3)}, ${bot.pos.y.toFixed(3)}`))
      inspectStats.appendChild(kvRow('Target bullet', bot.targetBulletId || 'none'))

      if (selectedBotLoadoutIssueLines.length) {
        const warningBox = createEl('div', {
          style:
            'margin-top: 12px; padding: 10px; border-radius: 10px; border: 1px solid rgba(248, 113, 113, 0.3); background: rgba(127, 29, 29, 0.16); color: #fecaca',
        })
        warningBox.appendChild(createEl('div', { text: 'Loadout warning', style: 'font-weight: 700; color: var(--text)' }))
        warningBox.appendChild(
          createEl('div', { text: 'Engine normalized this bot’s loadout before running the match.', style: 'margin-top: 6px' }),
        )
        warningBox.appendChild(
          createEl('div', {
            text: `${selectedBotLoadoutIssueLines.length} issue${selectedBotLoadoutIssueLines.length === 1 ? '' : 's'}:`,
            style: 'margin-top: 6px',
          }),
        )
        for (const line of selectedBotLoadoutIssueLines) {
          warningBox.appendChild(createEl('div', { text: line, style: 'margin-top: 4px' }))
        }
        inspectStats.appendChild(warningBox)
      }
    }
  }

  const allTickEvents = replay.events?.[t] ?? []
  const scopedTickEvents = showAllTickEvents ? allTickEvents : allTickEvents.filter((e) => isRelevantEvent(e, selectedBotId))
  const tickEventsQuery = tickEventsFilter.trim()

  // Execution box: show the selected bot's BOT_EXEC, prominently.
  if (execBox) {
    execBox.innerHTML = ''

    const displayName = botDisplayName(replay, selectedBotId)
    execBox.appendChild(
      createEl('div', {
        text: displayName && displayName !== selectedBotId ? `${selectedBotId} — ${displayName}` : selectedBotId,
        style: 'font-weight: 800; color: var(--text)',
      }),
    )

    const exec = scopedTickEvents.find((e) => e?.type === 'BOT_EXEC' && e.botId === selectedBotId)

    if (!exec) {
      execBox.appendChild(createEl('div', { class: 'muted', text: '(no BOT_EXEC)', style: 'margin-top: 6px' }))
    } else {
      execBox.appendChild(
        createEl('div', {
          text: exec.instrText || '(no instruction)',
          style: 'margin-top: 6px; font-weight: 800; color: var(--text)',
        }),
      )
      const meta = createEl('div', { class: 'muted', style: 'margin-top: 6px; line-height: 1.5' })
      meta.appendChild(document.createTextNode(`pc ${exec.pcBefore} → ${exec.pcAfter} • result `))
      meta.appendChild(createEl('strong', { text: exec.result, style: 'color: var(--text)' }))
      if (exec.reason) {
        meta.appendChild(document.createTextNode(' • reason '))
        meta.appendChild(createEl('strong', { text: exec.reason, style: 'color: #fecaca' }))
      }
      execBox.appendChild(meta)
    }
  }

  if (showRawTickEvents) {
    const qRaw = typeof tickEventsFilter === 'string' ? tickEventsFilter.trim() : ''
    const filteredTickEvents = qRaw
      ? scopedTickEvents.filter((e) => tickEventMatchesFilter(replay, e, qRaw))
      : scopedTickEvents

    if (tickEventsFilterStatus) {
      if (qRaw) {
        tickEventsFilterStatus.style.display = ''
        tickEventsFilterStatus.textContent = `${filteredTickEvents.length} / ${scopedTickEvents.length} match “${qRaw}”`
      } else {
        tickEventsFilterStatus.style.display = 'none'
        tickEventsFilterStatus.textContent = ''
      }
    }

    if (tickEventsList) tickEventsList.style.display = 'none'
    if (eventLog) {
      eventLog.style.display = ''

      const nameMap = {}
      for (const hb of replay?.bots || []) {
        if (hb && typeof hb.slotId === 'string' && typeof hb.displayName === 'string') nameMap[hb.slotId] = hb.displayName
      }

      function withNameFields(e) {
        if (!e || typeof e !== 'object') return e

        const out = { ...e }

        const add = (idKey, nameKey) => {
          const id = e[idKey]
          if (typeof id !== 'string') return
          const name = nameMap[id]
          if (typeof name === 'string' && name) out[nameKey] = name
        }

        add('botId', 'botName')
        add('otherBotId', 'otherBotName')
        add('ownerBotId', 'ownerBotName')
        add('targetBotId', 'targetBotName')
        add('victimBotId', 'victimBotName')
        add('sourceBotId', 'sourceBotName')
        add('creditedBotId', 'creditedBotName')

        return out
      }

      if (!qRaw) {
        const eventsWithNames = scopedTickEvents.map(withNameFields)

        eventLog.textContent = scopedTickEvents.length
          ? JSON.stringify(
              {
                scope: showAllTickEvents ? 'all' : selectedBotId,
                nameMap,
                events: scopedTickEvents,
                eventsWithNames,
              },
              null,
              2,
            )
          : '(no events)'
      } else {
        const eventsWithNames = filteredTickEvents.map(withNameFields)

        eventLog.textContent = JSON.stringify(
          {
            scope: showAllTickEvents ? 'all' : selectedBotId,
            nameMap,
            query: qRaw,
            totalCount: scopedTickEvents.length,
            matchedCount: filteredTickEvents.length,
            events: filteredTickEvents,
            eventsWithNames,
          },
          null,
          2,
        )
      }
    }
  } else {
    if (eventLog) eventLog.style.display = 'none'
    if (tickEventsList) {
      tickEventsList.style.display = ''
      tickEventsList.innerHTML = ''

      const listTickEvents = scopedTickEvents.filter((e) => {
        if (e?.type !== 'BOT_EXEC') return true
        if (!showAllTickEvents) return false
        return e.botId !== selectedBotId
      })

      const qRaw = typeof tickEventsFilter === 'string' ? tickEventsFilter.trim() : ''
      const filteredListTickEvents = qRaw
        ? listTickEvents.filter((e) => tickEventMatchesFilter(replay, e, qRaw))
        : listTickEvents

      if (tickEventsFilterStatus) {
        if (!qRaw) {
          tickEventsFilterStatus.style.display = 'none'
          tickEventsFilterStatus.textContent = ''
        } else {
          tickEventsFilterStatus.style.display = ''
          tickEventsFilterStatus.textContent = `${filteredListTickEvents.length} / ${listTickEvents.length} match “${qRaw}”`
        }
      }

      if (!filteredListTickEvents.length) {
        tickEventsList.appendChild(createEl('div', { class: 'muted', text: '(no events)' }))
      } else {
        const groups = groupTickEvents(filteredListTickEvents)

        const order = [
          { key: 'movement', label: 'Movement' },
          { key: 'combat', label: 'Combat' },
          { key: 'resources', label: 'Resources' },
          { key: 'other', label: 'Other' },
        ]

        for (const { key, label } of order) {
          const events = groups[key]
          if (!events.length) continue

          const collapsed = Boolean(tickEventGroupCollapsed[key])

          const header = createEl('div', { style: 'margin: 10px 0 6px; color: rgba(148, 163, 184, 0.95)' })
          header.appendChild(
            createEl('button', {
              type: 'button',
              'data-group': key,
              style:
                'width: 100%; text-align: left; padding: 0; border: 0; background: transparent; color: var(--text); font: inherit; cursor: pointer; font-weight: 800;',
              onClick: () => {
                tickEventGroupCollapsed[key] = !Boolean(tickEventGroupCollapsed[key])
                updateInspector()
              },
              text: `${collapsed ? '▶' : '▼'} ${label} (${events.length})`,
            })
          )
          tickEventsList.appendChild(header)

          if (collapsed) continue

          for (const e of events) {
            const { label, detail, tone } = formatTickEventLine(replay, e)
            const color =
              tone === 'bad'
                ? '#fecaca'
                : tone === 'good'
                  ? 'rgba(134, 239, 172, 0.95)'
                  : 'rgba(148, 163, 184, 0.95)'

            const row = createEl('div', { style: 'margin: 0 0 6px 12px; color: ' + color })
            row.appendChild(createEl('strong', { text: label, style: 'color: var(--text)' }))
            if (detail) row.appendChild(createEl('span', { text: ' ' + detail, style: 'margin-left: 8px' }))
            tickEventsList.appendChild(row)
          }
        }
      }
    }
  }
}

function kvRow(k, v) {
  const row = createEl('div', { class: 'kv-row' })
  row.appendChild(createEl('div', { class: 'kv-k', text: k }))
  row.appendChild(createEl('div', { class: 'kv-v', text: v }))
  return row
}

function updatePlaybackUI() {
  if (!replay) {
    tickLabel.textContent = 'tick 0 / 0'
    scrub.max = '0'
    scrub.value = '0'
    playPauseBtn.disabled = true
    stepBtn.disabled = true
    restartBtn.disabled = true
    return
  }

  tickLabel.textContent = `tick ${tick} / ${replay.tickCap}${replayStale ? ' (stale)' : ''}`
  scrub.max = String(replay.tickCap)
  scrub.value = String(clamp(tick, 0, replay.tickCap))

  if (replayStale) {
    playPauseBtn.disabled = true
    stepBtn.disabled = true
    restartBtn.disabled = true
    scrub.disabled = true
    return
  }

  playPauseBtn.disabled = false
  stepBtn.disabled = playing
  restartBtn.disabled = false
  scrub.disabled = playing
}

function stop() {
  playing = false
  alpha = 1
  cancelAnimationFrame(rafId)
  rafId = 0
  updatePlaybackUI()
}

function currentRunSignature() {
  myBots = readMyBots()
  if (!myBots.length) myBots = ensureInitialMyBots()

  const seed = Number(seedInput.value)
  const tickCap = clamp(Math.floor(Number(tickCapInput.value)), 1, 2000)

  const bot1 = selectedMyBotId ? getBotById(myBots, selectedMyBotId) : null
  const bot1Source = bot1 ? botEditor.value : EXAMPLE_BOTS.bot0.sourceText

  const opp2 = opponentInfoFromValue(opponentSelections.BOT2, myBots)
  const opp3 = opponentInfoFromValue(opponentSelections.BOT3, myBots)
  const opp4 = opponentInfoFromValue(opponentSelections.BOT4, myBots)

  const sources = {
    BOT1: bot1Source,
    BOT2: opp2?.sourceText ?? EXAMPLE_BOTS.bot2.sourceText,
    BOT3: opp3?.sourceText ?? EXAMPLE_BOTS.bot3.sourceText,
    BOT4: opp4?.sourceText ?? EXAMPLE_BOTS.bot4.sourceText,
  }

  const specsBySlot = {
    BOT1: { sourceText: sources.BOT1, loadout: deriveLoadoutForSlot('BOT1', sources.BOT1) },
    BOT2: { sourceText: sources.BOT2, loadout: deriveLoadoutForSlot('BOT2', sources.BOT2) },
    BOT3: { sourceText: sources.BOT3, loadout: deriveLoadoutForSlot('BOT3', sources.BOT3) },
    BOT4: { sourceText: sources.BOT4, loadout: deriveLoadoutForSlot('BOT4', sources.BOT4) },
  }

  return computeRunSignature(seed, tickCap, specsBySlot)
}

function markReplayStale() {
  if (!replay) return

  const nextStale = currentRunSignature() !== lastRunSignature
  if (nextStale === replayStale) return

  replayStale = nextStale
  if (replayStale) stop()

  updateMyBotDraftUI()
  draw()
}

function start() {
  if (!replay) return
  if (playing) return

  if (tick >= replay.tickCap) {
    tick = replay.tickCap
    alpha = 1
    updatePlaybackUI()
    return
  }

  // Start animating state[tick] -> state[tick+1]
  tick = Math.min(replay.tickCap, tick + 1)
  alpha = tick === 0 ? 1 : 0

  playing = true
  lastNow = performance.now()
  accMs = 0

  rafId = requestAnimationFrame(frame)
  updatePlaybackUI()
}

function frame(now) {
  if (!replay || !playing) return

  const dt = now - lastNow
  lastNow = now

  const tps = replay.ticksPerSecond || 1
  const tickMs = 1000 / tps

  accMs += dt * speed

  const steps = Math.floor(accMs / tickMs)
  if (steps > 0) {
    accMs -= steps * tickMs
    tick = Math.min(replay.tickCap, tick + steps)
  }

  alpha = clamp(accMs / tickMs, 0, 1)

  if (tick >= replay.tickCap && alpha >= 1) {
    tick = replay.tickCap
    alpha = 1
    stop()
  }

  draw()

  rafId = requestAnimationFrame(frame)
}

function draw() {
  if (!replay) {
    render.renderEmpty()
    updateInspector()
    updatePlaybackUI()
    return
  }

  const a = playing ? alpha : 1
  render.renderReplayFrame(replay, tick, a, selectedBotId)
  updateInspector()
  updatePlaybackUI()
}

function stepOnce() {
  if (!replay) return
  stop()
  tick = Math.min(replay.tickCap, tick + 1)
  alpha = 1
  draw()
}

function restart() {
  if (!replay) return
  stop()
  tick = 0
  alpha = 1
  draw()
}

function seekTo(t) {
  if (!replay) return
  stop()
  tick = clamp(Math.floor(t), 0, replay.tickCap)
  alpha = 1
  draw()
}

async function run() {
  stop()
  clearRunError()

  myBots = readMyBots()
  if (!myBots.length) myBots = ensureInitialMyBots()

  const seed = Number(seedInput.value)
  const tickCap = clamp(Math.floor(Number(tickCapInput.value)), 1, 2000)

  const bot1 = selectedMyBotId ? getBotById(myBots, selectedMyBotId) : null
  const bot1Source = bot1 ? botEditor.value : EXAMPLE_BOTS.bot0.sourceText

  const opp2 = opponentInfoFromValue(opponentSelections.BOT2, myBots)
  const opp3 = opponentInfoFromValue(opponentSelections.BOT3, myBots)
  const opp4 = opponentInfoFromValue(opponentSelections.BOT4, myBots)

  const sources = {
    BOT1: bot1Source,
    BOT2: opp2?.sourceText ?? EXAMPLE_BOTS.bot2.sourceText,
    BOT3: opp3?.sourceText ?? EXAMPLE_BOTS.bot3.sourceText,
    BOT4: opp4?.sourceText ?? EXAMPLE_BOTS.bot4.sourceText,
  }

  const specsBySlot = {
    BOT1: { sourceText: sources.BOT1, loadout: deriveLoadoutForSlot('BOT1', sources.BOT1) },
    BOT2: { sourceText: sources.BOT2, loadout: deriveLoadoutForSlot('BOT2', sources.BOT2) },
    BOT3: { sourceText: sources.BOT3, loadout: deriveLoadoutForSlot('BOT3', sources.BOT3) },
    BOT4: { sourceText: sources.BOT4, loadout: deriveLoadoutForSlot('BOT4', sources.BOT4) },
  }

  const botsForMix = SLOT_IDS.map((slotId) => ({
    slotId,
    sourceText: specsBySlot[slotId].sourceText ?? '',
    loadout: specsBySlot[slotId].loadout,
  }))
  const mixed = mixSeed(seed, botsForMix)

  const headerBots = [
    {
      slotId: 'BOT1',
      displayName: bot1?.name ?? 'BOT1',
      appearance: SLOT_APPEARANCE.BOT1,
      sourceText: specsBySlot.BOT1.sourceText,
      loadout: specsBySlot.BOT1.loadout,
    },
    {
      slotId: 'BOT2',
      displayName: opp2?.displayName ?? 'BOT2',
      appearance: SLOT_APPEARANCE.BOT2,
      sourceText: specsBySlot.BOT2.sourceText,
      loadout: specsBySlot.BOT2.loadout,
    },
    {
      slotId: 'BOT3',
      displayName: opp3?.displayName ?? 'BOT3',
      appearance: SLOT_APPEARANCE.BOT3,
      sourceText: specsBySlot.BOT3.sourceText,
      loadout: specsBySlot.BOT3.loadout,
    },
    {
      slotId: 'BOT4',
      displayName: opp4?.displayName ?? 'BOT4',
      appearance: SLOT_APPEARANCE.BOT4,
      sourceText: specsBySlot.BOT4.sourceText,
      loadout: specsBySlot.BOT4.loadout,
    },
  ]

  try {
    const replayFromWorker = await runMatchInEngineWorker({
      seed: mixed,
      tickCap,
      bots: headerBots.map((b) => ({ slotId: b.slotId, sourceText: b.sourceText, loadout: b.loadout })),
    })

    // Preserve engine-normalized loadout + loadoutIssues (if any), but keep the
    // Workshop UI's displayName/appearance.
    const mergedHeaderBots = (replayFromWorker.bots || []).map((engineBot) => {
      const uiBot = headerBots.find((b) => b.slotId === engineBot.slotId)
      if (!uiBot) return engineBot
      return {
        ...engineBot,
        displayName: uiBot.displayName,
        appearance: uiBot.appearance,
        sourceText: uiBot.sourceText,
      }
    })

    replay = { ...replayFromWorker, bots: mergedHeaderBots }
    lastRunSignature = computeRunSignature(seed, tickCap, specsBySlot)
    replayStale = false

    tick = 0
    alpha = 1

    draw()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    lastRunError = `Run failed: ${message}`
    updateMyBotDraftUI()
    draw()
  }
}

function randomizeOpponents() {
  const pool = opponentPoolOptions(myBots, selectedMyBotId)

  const before = {
    BOT2: opponentSelections.BOT2,
    BOT3: opponentSelections.BOT3,
    BOT4: opponentSelections.BOT4,
  }

  const nonce = readOpponentNonce()
  const bot1 = selectedMyBotId ? getBotById(myBots, selectedMyBotId) : null

  const seed =
    (Number(seedInput.value) >>> 0) ^
    fnv1a32(bot1 ? botEditor.value : '') ^
    fnv1a32(bot1?.id ?? '') ^
    nonce

  const nextU32 = xorshift32(seed)
  const values = shuffleInPlaceDeterministic(pool.map((p) => p.value), nextU32).slice(0, 3)

  const same = values[0] === before.BOT2 && values[1] === before.BOT3 && values[2] === before.BOT4
  if (same) {
    values.push(values.shift())
  }

  opponentSelections = {
    ...opponentSelections,
    BOT2: values[0],
    BOT3: values[1],
    BOT4: values[2],
  }

  writeOpponentNonce((nonce + 1) >>> 0)
  writeOpponentSelections(opponentSelections)

  updateOpponentsUI()
}

// Wire up UI
if (inspectTabs) {
  renderTabs(inspectTabs, selectedBotId, (id) => {
    selectedBotId = id
    updateInspector()
    draw()
  }, {})
}

if (tickEventsAllBtn) {
  tickEventsAllBtn.addEventListener('click', () => {
    showAllTickEvents = !showAllTickEvents
    updateInspector()
  })
}

if (tickEventsRawBtn) {
  tickEventsRawBtn.addEventListener('click', () => {
    showRawTickEvents = !showRawTickEvents
    updateInspector()
  })
}

if (tickEventsFilterInput) {
  tickEventsFilter = tickEventsFilterInput.value

  tickEventsFilterInput.addEventListener('input', () => {
    tickEventsFilter = tickEventsFilterInput.value
    updateInspector()
  })
}

seedInput.addEventListener('input', () => {
  clearRunError()
  markReplayStale()
  updateMyBotDraftUI()
})

tickCapInput.addEventListener('input', () => {
  clearRunError()
  markReplayStale()
  updateMyBotDraftUI()
})

myBotsSelect.addEventListener('change', () => {
  clearRunError()
  selectedMyBotId = myBotsSelect.value
  writeSelectedMyBotId(selectedMyBotId)
  updateMyBotsUI()
  updateOpponentsUI()
  markReplayStale()
})

myBotRenameBtn.addEventListener('click', () => {
  clearRunError()
  const bot = selectedMyBotId ? getBotById(myBots, selectedMyBotId) : null
  if (!bot) return

  const name = myBotNameInput.value.trim() || 'Untitled'

  const next = myBots.map((b) => (b.id === bot.id ? { ...b, name } : b))
  writeMyBots(next)
  updateMyBotsUI()
  updateOpponentsUI()
})

myBotNewBtn.addEventListener('click', () => {
  clearRunError()
  const id = allocateMyBotId()
  const name = `Bot ${id}`

  const next = [...myBots, { id, name, sourceText: EXAMPLE_BOTS.bot0.sourceText }]
  writeMyBots(next)

  selectedMyBotId = id
  writeSelectedMyBotId(id)

  updateMyBotsUI()
  updateOpponentsUI()
  markReplayStale()
})

myBotDeleteBtn.addEventListener('click', () => {
  clearRunError()
  const bot = selectedMyBotId ? getBotById(myBots, selectedMyBotId) : null
  if (!bot) return
  if (myBots.length <= 1) return

  if (!confirm(`Delete "${bot.name}"?`)) return

  const next = myBots.filter((b) => b.id !== bot.id)
  writeMyBots(next)

  if (myBotDrafts[bot.id] != null) {
    delete myBotDrafts[bot.id]
    writeMyBotDrafts(myBotDrafts)
  }

  selectedMyBotId = next[0]?.id ?? null
  if (selectedMyBotId) writeSelectedMyBotId(selectedMyBotId)

  updateMyBotsUI()
  updateOpponentsUI()
  markReplayStale()
})

myBotApplyBtn.addEventListener('click', () => {
  clearRunError()
  const bot = selectedMyBotId ? getBotById(myBots, selectedMyBotId) : null
  if (!bot) return

  const nextText = botEditor.value

  const next = myBots.map((b) => (b.id === bot.id ? { ...b, sourceText: nextText } : b))
  writeMyBots(next)

  if (myBotDrafts[bot.id] != null) {
    delete myBotDrafts[bot.id]
    writeMyBotDrafts(myBotDrafts)
  }

  updateMyBotsUI()
  updateOpponentsUI()
})

botEditor.addEventListener('input', () => {
  clearRunError()
  const bot = selectedMyBotId ? getBotById(myBots, selectedMyBotId) : null
  if (!bot) return

  const nextText = botEditor.value

  if (nextText === bot.sourceText) {
    if (myBotDrafts[bot.id] != null) {
      delete myBotDrafts[bot.id]
      writeMyBotDrafts(myBotDrafts)
    }
  } else {
    myBotDrafts[bot.id] = nextText
    writeMyBotDrafts(myBotDrafts)
  }

  markReplayStale()
  updateMyBotDraftUI()
})

opponent2Select.addEventListener('change', () => {
  clearRunError()
  opponentSelections.BOT2 = opponent2Select.value
  updateOpponentsUI()
  markReplayStale()
  updateMyBotDraftUI()
})

opponent3Select.addEventListener('change', () => {
  clearRunError()
  opponentSelections.BOT3 = opponent3Select.value
  updateOpponentsUI()
  markReplayStale()
  updateMyBotDraftUI()
})

opponent4Select.addEventListener('change', () => {
  clearRunError()
  opponentSelections.BOT4 = opponent4Select.value
  updateOpponentsUI()
  markReplayStale()
  updateMyBotDraftUI()
})

randomizeOpponentsBtn.addEventListener('click', () => {
  clearRunError()
  randomizeInProgress = true
  runInProgress = true

  randomizeOpponentsBtn.disabled = true
  randomizeOpponentsBtn.textContent = 'Randomizing…'
  updateMyBotDraftUI()

  Promise.resolve()
    .then(() => randomizeOpponents())
    .then(run)
    .catch((err) => console.error(err))
    .finally(() => {
      randomizeInProgress = false
      runInProgress = false

      randomizeOpponentsBtn.disabled = false
      randomizeOpponentsBtn.textContent = 'Randomize opponents'
      updateMyBotDraftUI()
    })
})

runBtn.addEventListener('click', () => {
  clearRunError()
  runInProgress = true
  updateMyBotDraftUI()

  Promise.resolve()
    .then(run)
    .catch((err) => console.error(err))
    .finally(() => {
      runInProgress = false
      updateMyBotDraftUI()
    })
})

playPauseBtn.addEventListener('click', () => {
  if (!replay) return
  if (playing) stop()
  else start()
  draw()
})

stepBtn.addEventListener('click', () => stepOnce())
restartBtn.addEventListener('click', () => restart())

speedSelect.addEventListener('change', () => {
  speed = Number(speedSelect.value) || 1
})

scrub.addEventListener('input', () => {
  seekTo(Number(scrub.value))
})

// Initial render
updateMyBotsUI()
updateOpponentsUI()
draw()
