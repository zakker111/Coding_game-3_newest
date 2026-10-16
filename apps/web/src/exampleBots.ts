import bot0Md from '../../../examples/bot0.md?raw'
import bot1Md from '../../../examples/bot1.md?raw'
import bot2Md from '../../../examples/bot2.md?raw'
import bot3Md from '../../../examples/bot3.md?raw'
import bot4Md from '../../../examples/bot4.md?raw'
import bot5Md from '../../../examples/bot5.md?raw'
import bot6Md from '../../../examples/bot6.md?raw'
import bot7Md from '../../../examples/bot7.md?raw'
import bot8Md from '../../../examples/bot8.md?raw'
import bot9Md from '../../../examples/bot9.md?raw'
import bot10Md from '../../../examples/bot10.md?raw'
import bot11Md from '../../../examples/bot11.md?raw'
import bot12Md from '../../../examples/bot12.md?raw'
import bot13Md from '../../../examples/bot13.md?raw'

export type ExampleBotId = 'bot0' | 'bot1' | 'bot2' | 'bot3' | 'bot4' | 'bot5' | 'bot6' | 'bot7' | 'bot8' | 'bot9' | 'bot10' | 'bot11' | 'bot12' | 'bot13'

export type ExampleBot = {
  id: ExampleBotId
  displayName: string
  sourceText: string
}

function extractFirstTextFence(md: string): string {
  // Match the first fenced block like:
  // ```text\n...\n```
  const m = md.match(/```text\s*\n([\s\S]*?)\n```/)
  if (!m) return ''

  // Keep a trailing newline to match how the rest of the app stores sources.
  const body = m[1].replace(/\s+$/, '')
  return body.length ? `${body}\n` : ''
}

export const EXAMPLE_BOTS: Record<ExampleBotId, ExampleBot> = {
  bot0: {
    id: 'bot0',
    displayName: 'Aggressive Skirmisher (starter)',
    sourceText: extractFirstTextFence(bot0Md),
  },
  bot1: {
    id: 'bot1',
    displayName: 'Weakest-Link Patrol',
    sourceText: extractFirstTextFence(bot1Md),
  },
  bot2: {
    id: 'bot2',
    displayName: 'Target Cycler',
    sourceText: extractFirstTextFence(bot2Md),
  },
  bot3: {
    id: 'bot3',
    displayName: 'Immediate-Move Mine Bunker',
    sourceText: extractFirstTextFence(bot3Md),
  },
  bot4: {
    id: 'bot4',
    displayName: 'Slot-Driven Saw Diver',
    sourceText: extractFirstTextFence(bot4Md),
  },
  bot5: {
    id: 'bot5',
    displayName: 'Armored Grenade Controller',
    sourceText: extractFirstTextFence(bot5Md),
  },
  bot6: {
    id: 'bot6',
    displayName: 'Energy Saw Skirmisher',
    sourceText: extractFirstTextFence(bot6Md),
  },
  bot7: {
    id: 'bot7',
    displayName: 'Long-Range Sniper',
    sourceText: extractFirstTextFence(bot7Md),
  },
  bot8: {
    id: 'bot8',
    displayName: 'Rocket Barrager',
    sourceText: extractFirstTextFence(bot8Md),
  },
  bot9: {
    id: 'bot9',
    displayName: 'Blink Teleporter',
    sourceText: extractFirstTextFence(bot9Md),
  },
  bot10: {
    id: 'bot10',
    displayName: 'Flame Close-Quarters (FLAMER)',
    sourceText: extractFirstTextFence(bot10Md),
  },
  bot11: {
    id: 'bot11',
    displayName: 'Rail Sniper (RAILGUN)',
    sourceText: extractFirstTextFence(bot11Md),
  },
  bot12: {
    id: 'bot12',
    displayName: 'Shock Warden (PULSE)',
    sourceText: extractFirstTextFence(bot12Md),
  },
  bot13: {
    id: 'bot13',
    displayName: 'Ghost Assassin (CLOAK)',
    sourceText: extractFirstTextFence(bot13Md),
  },
}

export const EXAMPLE_OPPONENT_IDS: Array<Exclude<ExampleBotId, 'bot0'>> = [
  'bot1',
  'bot2',
  'bot3',
  'bot4',
  'bot5',
  'bot6',
  'bot7',
  'bot8',
  'bot9',
  'bot10',
  'bot11',
  'bot12',
  'bot13',
]
