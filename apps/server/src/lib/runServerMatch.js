import { compileBotSource, runMatchToReplay } from '@coding-game/engine'
import { RULESET_VERSION, normalizeLoadout } from '@coding-game/ruleset'

const SLOT_ORDER = ['BOT1', 'BOT2', 'BOT3', 'BOT4']

export function runServerMatch(match) {
  const bots = SLOT_ORDER.map((slotId) => {
    const participant = match.participants.find((entry) => entry.slot === slotId)

    if (!participant) {
      return {
        slotId,
        sourceText: 'WAIT 1\n',
        loadout: [null, null, null],
      }
    }

    const compile = compileBotSource(participant.source_text_snapshot)
    if (compile.errors.length > 0) {
      throw new Error(`compile_error:${participant.botId}:${JSON.stringify(compile.errors)}`)
    }

    const normalized = normalizeLoadout(participant.loadout_snapshot)

    return {
      slotId,
      sourceText: participant.source_text_snapshot,
      loadout: normalized.loadout,
    }
  })

  return runMatchToReplay({
    seed: match.match_seed,
    tickCap: match.tick_cap,
    bots,
    rulesetVersion: RULESET_VERSION,
  })
}

export function summarizeReplay(replay) {
  const finalState = replay.state[replay.state.length - 1]
  const endEvent = replay.events[replay.events.length - 1]?.find((event) => event.type === 'MATCH_END') ?? null
  const placements = [...finalState.bots].sort((a, b) => {
    if (a.alive !== b.alive) return Number(b.alive) - Number(a.alive)
    if (a.hp !== b.hp) return b.hp - a.hp
    if (a.energy !== b.energy) return b.energy - a.energy
    if (a.ammo !== b.ammo) return b.ammo - a.ammo
    return String(a.botId).localeCompare(String(b.botId))
  })

  return {
    winner: placements.find((bot) => bot.alive)?.botId ?? null,
    placements: placements.map((bot, index) => ({
      placement: index + 1,
      botId: bot.botId,
      alive: bot.alive,
      hp: bot.hp,
      ammo: bot.ammo,
      energy: bot.energy,
    })),
    end_reason: endEvent?.endReason ?? null,
    tick_count: replay.tickCap,
  }
}
