export const RULESET_VERSION = '0.2.0'

export const LOADOUT_SLOT_COUNT = 3

export const EMPTY_LOADOUT = /** @type {[null, null, null]} */ ([null, null, null])

export const MODULE_IDS = /** @type {const} */ (['BULLET', 'SAW', 'SHIELD', 'ARMOR', 'GRENADE', 'MINE', 'REPAIR_DRONE'])

export const MODULE_DEFINITIONS = {
  BULLET: {
    id: 'BULLET',
    itemKind: 'MODULE',
    family: 'WEAPON',
    activation: 'INSTANT',
    targetKinds: ['BOT'],
    exclusiveGroup: 'WEAPON',
    uiLabel: 'Bullet',
  },
  SAW: {
    id: 'SAW',
    itemKind: 'MODULE',
    family: 'WEAPON',
    activation: 'TOGGLE',
    targetKinds: ['NONE'],
    exclusiveGroup: 'WEAPON',
    uiLabel: 'Saw',
  },
  SHIELD: {
    id: 'SHIELD',
    itemKind: 'MODULE',
    family: 'DEFENSE',
    activation: 'TOGGLE',
    targetKinds: ['NONE'],
    uiLabel: 'Shield',
  },
  ARMOR: {
    id: 'ARMOR',
    itemKind: 'MODULE',
    family: 'PASSIVE',
    activation: 'PASSIVE',
    targetKinds: ['NONE'],
    uiLabel: 'Armor',
  },
  GRENADE: {
    id: 'GRENADE',
    itemKind: 'MODULE',
    family: 'WEAPON',
    activation: 'INSTANT',
    targetKinds: ['BOT'],
    exclusiveGroup: 'WEAPON',
    uiLabel: 'Grenade',
  },
  MINE: {
    id: 'MINE',
    itemKind: 'MODULE',
    family: 'WEAPON',
    activation: 'INSTANT',
    targetKinds: ['NONE'],
    exclusiveGroup: 'WEAPON',
    uiLabel: 'Mine',
  },
  REPAIR_DRONE: {
    id: 'REPAIR_DRONE',
    itemKind: 'MODULE',
    family: 'UTILITY',
    activation: 'INSTANT',
    targetKinds: ['SELF'],
    uiLabel: 'Repair drone',
  },
}

export function isKnownModuleId(value) {
  return typeof value === 'string' && MODULE_IDS.includes(/** @type {any} */ (value))
}

export function isWeaponModuleId(value) {
  return isKnownModuleId(value) && MODULE_DEFINITIONS[value].exclusiveGroup === 'WEAPON'
}

export function isLoadout(value) {
  return Array.isArray(value) && value.length === LOADOUT_SLOT_COUNT && value.every((slot) => slot == null || isKnownModuleId(slot))
}

export function loadoutHasModule(loadout, moduleId) {
  return isLoadout(loadout) && loadout.includes(moduleId)
}

export function normalizeLoadout(raw) {
  /** @type {unknown[]} */
  const inputArr = Array.isArray(raw) ? raw.slice(0, LOADOUT_SLOT_COUNT) : []
  while (inputArr.length < LOADOUT_SLOT_COUNT) inputArr.push(null)

  /** @type {[import('./index.d.ts').ModuleId | null, import('./index.d.ts').ModuleId | null, import('./index.d.ts').ModuleId | null]} */
  const loadout = [null, null, null]

  /** @type {import('./index.d.ts').LoadoutIssue[]} */
  const issues = []

  for (let i = 0; i < LOADOUT_SLOT_COUNT; i++) {
    const value = inputArr[i]
    if (value == null) {
      loadout[i] = null
      continue
    }

    if (isKnownModuleId(value)) {
      loadout[i] = value
      continue
    }

    issues.push({ kind: 'UNKNOWN_MODULE', slot: /** @type {1 | 2 | 3} */ (i + 1), module: String(value) })
    loadout[i] = null
  }

  const seen = new Set()
  for (let i = 0; i < LOADOUT_SLOT_COUNT; i++) {
    const value = loadout[i]
    if (value == null) continue
    if (!seen.has(value)) {
      seen.add(value)
      continue
    }
    issues.push({ kind: 'DUPLICATE', slot: /** @type {1 | 2 | 3} */ (i + 1), module: value })
    loadout[i] = null
  }

  /** @type {number[]} */
  const weaponSlots = []
  for (let i = 0; i < LOADOUT_SLOT_COUNT; i++) {
    if (isWeaponModuleId(loadout[i])) weaponSlots.push(i)
  }

  if (weaponSlots.length > 1) {
    for (let j = 1; j < weaponSlots.length; j++) {
      const i = weaponSlots[j]
      issues.push({ kind: 'MULTI_WEAPON', slot: /** @type {1 | 2 | 3} */ (i + 1), module: String(loadout[i]) })
      loadout[i] = null
    }
  }

  return { loadout, issues }
}
