import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { canonicalizeSource } from './canonicalizeSource.js'
import { sha256Hex } from './hash.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const defaultExamplesDir = path.resolve(__dirname, '../../../../examples')

export const BUILTIN_BOT_SPECS = [
  {
    exampleId: 'bot0',
    fileName: 'bot0.md',
    ownerUsername: 'builtin',
    name: 'aggressive-skirmisher',
    botId: 'builtin/aggressive-skirmisher',
    displayName: 'Aggressive Skirmisher (starter)',
    loadout: ['BULLET', null, null],
  },
  {
    exampleId: 'bot1',
    fileName: 'bot1.md',
    ownerUsername: 'builtin',
    name: 'zone-patrol-shooter',
    botId: 'builtin/zone-patrol-shooter',
    displayName: 'Zone Patrol Shooter',
    loadout: ['BULLET', null, null],
  },
  {
    exampleId: 'bot2',
    fileName: 'bot2.md',
    ownerUsername: 'builtin',
    name: 'chaser-shooter',
    botId: 'builtin/chaser-shooter',
    displayName: 'Chaser Shooter',
    loadout: ['BULLET', null, null],
  },
  {
    exampleId: 'bot3',
    fileName: 'bot3.md',
    ownerUsername: 'builtin',
    name: 'corner-bunker',
    botId: 'builtin/corner-bunker',
    displayName: 'Corner Bunker',
    loadout: ['BULLET', null, null],
  },
  {
    exampleId: 'bot4',
    fileName: 'bot4.md',
    ownerUsername: 'builtin',
    name: 'saw-rusher',
    botId: 'builtin/saw-rusher',
    displayName: 'Saw Rusher',
    loadout: ['SAW', 'SHIELD', null],
  },
  {
    exampleId: 'bot5',
    fileName: 'bot5.md',
    ownerUsername: 'builtin',
    name: 'burst-hunter',
    botId: 'builtin/burst-hunter',
    displayName: 'Burst Hunter',
    loadout: ['BULLET', 'ARMOR', null],
  },
  {
    exampleId: 'bot6',
    fileName: 'bot6.md',
    ownerUsername: 'builtin',
    name: 'energy-saw-skirmisher',
    botId: 'builtin/energy-saw-skirmisher',
    displayName: 'Energy Saw Skirmisher',
    loadout: ['SAW', 'SHIELD', null],
  },
]

export function extractFirstTextFence(markdownText) {
  const match = String(markdownText ?? '').match(/```text\s*\n([\s\S]*?)\n```/)
  if (!match) return ''
  return canonicalizeSource(match[1])
}

export async function loadBuiltinBots({ examplesDir = defaultExamplesDir } = {}) {
  const bots = []

  for (const spec of BUILTIN_BOT_SPECS) {
    const markdownText = await fs.readFile(path.join(examplesDir, spec.fileName), 'utf8')
    const sourceText = extractFirstTextFence(markdownText)
    if (!sourceText) {
      throw new Error(`Missing \`\`\`text fence in ${spec.fileName}`)
    }

    bots.push({
      ...spec,
      sourceText,
      sourceHash: sha256Hex(sourceText),
    })
  }

  return bots
}
