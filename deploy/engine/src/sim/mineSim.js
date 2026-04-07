import {
  MINE_ARM_TICKS,
  MINE_DAMAGE_ADJACENT,
  MINE_DAMAGE_CENTER,
  MINE_FUSE_TICKS,
  MINE_TTL_TICKS,
  SLOT_IDS,
} from './constants.js'
import { clonePos, sectorFromPos } from './arenaMath.js'

export function createMine(ownerBotId, pos) {
  return {
    mineId: '',
    ownerBotId,
    pos: clonePos(pos),
    sector: sectorFromPos(pos),
    armRemaining: MINE_ARM_TICKS,
    fuseRemaining: MINE_FUSE_TICKS,
    ttlRemaining: MINE_TTL_TICKS,
  }
}

export function stepMines(mines, bots, tickEvents) {
  /** @type {typeof mines} */
  const next = []

  for (const mine of mines) {
    if (mine.armRemaining > 0) {
      mine.armRemaining--
      if (mine.armRemaining === 0) {
        tickEvents.push({
          type: 'MINE_ARMED',
          mineId: mine.mineId,
        })
      }
    }

    mine.fuseRemaining--
    mine.ttlRemaining--

    const triggerBot = mine.armRemaining <= 0 ? findTriggerBot(mine, bots) : null

    if (triggerBot) {
      tickEvents.push({
        type: 'MINE_TRIGGER',
        mineId: mine.mineId,
        triggerBotId: triggerBot.botId,
      })
      detonateMine(mine, bots, tickEvents)
      continue
    }

    if (mine.fuseRemaining <= 0) {
      detonateMine(mine, bots, tickEvents)
      continue
    }

    if (mine.ttlRemaining <= 0) {
      tickEvents.push({
        type: 'MINE_DESPAWN',
        mineId: mine.mineId,
        reason: 'TTL',
      })
      continue
    }

    next.push(mine)
  }

  return next
}

function findTriggerBot(mine, bots) {
  for (const botId of SLOT_IDS) {
    const bot = botById(bots, botId)
    if (!bot || !bot.alive) continue
    if (bot.botId === mine.ownerBotId) continue
    if (sectorFromPos(bot.pos) === mine.sector) return bot
  }
  return null
}

function detonateMine(mine, bots, tickEvents) {
  tickEvents.push({
    type: 'MINE_DETONATE',
    mineId: mine.mineId,
    ownerBotId: mine.ownerBotId,
    pos: clonePos(mine.pos),
    centerSector: mine.sector,
    damageCenter: MINE_DAMAGE_CENTER,
    damageAdjacent: MINE_DAMAGE_ADJACENT,
  })

  for (const botId of SLOT_IDS) {
    const bot = botById(bots, botId)
    if (!bot || !bot.alive) continue
    if (bot.botId === mine.ownerBotId) continue

    const victimSector = sectorFromPos(bot.pos)
    let damage = 0
    if (victimSector === mine.sector) damage = MINE_DAMAGE_CENTER
    else if (isAdjSector(mine.sector, victimSector)) damage = MINE_DAMAGE_ADJACENT
    if (damage <= 0) continue

    if (bot.armorEquipped) damage = damage - Math.floor(damage / 3)

    bot.lastDamageByBotId = mine.ownerBotId
    bot.hp = Math.max(0, bot.hp - damage)

    tickEvents.push({
      type: 'DAMAGE',
      victimBotId: bot.botId,
      amount: damage,
      source: 'MINE',
      sourceBotId: mine.ownerBotId,
      kind: 'EXPLOSION',
      sourceRef: { type: 'MINE', id: mine.mineId },
    })

    if (bot.hp <= 0 && bot.alive) {
      bot.alive = false
      tickEvents.push({
        type: 'BOT_DIED',
        victimBotId: bot.botId,
        creditedBotId: bot.lastDamageByBotId,
      })
    }
  }

  tickEvents.push({
    type: 'MINE_DESPAWN',
    mineId: mine.mineId,
    reason: 'EXPLODED',
  })
}

function isAdjSector(a, b) {
  if (a === b) return false

  const ax = ((a - 1) % 3) + 1
  const ay = Math.floor((a - 1) / 3) + 1
  const bx = ((b - 1) % 3) + 1
  const by = Math.floor((b - 1) / 3) + 1

  return Math.abs(ax - bx) <= 1 && Math.abs(ay - by) <= 1
}

function botById(bots, botId) {
  switch (botId) {
    case 'BOT1':
      return bots[0]
    case 'BOT2':
      return bots[1]
    case 'BOT3':
      return bots[2]
    case 'BOT4':
      return bots[3]
    default:
      return null
  }
}
