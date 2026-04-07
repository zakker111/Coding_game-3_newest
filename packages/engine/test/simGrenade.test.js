import test from 'node:test'
import assert from 'node:assert/strict'

import { runMatchToReplay } from '@coding-game/engine'

function grenadeSpawnEvents(replay) {
  return replay.events.flat().filter((e) => e?.type === 'GRENADE_SPAWN')
}

function grenadeExplodeEvents(replay) {
  return replay.events.flat().filter((e) => e?.type === 'GRENADE_EXPLODE')
}

function damageEventsFor(replay, botId) {
  return replay.events.flat().filter((e) => e?.type === 'DAMAGE' && e.victimBotId === botId)
}

test('runMatchToReplay: GRENADE loadout fires through USE_SLOT and explodes after fuse expiry', () => {
  const replay = runMatchToReplay({
    seed: 1,
    tickCap: 8,
    bots: [
      { slotId: 'BOT1', sourceText: 'LABEL LOOP\nUSE_SLOT1 BOT2\nGOTO LOOP\n', loadout: ['GRENADE', null, null] },
      { slotId: 'BOT2', sourceText: 'WAIT 1\n', loadout: [null, null, null] },
      { slotId: 'BOT3', sourceText: 'WAIT 1\n', loadout: [null, null, null] },
      { slotId: 'BOT4', sourceText: 'WAIT 1\n', loadout: [null, null, null] },
    ],
  })

  const spawns = grenadeSpawnEvents(replay)
  const explodes = grenadeExplodeEvents(replay)

  assert.equal(spawns.length, 1, 'expected one grenade spawn before cooldown')
  assert.equal(explodes.length, 1, 'expected the grenade to explode after its fuse')
  assert.ok(explodes[0].pos, 'expected grenade explosion to record its exact world position')
  assert.ok(explodes[0].sector >= 1 && explodes[0].sector <= 9, 'expected grenade explosion to record its impact sector')

  const bot2Damage = damageEventsFor(replay, 'BOT2').filter((e) => e.source === 'GRENADE')
  assert.ok(bot2Damage.length > 0, 'expected BOT2 to take grenade damage')
})

test('runMatchToReplay: grenade explosion does not damage the owner', () => {
  const replay = runMatchToReplay({
    seed: 1,
    tickCap: 8,
    bots: [
      { slotId: 'BOT1', sourceText: 'LABEL LOOP\nUSE_SLOT1 BOT2\nGOTO LOOP\n', loadout: ['GRENADE', null, null] },
      { slotId: 'BOT2', sourceText: 'WAIT 1\n', loadout: [null, null, null] },
      { slotId: 'BOT3', sourceText: 'WAIT 1\n', loadout: [null, null, null] },
      { slotId: 'BOT4', sourceText: 'WAIT 1\n', loadout: [null, null, null] },
    ],
  })

  const bot1Damage = damageEventsFor(replay, 'BOT1').filter((e) => e.source === 'GRENADE')
  assert.equal(bot1Damage.length, 0, 'expected grenade explosions to exclude the owner')
})

test('runMatchToReplay: GRENADE slot reports cooldown no-op reasons like other weapons', () => {
  const replay = runMatchToReplay({
    seed: 1,
    tickCap: 4,
    bots: [
      { slotId: 'BOT1', sourceText: 'LABEL LOOP\nUSE_SLOT1 BOT2\nUSE_SLOT1 BOT2\nGOTO LOOP\n', loadout: ['GRENADE', null, null] },
      { slotId: 'BOT2', sourceText: 'WAIT 1\n', loadout: [null, null, null] },
      { slotId: 'BOT3', sourceText: 'WAIT 1\n', loadout: [null, null, null] },
      { slotId: 'BOT4', sourceText: 'WAIT 1\n', loadout: [null, null, null] },
    ],
  })

  const cooldown = replay.events.flat().find(
    (e) => e?.type === 'BOT_EXEC' && e.botId === 'BOT1' && e.reason === 'COOLDOWN',
  )
  assert.ok(cooldown, 'expected grenade follow-up use to respect slot cooldown')
})
