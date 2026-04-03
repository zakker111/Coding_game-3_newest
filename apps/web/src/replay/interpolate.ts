import type { Replay, ReplayBotState, SlotId } from '@coding-game/replay'

export type BotRenderSnapshot = {
  botId: SlotId
  pos: { x: number; y: number }
  hp: number
  ammo: number
  energy: number
  alive: boolean
}

export const SLOT_IDS: readonly SlotId[] = ['BOT1', 'BOT2', 'BOT3', 'BOT4']

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function mapBotsById(bots: ReplayBotState[]): Partial<Record<SlotId, ReplayBotState>> {
  const out: Partial<Record<SlotId, ReplayBotState>> = Object.create(null)
  for (const b of bots) out[b.botId] = b
  return out
}

export function interpolateBots(
  prevBots: ReplayBotState[],
  nextBots: ReplayBotState[],
  alpha: number,
): BotRenderSnapshot[] {
  const t = Math.max(0, Math.min(1, alpha))
  const prevById = mapBotsById(prevBots)
  const nextById = mapBotsById(nextBots)

  return SLOT_IDS.map((botId) => {
    const prev = prevById[botId]
    const next = nextById[botId]

    if (!prev && !next) {
      return {
        botId,
        pos: { x: 0, y: 0 },
        hp: 0,
        ammo: 0,
        energy: 0,
        alive: false,
      }
    }

    const a = prev ?? next!
    const b = next ?? prev!

    const statSrc = t >= 1 ? b : a

    return {
      botId,
      pos: {
        x: lerp(a.pos.x, b.pos.x, t),
        y: lerp(a.pos.y, b.pos.y, t),
      },
      hp: statSrc.hp,
      ammo: statSrc.ammo,
      energy: statSrc.energy,
      alive: statSrc.alive,
    }
  })
}

export function getBotsForPlayback(replay: Replay, tick: number, alpha: number): BotRenderSnapshot[] {
  const t = Math.max(0, Math.min(replay.tickCap, Math.trunc(tick)))

  const next = replay.state[t]?.bots
  const prev = t > 0 ? replay.state[t - 1]?.bots : replay.state[0]?.bots

  if (!prev || !next) return []
  return interpolateBots(prev, next, alpha)
}

export function getAppearanceColorMap(replay: Replay): Record<SlotId, string> {
  const out = Object.create(null) as Record<SlotId, string>
  for (const b of replay.bots) {
    if (b.appearance?.kind === 'COLOR') out[b.slotId] = b.appearance.color
  }
  return out
}
