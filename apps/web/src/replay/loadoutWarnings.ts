import type { LoadoutIssue, Replay, ReplayHeaderBot, SlotId } from '@coding-game/replay'

import { SLOT_IDS } from './interpolate'

export function getReplayHeaderBotsBySlot(replay: Replay | null | undefined): Partial<Record<SlotId, ReplayHeaderBot>> {
  const out: Partial<Record<SlotId, ReplayHeaderBot>> = {}

  for (const bot of replay?.bots ?? []) out[bot.slotId] = bot

  return out
}

export function getReplayLoadoutIssuesBySlot(replay: Replay | null | undefined): Record<SlotId, LoadoutIssue[]> {
  const headerBotsBySlot = getReplayHeaderBotsBySlot(replay)
  const out = {} as Record<SlotId, LoadoutIssue[]>

  for (const slotId of SLOT_IDS) out[slotId] = headerBotsBySlot[slotId]?.loadoutIssues ?? []

  return out
}

export function formatReplayLoadoutIssue(issue: LoadoutIssue): string {
  return `${issue.kind} (slot ${issue.slot}${issue.module ? `: ${issue.module}` : ''})`
}
