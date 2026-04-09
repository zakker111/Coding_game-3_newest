import { getBotByOwnerAndName } from '../db/queries/bots.js'

const SLOT_IDS = ['BOT1', 'BOT2', 'BOT3', 'BOT4']

function parseBotId(botId) {
  const text = String(botId ?? '')
  const slashIndex = text.indexOf('/')
  if (slashIndex <= 0 || slashIndex === text.length - 1) return null
  return {
    owner: text.slice(0, slashIndex),
    name: text.slice(slashIndex + 1),
  }
}

export async function snapshotMatchParticipants(db, viewerUsername, rawParticipants) {
  const participants = Array.isArray(rawParticipants) ? rawParticipants : []
  if (participants.length !== SLOT_IDS.length) {
    return { error: 'expected_four_participants' }
  }

  const slots = new Set()
  const snapshots = []

  for (const participant of participants) {
    const slot = participant?.slot
    if (!SLOT_IDS.includes(slot) || slots.has(slot)) {
      return { error: 'invalid_participants' }
    }
    slots.add(slot)

    const parsedBotId = parseBotId(participant?.bot_id ?? participant?.botId)
    if (!parsedBotId) {
      return { error: 'invalid_bot_id' }
    }

    const bot = await getBotByOwnerAndName(db, parsedBotId.owner, parsedBotId.name)
    if (!bot) {
      return { error: 'bot_not_found' }
    }

    if (bot.owner_username !== 'builtin' && bot.owner_username !== viewerUsername) {
      return { error: 'forbidden' }
    }

    snapshots.push({
      slot,
      botId: bot.botId,
      source_hash: bot.source_hash,
      source_text_snapshot: bot.source_text,
      loadout_snapshot: participant?.loadout ?? bot.loadout,
    })
  }

  return {
    participants: snapshots,
  }
}
