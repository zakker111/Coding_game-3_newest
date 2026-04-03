import { promises as fs } from 'node:fs'
import path from 'node:path'

/**
 * @param {string} s
 */
export function normalizeNewlines(s) {
  return s.replace(/\r\n?/g, '\n')
}

/**
 * @param {string} md
 */
export function extractTextFence(md) {
  const normalized = normalizeNewlines(md)
  const m = normalized.match(/```text\s*\n([\s\S]*?)\n```/)
  if (!m) throw new Error('No ```text code fence found')

  // The source in markdown fences always ends with a newline right before the closing ```.
  // Our regex excludes that trailing newline, so we restore it to match the exact script text.
  return `${m[1]}\n`
}

/**
 * Parse an example bot's display name from its script.
 *
 * Historically the first line was:
 *   `; bot0 — Aggressive Skirmisher (starter)`
 *
 * The Workshop now supports (and our examples may include) locked header directives
 * like `;@slot1 BULLET` as the first non-blank lines. These are still comments, and
 * should be skipped when parsing the display name.
 *
 * @param {string} sourceText
 */
export function parseDisplayNameFromScript(sourceText) {
  const lines = normalizeNewlines(sourceText).split('\n')

  // Only consider the leading comment header for the display name. This avoids
  // accidentally matching a mid-script comment that happens to look like
  // `; bot3 — ...`.
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // Skip Workshop "locked header directive" comment lines.
    // Accept both `;@slot1 ...` and `; @slot1 ...`.
    if (/^;\s*@/i.test(trimmed)) continue

    // Once we hit a non-comment instruction, the header is over.
    if (!trimmed.startsWith(';')) break

    const m = trimmed.match(/^;\s*bot\d+\s*—\s*(.+?)\s*$/)
    if (m) return m[1]
  }

  const preview = lines.slice(0, 6).join('\n')
  throw new Error(
    `Unable to parse display name from script header (expected a line like "; bot3 — My Bot"). Header preview:\n${preview}`
  )
}

/**
 * @param {string} repoRoot
 */
export async function readExampleBot(repoRoot, botId) {
  const mdPath = path.join(repoRoot, 'examples', `${botId}.md`)
  const md = await fs.readFile(mdPath, 'utf8')
  const sourceText = extractTextFence(md)

  return {
    id: botId,
    displayName: parseDisplayNameFromScript(sourceText),
    sourceText,
  }
}

/**
 * Escape a string for inclusion in a JavaScript template literal.
 *
 * @param {string} s
 */
function escapeForTemplateLiteral(s) {
  return s.replace(/`/g, '\\`').replace(/\$\{/g, '\\${')
}

/**
 * @param {string} s
 */
function escapeForSingleQuotedJsString(s) {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

/**
 * @param {string} repoRoot
 */
export async function generateWorkshopExampleBotsJs(repoRoot) {
  const exampleDir = path.join(repoRoot, 'examples')
  const entries = await fs.readdir(exampleDir)

  const botIds = entries
    .filter((f) => /^bot\d+\.md$/.test(f))
    .map((f) => f.replace(/\.md$/, ''))
    .sort((a, b) => {
      const an = Number(a.replace(/^bot/, ''))
      const bn = Number(b.replace(/^bot/, ''))
      return an - bn
    })

  const bots = []
  for (const botId of botIds) bots.push(await readExampleBot(repoRoot, botId))

  const lines = []
  lines.push('// Copied from /examples/*.md (scripts only) for the buildless deploy workshop.')
  lines.push('// Keep this file in sync with `/examples/`.')
  lines.push('')
  lines.push('export const EXAMPLE_BOTS = {')

  for (let i = 0; i < bots.length; i++) {
    const bot = bots[i]
    const escaped = escapeForTemplateLiteral(normalizeNewlines(bot.sourceText))

    lines.push(`  ${bot.id}: {`)
    lines.push(`    id: '${bot.id}',`)
    lines.push(`    displayName: '${escapeForSingleQuotedJsString(bot.displayName)}',`)
    lines.push(`    sourceText: \`${escaped}\`,`)
    lines.push('  },')

    if (i !== bots.length - 1) lines.push('')
  }

  lines.push('}')
  lines.push('')

  const poolIds = bots.map((b) => b.id).filter((id) => id !== 'bot0')
  const defaultOpponentIds = ['bot2', 'bot3', 'bot4']

  for (const id of defaultOpponentIds) {
    if (!poolIds.includes(id)) throw new Error(`DEFAULT_OPPONENT_EXAMPLE_IDS contains ${id}, but it is not in the pool`)
  }

  lines.push(`export const OPPONENT_EXAMPLE_POOL_IDS = [${poolIds.map((id) => `'${id}'`).join(', ')}]`)
  lines.push(`export const DEFAULT_OPPONENT_EXAMPLE_IDS = [${defaultOpponentIds.map((id) => `'${id}'`).join(', ')}]`)
  lines.push('')

  // Keep a trailing newline (matches repo style in deploy files).
  return lines.join('\n')
}

/**
 * @param {string} repoRoot
 */
export async function syncDeployFiles(repoRoot) {
  const botInstructionsSrc = path.join(repoRoot, 'BotInstructions.md')
  const botInstructionsDst = path.join(repoRoot, 'deploy', 'bot-instructions.md')
  const instructions = await fs.readFile(botInstructionsSrc, 'utf8')
  await fs.writeFile(botInstructionsDst, instructions)

  const exampleBotsDst = path.join(repoRoot, 'deploy', 'workshop', 'exampleBots.js')
  const generated = await generateWorkshopExampleBotsJs(repoRoot)
  await fs.writeFile(exampleBotsDst, generated)

  const sampleReplaySrc = path.join(repoRoot, 'packages', 'replay', 'src', 'generateSampleReplay.js')
  const sampleReplayDst = path.join(repoRoot, 'deploy', 'replay', 'generateSampleReplay.js')
  const sampleReplay = await fs.readFile(sampleReplaySrc, 'utf8')
  await fs.writeFile(sampleReplayDst, sampleReplay)
}

/**
 * @param {string} repoRoot
 */
export async function checkDeployFiles(repoRoot) {
  const botInstructionsSrc = path.join(repoRoot, 'BotInstructions.md')
  const botInstructionsDst = path.join(repoRoot, 'deploy', 'bot-instructions.md')

  const src = normalizeNewlines(await fs.readFile(botInstructionsSrc, 'utf8')).trimEnd()
  const dst = normalizeNewlines(await fs.readFile(botInstructionsDst, 'utf8')).trimEnd()
  if (src !== dst) {
    throw new Error('deploy/bot-instructions.md is out of sync with BotInstructions.md')
  }

  const sampleReplaySrc = path.join(repoRoot, 'packages', 'replay', 'src', 'generateSampleReplay.js')
  const sampleReplayDst = path.join(repoRoot, 'deploy', 'replay', 'generateSampleReplay.js')

  const sampleSrc = normalizeNewlines(await fs.readFile(sampleReplaySrc, 'utf8')).trimEnd()
  const sampleDst = normalizeNewlines(await fs.readFile(sampleReplayDst, 'utf8')).trimEnd()
  if (sampleSrc !== sampleDst) {
    throw new Error('deploy/replay/generateSampleReplay.js is out of sync with packages/replay/src/generateSampleReplay.js')
  }

  const exampleBotsPath = path.join(repoRoot, 'deploy', 'workshop', 'exampleBots.js')
  const exampleBotsJs = normalizeNewlines(await fs.readFile(exampleBotsPath, 'utf8'))

  /**
   * @param {string} s
   */
  function unescapeTemplateLiteralBody(s) {
    return s.replace(/\\`/g, '`').replace(/\\\$\{/g, '${')
  }

  /**
   * @param {string} s
   */
  function unescapeSingleQuotedJsString(s) {
    return s.replace(/\\\\/g, '\\').replace(/\\'/g, "'")
  }

  /** @type {Record<string, { displayName: string, sourceText: string }>} */
  const parsed = {}

  const re =
    /\n\s*(bot\d+):\s*\{[\s\S]*?displayName:\s*'((?:\\'|[^'])*)',[\s\S]*?sourceText:\s*`([\s\S]*?)`,[\s\S]*?\n\s*\},/g

  for (const m of exampleBotsJs.matchAll(re)) {
    const botId = m[1]
    parsed[botId] = {
      displayName: unescapeSingleQuotedJsString(m[2]),
      sourceText: unescapeTemplateLiteralBody(m[3]),
    }
  }

  /**
   * @param {string} exportName
   */
  function parseExportedStringArray(exportName) {
    const m = exampleBotsJs.match(new RegExp(`export const ${exportName} = \\[([\\s\\S]*?)\\]`))
    if (!m) throw new Error(`deploy/workshop/exampleBots.js is missing export: ${exportName}`)

    const body = m[1]
    const items = []
    for (const mm of body.matchAll(/'((?:\\'|[^'])*)'/g)) items.push(unescapeSingleQuotedJsString(mm[1]))
    return items
  }

  const exampleDir = path.join(repoRoot, 'examples')
  const exampleEntries = await fs.readdir(exampleDir)

  const expectedBotIds = exampleEntries
    .filter((f) => /^bot\d+\.md$/.test(f))
    .map((f) => f.replace(/\.md$/, ''))
    .sort((a, b) => {
      const an = Number(a.replace(/^bot/, ''))
      const bn = Number(b.replace(/^bot/, ''))
      return an - bn
    })

  const expectedBots = []
  for (const botId of expectedBotIds) expectedBots.push(await readExampleBot(repoRoot, botId))

  const expectedIds = new Set(expectedBots.map((b) => b.id))
  for (const botId of Object.keys(parsed)) {
    if (!expectedIds.has(botId)) throw new Error(`deploy/workshop/exampleBots.js has unexpected bot id: ${botId}`)
  }

  const expectedPoolIds = expectedBots.map((b) => b.id).filter((id) => id !== 'bot0')
  const defaultOpponentIds = ['bot2', 'bot3', 'bot4']

  const poolIdsFromFile = parseExportedStringArray('OPPONENT_EXAMPLE_POOL_IDS')
  const defaultIdsFromFile = parseExportedStringArray('DEFAULT_OPPONENT_EXAMPLE_IDS')

  if (poolIdsFromFile.join(',') !== expectedPoolIds.join(',')) {
    throw new Error('deploy/workshop/exampleBots.js OPPONENT_EXAMPLE_POOL_IDS does not match expected bot list')
  }

  if (defaultIdsFromFile.join(',') !== defaultOpponentIds.join(',')) {
    throw new Error('deploy/workshop/exampleBots.js DEFAULT_OPPONENT_EXAMPLE_IDS does not match expected defaults')
  }

  for (const id of defaultIdsFromFile) {
    if (!poolIdsFromFile.includes(id)) {
      throw new Error(`deploy/workshop/exampleBots.js default opponent ${id} is not in OPPONENT_EXAMPLE_POOL_IDS`)
    }
  }

  for (const b of expectedBots) {
    const got = parsed[b.id]
    if (!got) throw new Error(`deploy/workshop/exampleBots.js is missing ${b.id}`)

    const wantScript = normalizeNewlines(b.sourceText).trimEnd()
    const gotScript = normalizeNewlines(got.sourceText).trimEnd()
    if (wantScript !== gotScript) {
      throw new Error(`deploy/workshop/exampleBots.js script mismatch for ${b.id}`)
    }

    const wantName = b.displayName
    const gotName = got.displayName
    if (wantName !== gotName) {
      throw new Error(`deploy/workshop/exampleBots.js displayName mismatch for ${b.id}`)
    }
  }
}
