// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest'

import { loadLocalBotLibrary, LOCAL_BOTS_STORAGE_KEY } from './localBots'
import { DEFAULT_WORKSHOP_LOADOUT } from './loadout'

describe('local bot persistence', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('derives loadout from header directives when missing', () => {
    const stored = {
      version: 2,
      selectedBotId: 'my-bot-1',
      bots: [
        {
          id: 'my-bot-1',
          name: 'Bot 1',
          sourceText: [';@slot1 SHIELD', ';@slot2 EMPTY', ';@slot3 ARMOR', 'WAIT 1', ''].join('\n'),
        },
      ],
    }

    localStorage.setItem(LOCAL_BOTS_STORAGE_KEY, JSON.stringify(stored))

    const loaded = loadLocalBotLibrary('WAIT 1\n')
    expect(loaded.bots[0]?.loadout).toEqual(['SHIELD', null, 'ARMOR'])

    const nonBlank = (loaded.bots[0]?.sourceText ?? '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)

    expect(nonBlank.slice(0, 3)).toEqual([';@slot1 SHIELD', ';@slot2 EMPTY', ';@slot3 ARMOR'])
  })

  it('defaults missing loadout to DEFAULT_WORKSHOP_LOADOUT when no directives are present', () => {
    const stored = {
      version: 2,
      selectedBotId: 'my-bot-1',
      bots: [
        {
          id: 'my-bot-1',
          name: 'Bot 1',
          sourceText: 'WAIT 1\n',
        },
      ],
    }

    localStorage.setItem(LOCAL_BOTS_STORAGE_KEY, JSON.stringify(stored))

    const loaded = loadLocalBotLibrary('WAIT 1\n')
    expect(loaded.bots[0]?.loadout).toEqual(DEFAULT_WORKSHOP_LOADOUT)
  })
})
