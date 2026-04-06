import test from 'node:test'
import assert from 'node:assert/strict'

import { runMatchToReplay } from '@coding-game/engine'

function paramsForLoadout(rawLoadout) {
  return {
    seed: 1,
    tickCap: 0,
    bots: [
      { slotId: 'BOT1', sourceText: 'WAIT 1\n', loadout: rawLoadout },
      { slotId: 'BOT2', sourceText: 'WAIT 1\n', loadout: [null, null, null] },
      { slotId: 'BOT3', sourceText: 'WAIT 1\n', loadout: [null, null, null] },
      { slotId: 'BOT4', sourceText: 'WAIT 1\n', loadout: [null, null, null] },
    ],
  }
}

function replayForLoadout(rawLoadout) {
  return runMatchToReplay(paramsForLoadout(rawLoadout))
}

test('runMatchToReplay: normalizes loadout (unknown modules => null) deterministically', () => {
  const params = paramsForLoadout(['BULLET', 'LASER', 'ARMOR'])

  const a = runMatchToReplay(params)
  const b = runMatchToReplay(params)

  assert.deepStrictEqual(b, a, 'expected deterministic normalization output')

  const bot1 = a.bots.find((x) => x.slotId === 'BOT1')
  assert.ok(bot1)

  assert.deepStrictEqual(bot1.loadout, ['BULLET', null, 'ARMOR'])
  assert.deepStrictEqual(bot1.loadoutIssues, [{ kind: 'UNKNOWN_MODULE', slot: 2, module: 'LASER' }])
})

test('runMatchToReplay: normalizes loadout (duplicates removed; keep earliest)', () => {
  const r = replayForLoadout(['ARMOR', 'ARMOR', 'SHIELD'])

  const bot1 = r.bots.find((x) => x.slotId === 'BOT1')
  assert.ok(bot1)

  assert.deepStrictEqual(bot1.loadout, ['ARMOR', null, 'SHIELD'])
  assert.deepStrictEqual(bot1.loadoutIssues, [{ kind: 'DUPLICATE', slot: 2, module: 'ARMOR' }])
})

test('runMatchToReplay: normalizes loadout (multi-weapon removed; keep earliest)', () => {
  const r = replayForLoadout(['GRENADE', 'BULLET', 'ARMOR'])

  const bot1 = r.bots.find((x) => x.slotId === 'BOT1')
  assert.ok(bot1)

  assert.deepStrictEqual(bot1.loadout, ['GRENADE', null, 'ARMOR'])
  assert.deepStrictEqual(bot1.loadoutIssues, [{ kind: 'MULTI_WEAPON', slot: 2, module: 'BULLET' }])
})

test('runMatchToReplay: loadout normalization issues are stable and ordered deterministically', () => {
  // This input triggers both a DUPLICATE (slot3 SAW) and MULTI_WEAPON (slot2 SAW vs slot1 BULLET).
  const r = replayForLoadout(['BULLET', 'SAW', 'SAW'])

  const bot1 = r.bots.find((x) => x.slotId === 'BOT1')
  assert.ok(bot1)

  assert.deepStrictEqual(bot1.loadout, ['BULLET', null, null])
  assert.deepStrictEqual(bot1.loadoutIssues, [
    { kind: 'DUPLICATE', slot: 3, module: 'SAW' },
    { kind: 'MULTI_WEAPON', slot: 2, module: 'SAW' },
  ])
})
