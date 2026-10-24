/**
 * "Why did I lose" summary for one bot in one finished match.
 *
 * Pure function over a replay JSON (as returned by /api/matches/:id/replay).
 * Tick numbers match the replay viewer: events[i] is tick i + 1, and the
 * state snapshot after tick t is state[t].
 *
 * @param {object} replay
 * @param {string} botId  slot id (BOT1..BOT4) as used in replay.events
 * @param {{ lastInstructions?: number }} [options]
 */
export function summarizeBotMatch(replay, botId, options = {}) {
  const lastN = Number.isInteger(options.lastInstructions) && options.lastInstructions > 0 ? options.lastInstructions : 5
  const events = Array.isArray(replay?.events) ? replay.events : []
  const states = Array.isArray(replay?.state) ? replay.state : []

  let totalDamageTaken = 0
  let totalDamageDealt = 0
  /** @type {{ tick: number, amount: number, source: string | null, attackerBotId: string | null } | null} */
  let firstDamageTaken = null
  /** @type {{ tick: number, amount: number, bySource: Record<string, number> } | null} */
  let mostDamageTick = null
  /** @type {{ tick: number, killedBy: string | null } | null} */
  let died = null
  /** @type {{ tick: number, instrText: string, result: string, reason: string | null }[]} */
  const execs = []
  /** @type {string | null} */
  let endReason = null
  let endTick = null

  for (let index = 0; index < events.length; index += 1) {
    const tick = index
    const tickEvents = Array.isArray(events[index]) ? events[index] : []
    let damageThisTickTaken = 0
    /** @type {Record<string, number>} */
    const bySource = {}

    for (const event of tickEvents) {
      if (!event || typeof event !== 'object') continue

      if (event.type === 'DAMAGE') {
        const victim = event.victimBotId ?? event.targetBotId ?? null
        const attacker = event.sourceBotId ?? event.ownerBotId ?? event.attackerBotId ?? null
        const amount = Number.isFinite(event.amount) ? event.amount : 0
        const source = typeof event.source === 'string' ? event.source : null

        if (victim === botId) {
          totalDamageTaken += amount
          damageThisTickTaken += amount
          const key = source ?? 'UNKNOWN'
          bySource[key] = (bySource[key] ?? 0) + amount
          if (!firstDamageTaken) {
            firstDamageTaken = { tick, amount, source, attackerBotId: attacker }
          }
        }
        if (attacker === botId && victim !== botId) {
          totalDamageDealt += amount
        }
      }

      if (event.type === 'BOT_DIED' && event.victimBotId === botId && !died) {
        died = { tick, killedBy: event.creditedBotId ?? null }
      }

      if (event.type === 'BOT_EXEC' && event.botId === botId) {
        execs.push({
          tick,
          instrText: String(event.instrText ?? ''),
          result: String(event.result ?? ''),
          reason: typeof event.reason === 'string' ? event.reason : null,
        })
      }

      if (event.type === 'MATCH_END') {
        endReason = typeof event.endReason === 'string' ? event.endReason : null
        endTick = tick
      }
    }

    if (damageThisTickTaken > 0 && (!mostDamageTick || damageThisTickTaken > mostDamageTick.amount)) {
      mostDamageTick = { tick, amount: damageThisTickTaken, bySource }
    }
  }

  const lastState = states.length ? states[states.length - 1] : null
  const finalBot = lastState?.bots?.find((bot) => bot.botId === botId) ?? null
  const aliveAtEnd = (lastState?.bots ?? []).filter((bot) => bot.alive).map((bot) => bot.botId)

  return {
    botId,
    endReason,
    endTick,
    survivedToEnd: Boolean(finalBot?.alive),
    finalState: finalBot
      ? { hp: finalBot.hp, ammo: finalBot.ammo, energy: finalBot.energy, alive: Boolean(finalBot.alive) }
      : null,
    aliveAtEnd,
    totalDamageTaken,
    totalDamageDealt,
    firstDamageTaken,
    mostDamageTick,
    died,
    lastInstructions: execs.slice(-lastN),
  }
}
