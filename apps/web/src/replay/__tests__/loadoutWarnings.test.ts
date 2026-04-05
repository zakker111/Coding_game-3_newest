// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { generateSampleReplay, type LoadoutIssue } from '@coding-game/replay'

import { formatReplayLoadoutIssue, getReplayLoadoutIssuesBySlot } from '../loadoutWarnings'

describe('getReplayLoadoutIssuesBySlot', () => {
  it('maps replay header issues by slot and leaves clean bots empty', () => {
    const replay = generateSampleReplay(12345, { tickCap: 4 })
    const bot2Issues: LoadoutIssue[] = [
      { kind: 'DUPLICATE', slot: 2, module: 'ARMOR' },
      { kind: 'MULTI_WEAPON', slot: 3, module: 'SAW' },
    ]

    replay.bots = replay.bots.map((bot) => (bot.slotId === 'BOT2' ? { ...bot, loadoutIssues: bot2Issues } : bot))

    const issuesBySlot = getReplayLoadoutIssuesBySlot(replay)

    expect(issuesBySlot.BOT1).toEqual([])
    expect(issuesBySlot.BOT2).toEqual(bot2Issues)
    expect(issuesBySlot.BOT3).toEqual([])
    expect(issuesBySlot.BOT4).toEqual([])
  })
})

describe('formatReplayLoadoutIssue', () => {
  it('formats duplicate, multi-weapon, and unknown-module issues consistently', () => {
    expect(formatReplayLoadoutIssue({ kind: 'DUPLICATE', slot: 1, module: 'SHIELD' })).toBe('DUPLICATE (slot 1: SHIELD)')
    expect(formatReplayLoadoutIssue({ kind: 'MULTI_WEAPON', slot: 2, module: 'SAW' })).toBe('MULTI_WEAPON (slot 2: SAW)')
    expect(formatReplayLoadoutIssue({ kind: 'UNKNOWN_MODULE', slot: 3, module: 'LASER' })).toBe('UNKNOWN_MODULE (slot 3: LASER)')
  })
})
