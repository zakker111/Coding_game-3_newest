import test from 'node:test'
import assert from 'node:assert/strict'

import {
  EMPTY_LOADOUT,
  LOADOUT_SLOT_COUNT,
  MODULE_DEFINITIONS,
  MODULE_IDS,
  RULESET_VERSION,
  isKnownModuleId,
  isLoadout,
  isWeaponModuleId,
  loadoutHasModule,
  normalizeLoadout,
} from '../src/index.js'

test('ruleset constants match the current stable contract', () => {
  assert.equal(RULESET_VERSION, '0.2.0')
  assert.equal(LOADOUT_SLOT_COUNT, 3)
  assert.deepStrictEqual(EMPTY_LOADOUT, [null, null, null])
  assert.deepStrictEqual(MODULE_IDS, ['BULLET', 'SAW', 'SHIELD', 'ARMOR', 'GRENADE'])
})

test('ruleset catalog is internally consistent', () => {
  for (const moduleId of MODULE_IDS) {
    assert.equal(MODULE_DEFINITIONS[moduleId].id, moduleId)
    assert.equal(isKnownModuleId(moduleId), true)
  }

  assert.equal(isWeaponModuleId('BULLET'), true)
  assert.equal(isWeaponModuleId('SAW'), true)
  assert.equal(isWeaponModuleId('GRENADE'), true)
  assert.equal(isWeaponModuleId('SHIELD'), false)
  assert.equal(isWeaponModuleId('ARMOR'), false)
})

test('ruleset helpers validate known loadouts', () => {
  assert.equal(isLoadout(['GRENADE', null, 'ARMOR']), true)
  assert.equal(isLoadout(['LASER', null, null]), false)
  assert.equal(loadoutHasModule(['GRENADE', null, 'ARMOR'], 'GRENADE'), true)
  assert.equal(loadoutHasModule(['GRENADE', null, 'ARMOR'], 'SAW'), false)
})

test('normalizeLoadout matches the current engine behavior for unknown modules', () => {
  assert.deepStrictEqual(normalizeLoadout(['BULLET', 'LASER', 'ARMOR']), {
    loadout: ['BULLET', null, 'ARMOR'],
    issues: [{ kind: 'UNKNOWN_MODULE', slot: 2, module: 'LASER' }],
  })
})

test('normalizeLoadout matches the current engine behavior for duplicates and multi-weapon ordering', () => {
  assert.deepStrictEqual(normalizeLoadout(['ARMOR', 'ARMOR', 'SHIELD']), {
    loadout: ['ARMOR', null, 'SHIELD'],
    issues: [{ kind: 'DUPLICATE', slot: 2, module: 'ARMOR' }],
  })

  assert.deepStrictEqual(normalizeLoadout(['GRENADE', 'SAW', 'SAW']), {
    loadout: ['GRENADE', null, null],
    issues: [
      { kind: 'DUPLICATE', slot: 3, module: 'SAW' },
      { kind: 'MULTI_WEAPON', slot: 2, module: 'SAW' },
    ],
  })
})
