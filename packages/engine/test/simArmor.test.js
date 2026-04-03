import test from 'node:test'
import assert from 'node:assert/strict'

import { runMatchToReplay } from '@coding-game/engine'
import { BOT_BUMP_DAMAGE, BULLET_DAMAGE, WALL_BUMP_DAMAGE } from '../src/sim/constants.js'

test('runMatchToReplay: ARMOR reduces bullet damage (events + state)', () => {
  const bots = [
    {
      slotId: 'BOT1',
      loadout: ['BULLET', null, null],
      sourceText: ['LABEL LOOP', 'IF (SLOT_READY(SLOT1)) DO FIRE_SLOT1 BOT2', 'GOTO LOOP', ''].join('\n'),
    },
    {
      slotId: 'BOT2',
      loadout: [null, 'ARMOR', null],
      sourceText: ['WAIT 1', ''].join('\n'),
    },
    { slotId: 'BOT3', loadout: [null, null, null], sourceText: 'WAIT 1\n' },
    { slotId: 'BOT4', loadout: [null, null, null], sourceText: 'WAIT 1\n' },
  ]

  const replay = runMatchToReplay({ seed: 123, tickCap: 60, bots })

  const allEvents = replay.events.flat()

  const expectedDamage = BULLET_DAMAGE - Math.floor(BULLET_DAMAGE / 3)

  const bulletHits = allEvents.filter((e) => e && e.type === 'BULLET_HIT' && e.victimBotId === 'BOT2')
  assert.ok(bulletHits.length > 0, 'expected at least one bullet hit on BOT2')
  assert.equal(BULLET_DAMAGE, 10)
  assert.ok(
    bulletHits.every((e) => e.damage === expectedDamage),
    `expected BULLET_HIT damage to be reduced from ${BULLET_DAMAGE} to ${expectedDamage} when ARMOR is equipped`
  )

  const bulletDamageEvents = allEvents.filter(
    (e) => e && e.type === 'DAMAGE' && e.victimBotId === 'BOT2' && e.source === 'BULLET'
  )
  assert.ok(bulletDamageEvents.length > 0, 'expected at least one DAMAGE event from BULLET on BOT2')
  assert.ok(
    bulletDamageEvents.every((e) => e.amount === expectedDamage),
    `expected DAMAGE.amount to be reduced from ${BULLET_DAMAGE} to ${expectedDamage} when ARMOR is equipped`
  )
})

test('runMatchToReplay: SHIELD + ARMOR ordering is shield first, then armor (odd rounding)', () => {
  const bots = [
    {
      slotId: 'BOT1',
      loadout: ['BULLET', null, null],
      sourceText: ['LABEL LOOP', 'IF (SLOT_READY(SLOT1)) DO FIRE_SLOT1 BOT2', 'GOTO LOOP', ''].join('\n'),
    },
    {
      slotId: 'BOT2',
      loadout: ['SHIELD', 'ARMOR', null],
      sourceText: ['LABEL LOOP', 'SHIELD ON', 'GOTO LOOP', ''].join('\n'),
    },
    { slotId: 'BOT3', loadout: [null, null, null], sourceText: 'WAIT 1\n' },
    { slotId: 'BOT4', loadout: [null, null, null], sourceText: 'WAIT 1\n' },
  ]

  const replay = runMatchToReplay({ seed: 123, tickCap: 60, bots })
  const allEvents = replay.events.flat()

  // Expected: shield halves first (10 -> 5), then armor mitigates by floor(d/3) (5 -> 4).
  assert.equal(BULLET_DAMAGE, 10)
  const afterShield = BULLET_DAMAGE - Math.floor(BULLET_DAMAGE / 2)
  assert.equal(afterShield, 5)

  const expected = afterShield - Math.floor(afterShield / 3)
  assert.equal(expected, 4)

  const bulletHits = allEvents.filter((e) => e && e.type === 'BULLET_HIT' && e.victimBotId === 'BOT2')
  assert.ok(bulletHits.length > 0, 'expected at least one bullet hit on BOT2')
  assert.ok(
    bulletHits.every((e) => e.damage === expected),
    `expected BULLET_HIT damage to be reduced from ${BULLET_DAMAGE} to ${expected} with SHIELD+ARMOR`
  )

  const bulletDamageEvents = allEvents.filter(
    (e) => e && e.type === 'DAMAGE' && e.victimBotId === 'BOT2' && e.source === 'BULLET'
  )
  assert.ok(bulletDamageEvents.length > 0, 'expected at least one DAMAGE event from BULLET on BOT2')
  assert.ok(bulletDamageEvents.every((e) => e.amount === expected), 'expected DAMAGE.amount to match BULLET_HIT.damage')
})

test('runMatchToReplay: ARMOR reduces SAW damage', () => {
  const bots = [
    {
      slotId: 'BOT1',
      loadout: ['SAW', null, null],
      // Close distance deterministically, then keep SAW enabled.
      sourceText: ['LABEL LOOP', 'TARGET_CLOSEST', 'SET_MOVE_TO_TARGET', 'SAW ON', 'GOTO LOOP', ''].join('\n'),
    },
    {
      slotId: 'BOT2',
      loadout: [null, 'ARMOR', null],
      sourceText: 'NOP\n',
    },
    { slotId: 'BOT3', loadout: [null, null, null], sourceText: 'WAIT 1\n' },
    { slotId: 'BOT4', loadout: [null, null, null], sourceText: 'WAIT 1\n' },
  ]

  const replay = runMatchToReplay({ seed: 1337, tickCap: 40, bots })
  const allEvents = replay.events.flat()

  const sawDamages = allEvents.filter((e) => e && e.type === 'DAMAGE' && e.source === 'SAW' && e.victimBotId === 'BOT2')
  assert.ok(sawDamages.length > 0, 'expected at least one SAW DAMAGE event against BOT2')

  // Stable v1 SAW damage is 6, mitigated by armor: 6 - floor(6/3) = 4.
  const expected = 6 - Math.floor(6 / 3)
  assert.equal(expected, 4)

  assert.ok(
    sawDamages.every((e) => e.amount === expected),
    `expected SAW damage to be reduced from 6 to ${expected} when ARMOR is equipped`
  )
})

test('runMatchToReplay: ARMOR applies to wall bump damage source (even if mitigation is a no-op at current constants)', () => {
  const bots = [
    { slotId: 'BOT1', loadout: ['ARMOR', null, null], sourceText: 'LABEL LOOP\nMOVE LEFT\nGOTO LOOP\n' },
    { slotId: 'BOT2', loadout: [null, null, null], sourceText: 'WAIT 10\n' },
    { slotId: 'BOT3', loadout: [null, null, null], sourceText: 'WAIT 10\n' },
    { slotId: 'BOT4', loadout: [null, null, null], sourceText: 'WAIT 10\n' },
  ]

  const replay = runMatchToReplay({ seed: 1, tickCap: 5, bots })
  const allEvents = replay.events.flat()

  const wallBumps = allEvents.filter((e) => e && e.type === 'BUMP_WALL' && e.botId === 'BOT1')
  assert.ok(wallBumps.length > 0, 'expected BOT1 to bump a wall at least once')

  const expected = WALL_BUMP_DAMAGE - Math.floor(WALL_BUMP_DAMAGE / 3)
  assert.ok(wallBumps.every((e) => e.damage === expected), 'expected BUMP_WALL.damage to match armor-mitigated amount')

  const damageEvents = allEvents.filter((e) => e && e.type === 'DAMAGE' && e.victimBotId === 'BOT1' && e.kind === 'BUMP_WALL')
  assert.ok(damageEvents.length > 0, 'expected at least one DAMAGE event for BUMP_WALL')
  assert.ok(damageEvents.every((e) => e.amount === expected), 'expected DAMAGE.amount to match BUMP_WALL.damage')
})

test('runMatchToReplay: ARMOR applies to bot bump damage source (even if mitigation is a no-op at current constants)', () => {
  const bots = [
    { slotId: 'BOT1', loadout: [null, null, null], sourceText: 'LABEL LOOP\nMOVE RIGHT\nGOTO LOOP\n' },
    { slotId: 'BOT2', loadout: ['ARMOR', null, null], sourceText: 'LABEL LOOP\nMOVE LEFT\nGOTO LOOP\n' },
    { slotId: 'BOT3', loadout: [null, null, null], sourceText: 'WAIT 10\n' },
    { slotId: 'BOT4', loadout: [null, null, null], sourceText: 'WAIT 10\n' },
  ]

  const replay = runMatchToReplay({ seed: 1, tickCap: 30, bots })
  const allEvents = replay.events.flat()

  const bumpDamage = allEvents.filter(
    (e) => e && e.type === 'DAMAGE' && e.kind === 'BUMP_BOT' && (e.victimBotId === 'BOT1' || e.victimBotId === 'BOT2')
  )

  assert.ok(bumpDamage.length > 0, 'expected at least one BUMP_BOT DAMAGE event')

  const expected = BOT_BUMP_DAMAGE - Math.floor(BOT_BUMP_DAMAGE / 3)
  assert.ok(bumpDamage.every((e) => e.amount === expected), 'expected BUMP_BOT DAMAGE amounts to match armor-mitigated amount')
})

test('runMatchToReplay: ARMOR applies a deterministic movement speed penalty', () => {
  const bots = [
    { slotId: 'BOT1', loadout: [null, null, null], sourceText: 'MOVE RIGHT\n' },
    { slotId: 'BOT2', loadout: [null, null, null], sourceText: 'WAIT 10\n' },
    { slotId: 'BOT3', loadout: ['ARMOR', null, null], sourceText: 'MOVE RIGHT\n' },
    { slotId: 'BOT4', loadout: [null, null, null], sourceText: 'WAIT 10\n' },
  ]

  const params = { seed: 1, tickCap: 5, bots }

  const a = runMatchToReplay(params)
  const b = runMatchToReplay(params)

  assert.deepStrictEqual(b, a, 'expected deterministic replay output')

  // Stable v1 movement: base speed 12 units/tick; armor speed = floor(12*3/4) = 9.
  const s5 = a.state[5]
  const bot1 = s5.bots.find((x) => x.botId === 'BOT1')
  const bot3 = s5.bots.find((x) => x.botId === 'BOT3')
  assert.ok(bot1 && bot3)

  assert.equal(bot1.pos.y, 16)
  assert.equal(bot3.pos.y, 176)

  assert.equal(bot1.pos.x, 16 + 12 * 5)
  assert.equal(bot3.pos.x, 16 + 9 * 5)
})
