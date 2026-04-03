export type SlotId = 'BOT1' | 'BOT2' | 'BOT3' | 'BOT4'

export type ModuleId = 'BULLET' | 'SAW' | 'SHIELD' | 'ARMOR'

export type Loadout = [ModuleId | null, ModuleId | null, ModuleId | null]

export type LoadoutIssueKind = 'UNKNOWN_MODULE' | 'DUPLICATE' | 'MULTI_WEAPON'

export type LoadoutIssue = {
  kind: LoadoutIssueKind
  slot: 1 | 2 | 3
  module?: string
}

export type ReplayAppearance = {
  kind: 'COLOR'
  color: string
}

export type ReplayHeaderBot = {
  slotId: SlotId
  displayName: string
  appearance: ReplayAppearance
  sourceText?: string

  /** Ruleset-specific equipped modules; omitted for legacy replays. */
  loadout?: Loadout

  /** If the provided loadout was invalid, a deterministic normalization may have been applied. */
  loadoutIssues?: LoadoutIssue[]
}

export type ReplayBotState = {
  botId: SlotId
  pos: { x: number; y: number }
  hp: number
  ammo: number
  /**
   * Optional in early MVP replays.
   * Viewer must treat missing energy as 0.
   */
  energy?: number
  alive: boolean
}

export type ReplayBulletState = {
  bulletId: string
  ownerBotId: SlotId
  pos: { x: number; y: number }
  vel: { x: number; y: number }
}

export type ReplayPowerupState = {
  powerupId: string
  type: 'HEALTH' | 'AMMO' | 'ENERGY'
  loc: { sector: number; zone: number }
  /** Optional explicit world position (if present, prefer over loc mapping). */
  pos?: { x: number; y: number }
}

export type ReplayTickState = {
  t: number
  bots: ReplayBotState[]
  bullets: ReplayBulletState[]
  powerups: ReplayPowerupState[]
}

export type Replay = {
  schemaVersion: string
  rulesetVersion: string
  ticksPerSecond: number
  matchSeed: number | string
  tickCap: number
  bots: ReplayHeaderBot[]
  state: ReplayTickState[]

  /**
   * Optional in early MVP mock replays.
   * When present, events[t] explain state[t-1] -> state[t].
   */
  events?: unknown[][]
}
