// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { EXAMPLE_BOTS } from './exampleBots'
import { applyLoadoutHeaderDirectives, deriveLoadoutForSlot, parseLoadoutHeaderDirectives } from './loadout'

describe('loadout header directives', () => {
  it('parses ;@slotN directives from the first 3 non-blank comment lines', () => {
    const src = [';@slot1 BULLET', ';@slot2 EMPTY', ';@slot3 ARMOR', 'WAIT 1'].join('\n')
    expect(parseLoadoutHeaderDirectives(src)).toEqual({
      hasDirectives: true,
      loadout: ['BULLET', null, 'ARMOR'],
    })
  })

  it('treats unknown module directives as EMPTY (but still counts as directives)', () => {
    const src = [';@slot1 LASER', ';@slot2 EMPTY', ';@slot3 ARMOR', 'WAIT 1'].join('\n')
    expect(parseLoadoutHeaderDirectives(src)).toEqual({
      hasDirectives: true,
      loadout: [null, null, 'ARMOR'],
    })
  })

  it('ignores directives after the first 3 non-blank comment lines', () => {
    const src = ['; bot header line 1', '; bot header line 2', '; bot header line 3', ';@slot1 SAW', 'WAIT 1'].join('\n')
    expect(parseLoadoutHeaderDirectives(src)).toEqual({
      hasDirectives: false,
      loadout: [null, null, null],
    })
  })

  it('defaults to EMPTY/EMPTY/EMPTY when no directives are present', () => {
    expect(deriveLoadoutForSlot('BOT1', 'WAIT 1')).toEqual([null, null, null])
    expect(deriveLoadoutForSlot('BOT2', 'WAIT 1')).toEqual([null, null, null])

    const src = [';@slot1 EMPTY', ';@slot2 EMPTY', ';@slot3 EMPTY', 'WAIT 1'].join('\n')
    expect(deriveLoadoutForSlot('BOT1', src)).toEqual([null, null, null])
  })

  it('derives loadout from built-in example bot headers (explicit loadout wiring)', () => {
    expect(deriveLoadoutForSlot('BOT1', EXAMPLE_BOTS.bot0.sourceText)).toEqual(['BULLET', null, null])
    expect(deriveLoadoutForSlot('BOT1', EXAMPLE_BOTS.bot4.sourceText)).toEqual(['SAW', 'SHIELD', null])
  })

  it('can apply locked header directives and keeps them as the first 3 non-blank lines', () => {
    const src = ['\n', '; bot header', ';@slot1 SAW', 'WAIT 1', ''].join('\n')

    const next = applyLoadoutHeaderDirectives(src, ['BULLET', null, 'ARMOR'])

    const nonBlank = next
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)

    expect(nonBlank.slice(0, 3)).toEqual([';@slot1 BULLET', ';@slot2 EMPTY', ';@slot3 ARMOR'])
    expect(next).toContain('; bot header')
    expect(next).toContain('WAIT 1')
  })
})
