import type { Loadout, LoadoutIssue, LoadoutIssueKind, ModuleId } from '@coding-game/ruleset'

export type SlotId = 'BOT1' | 'BOT2' | 'BOT3' | 'BOT4'
export type { Loadout, LoadoutIssue, LoadoutIssueKind, ModuleId } from '@coding-game/ruleset'

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

export type Pos = {
  x: number
  y: number
}

export type MoveDir =
  | 'UP'
  | 'DOWN'
  | 'LEFT'
  | 'RIGHT'
  | 'UP_LEFT'
  | 'UP_RIGHT'
  | 'DOWN_LEFT'
  | 'DOWN_RIGHT'

export type ReplayBotState = {
  botId: SlotId
  pos: Pos
  hp: number
  ammo: number
  energy: number
  alive: boolean
  pc: number
  targetBulletId?: string | null
}

export type ReplayBulletState = {
  bulletId: string
  ownerBotId: SlotId
  pos: Pos
  vel: Pos
}

export type ReplayGrenadeState = {
  grenadeId: string
  ownerBotId: SlotId
  pos: Pos
  vel: Pos
  fuse: number
}

export type ReplayPowerupState = {
  powerupId: string
  type: 'HEALTH' | 'AMMO' | 'ENERGY'
  loc: { sector: number; zone: number }
}

export type ReplayTickState = {
  // Redundant with array index, but convenient for tooling.
  t: number
  bots: ReplayBotState[]
  bullets: ReplayBulletState[]
  grenades?: ReplayGrenadeState[]
  powerups: ReplayPowerupState[]
}

export type BotExecReason =
  | 'INVALID_INSTR'
  | 'NO_MODULE'
  | 'NO_EFFECT'
  | 'COOLDOWN'
  | 'NO_AMMO'
  | 'NO_ENERGY'
  | 'INVALID_TARGET_KIND'
  | 'INVALID_TARGET'

export type ResourceDeltaCause =
  | 'SHOOT'
  | 'THROW_GRENADE'
  | 'SAW_DRAIN'
  | 'SHIELD_DRAIN'
  | 'PICKUP_HEALTH'
  | 'PICKUP_AMMO'
  | 'PICKUP_ENERGY'

export type ReplayEventBase = {
  type: string
}

export type BotExecEvent = {
  type: 'BOT_EXEC'
  botId: SlotId
  pcBefore: number
  pcAfter: number
  instrText: string
  result: 'EXECUTED' | 'NOP' | 'ERROR'
  reason?: BotExecReason
}

export type BotMovedEvent = {
  type: 'BOT_MOVED'
  botId: SlotId
  fromPos: Pos
  toPos: Pos
  dir?: MoveDir
}

export type BumpWallEvent = {
  type: 'BUMP_WALL'
  botId: SlotId
  dir: MoveDir
  damage: number
}

export type BumpBotEvent = {
  type: 'BUMP_BOT'
  botId: SlotId
  otherBotId: SlotId
  dir: MoveDir
}

export type ResourceDeltaEvent = {
  type: 'RESOURCE_DELTA'
  botId: SlotId
  ammoDelta: number
  energyDelta: number
  healthDelta: number
  cause: ResourceDeltaCause
}

export type PowerupSpawnEvent = {
  type: 'POWERUP_SPAWN'
  powerupId: string
  powerupType: ReplayPowerupState['type']
  loc: { sector: number; zone: number }
}

export type PowerupPickupEvent = {
  type: 'POWERUP_PICKUP'
  botId: SlotId
  powerupId: string
  powerupType: ReplayPowerupState['type']
  loc: { sector: number; zone: number }
}

export type PowerupDespawnEvent = {
  type: 'POWERUP_DESPAWN'
  powerupId: string
  reason: 'PICKUP' | 'RULES'
}

export type BulletSpawnEvent = {
  type: 'BULLET_SPAWN'
  bulletId: string
  ownerBotId: SlotId
  pos: Pos
  vel: Pos
  targetBotId?: SlotId
  targetPos?: Pos
}

export type BulletMoveEvent = {
  type: 'BULLET_MOVE'
  bulletId: string
  fromPos: Pos
  toPos: Pos
}

export type BulletHitEvent = {
  type: 'BULLET_HIT'
  bulletId: string
  victimBotId: SlotId
  damage: number
  hitPos?: Pos
}

export type BulletDespawnEvent = {
  type: 'BULLET_DESPAWN'
  bulletId: string
  reason: 'TTL' | 'WALL' | 'HIT'
  pos?: Pos
}

export type GrenadeSpawnEvent = {
  type: 'GRENADE_SPAWN'
  grenadeId: string
  ownerBotId: SlotId
  pos: Pos
  vel: Pos
  fuse: number
  targetBotId?: SlotId
  targetPos?: Pos
}

export type GrenadeMoveEvent = {
  type: 'GRENADE_MOVE'
  grenadeId: string
  fromPos: Pos
  toPos: Pos
}

export type GrenadeExplodeEvent = {
  type: 'GRENADE_EXPLODE'
  grenadeId: string
  ownerBotId: SlotId
  pos: Pos
  sector: number
}

export type GrenadeDespawnEvent = {
  type: 'GRENADE_DESPAWN'
  grenadeId: string
  reason: 'TTL' | 'EXPLODED'
  pos?: Pos
}

export type DamageEvent = {
  type: 'DAMAGE'
  victimBotId: SlotId
  amount: number
  source: string
  sourceBotId?: SlotId
  kind: string
  sourceRef?: { type: string; id: string }
}

export type BotDiedEvent = {
  type: 'BOT_DIED'
  victimBotId: SlotId
  creditedBotId?: SlotId
}

export type MatchEndReason = 'LAST_BOT_ALIVE' | 'ALL_DEAD' | 'STALEMATE' | 'TICK_CAP'

export type MatchEndEvent = {
  type: 'MATCH_END'
  endReason: MatchEndReason
}

export type KnownReplayEvent =
  | BotExecEvent
  | BotMovedEvent
  | BumpWallEvent
  | BumpBotEvent
  | ResourceDeltaEvent
  | PowerupSpawnEvent
  | PowerupPickupEvent
  | PowerupDespawnEvent
  | BulletSpawnEvent
  | BulletMoveEvent
  | BulletHitEvent
  | BulletDespawnEvent
  | GrenadeSpawnEvent
  | GrenadeMoveEvent
  | GrenadeExplodeEvent
  | GrenadeDespawnEvent
  | DamageEvent
  | BotDiedEvent
  | MatchEndEvent

export type UnknownReplayEvent = {
  type: string
  [key: string]: unknown
}

export type ReplayEvent = KnownReplayEvent | UnknownReplayEvent

export type Replay = {
  schemaVersion: string
  rulesetVersion: string
  ticksPerSecond: number
  matchSeed: number | string
  // Last valid tick index available in this replay; may be less than the requested
  // simulation limit if the match ended early.
  tickCap: number
  bots: ReplayHeaderBot[]

  // Storage strategy A: full state by tick index.
  // state[0] is the initial pre-tick state; for t>=1, state[t] is the end-of-tick state.
  state: ReplayTickState[]

  // events[0] is []; for t>=1, events[t] transformed state[t-1] -> state[t].
  events: ReplayEvent[][]
}

export type GenerateSampleReplayOptions = {
  tickCap?: number

  /**
   * Optional overrides for the replay header bots.
   *
   * This is primarily for client stubs/tests; the sample generator is not a full DSL runner.
   */
  bots?: Array<{ slotId: SlotId } & Partial<Omit<ReplayHeaderBot, 'slotId'>>>
}

export declare function generateSampleReplay(
  seed: number | string,
  opts?: GenerateSampleReplayOptions
): Replay

export declare function createRng(seed: number | string): () => number

export declare function rngInt(rng: () => number, minInclusive: number, maxInclusive: number): number

export declare function rngChoice<T>(rng: () => number, items: T[]): T
