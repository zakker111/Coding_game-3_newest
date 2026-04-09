import type { Replay, SlotId } from '@coding-game/replay'
import type { Loadout } from '@coding-game/ruleset'

export type BotSourceSpec = {
  slotId: SlotId
  sourceText: string

  /** Optional explicit loadout; omitted defaults to empty slots. */
  loadout?: Loadout
}

export type RunMatchParams = {
  /** Match seed (deterministic). */
  seed: number | string

  /** Maximum number of simulation ticks to produce in the replay. */
  tickCap: number

  /** Bot sources for the 4 match slots. */
  bots: BotSourceSpec[]

  /**
   * Optional local-only override: slots listed here start inactive/dead from tick 0.
   * Workshop uses this for client-side "none" opponent slots; server matches should
   * continue providing real bot inputs for all active participants.
   */
  inactiveSlots?: SlotId[]
}

export type BotCompileError = {
  line: number
  message: string
}

export type BotInstruction = {
  kind: string
  [k: string]: unknown
}

export type BotProgram = {
  /** 0-indexed instruction array; runtime `pc` is 1-indexed into this list. */
  instructions: BotInstruction[]

  /** Maps runtime pc -> original source line number (pc 0 is always 0). */
  pcToSourceLine: number[]

  /** Optional debug info: resolved label name -> pc. */
  labels?: Record<string, number>
}

export type BotCompileResult = {
  program: BotProgram
  errors: BotCompileError[]
}

/**
 * Compile stable-v1 bot source into an executable instruction stream.
 */
export declare function compileBotSource(sourceText: string): BotCompileResult

/**
 * Run a full match simulation and return a replay.
 */
export declare function runMatchToReplay(params: RunMatchParams): Replay
