export const RULESET_VERSION: '0.2.0'

export const LOADOUT_SLOT_COUNT: 3

export const EMPTY_LOADOUT: [null, null, null]

export const MODULE_IDS: readonly ['BULLET', 'SAW', 'SHIELD', 'ARMOR', 'GRENADE']

export type ModuleId = (typeof MODULE_IDS)[number]

export type Loadout = [ModuleId | null, ModuleId | null, ModuleId | null]

export type LoadoutIssueKind = 'UNKNOWN_MODULE' | 'DUPLICATE' | 'MULTI_WEAPON'

export type LoadoutIssue = {
  kind: LoadoutIssueKind
  slot: 1 | 2 | 3
  module?: string
}

export type ModuleDefinition = {
  id: ModuleId
  itemKind: 'MODULE'
  family: 'WEAPON' | 'DEFENSE' | 'UTILITY' | 'PASSIVE' | 'SPAWN'
  activation: 'INSTANT' | 'TOGGLE' | 'PASSIVE'
  targetKinds: readonly ('BOT' | 'LOCATION' | 'NONE')[]
  exclusiveGroup?: 'WEAPON'
  uiLabel: string
}

export const MODULE_DEFINITIONS: Record<ModuleId, ModuleDefinition>

export declare function isKnownModuleId(value: unknown): value is ModuleId

export declare function isWeaponModuleId(value: unknown): value is ModuleId

export declare function isLoadout(value: unknown): value is Loadout

export declare function loadoutHasModule(loadout: unknown, moduleId: ModuleId): boolean

export declare function normalizeLoadout(raw: unknown): {
  loadout: Loadout
  issues: LoadoutIssue[]
}
