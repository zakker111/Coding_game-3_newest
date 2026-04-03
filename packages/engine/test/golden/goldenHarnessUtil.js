import { stableStringify } from '../_util/stableStringify.js'
import { sha256Hex } from '../_util/sha256.js'

const SLOT_IDS = /** @type {const} */ (['BOT1', 'BOT2', 'BOT3', 'BOT4'])

export function extractTextFence(md) {
  const normalized = String(md).replace(/\r\n?/g, '\n')
  const m = normalized.match(/```text\s*\n([\s\S]*?)\n?```/)
  if (!m) throw new Error('No ```text code fence found')
  return `${m[1]}\n`
}

export function parseLoadoutFromSourceHeader(sourceText) {
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

    if (headerCommentLinesSeen >= 3) break
  }

  if (!sawDirective) return [null, null, null]
  return loadout
}

export function buildMatchBotsFromSources(sourceTexts) {
  if (!Array.isArray(sourceTexts) || sourceTexts.length !== 4) {
    throw new Error(`expected 4 bot sources; got: ${JSON.stringify(sourceTexts)}`)
  }

  return SLOT_IDS.map((slotId, i) => ({
    slotId,
    sourceText: sourceTexts[i],
    loadout: parseLoadoutFromSourceHeader(sourceTexts[i]),
  }))
}

function stripBotsSourceText(bots) {
  return (bots ?? []).map((b) => {
    if (!b || typeof b !== 'object') return b
    if (!('sourceText' in b)) return b

    const { sourceText: _sourceText, ...rest } = b
    return rest
  })
}

export function hashReplayCore(replay) {
  const core = {
    schemaVersion: replay.schemaVersion,
    rulesetVersion: replay.rulesetVersion,
    matchSeed: replay.matchSeed,
    tickCap: replay.tickCap,
    ticksPerSecond: replay.ticksPerSecond,
    bots: stripBotsSourceText(replay.bots),
    state: replay.state,
    events: replay.events,
  }

  return sha256Hex(stableStringify(core))
}

export function hashTicks(arr) {
  return arr.map((v) => sha256Hex(stableStringify(v)))
}
