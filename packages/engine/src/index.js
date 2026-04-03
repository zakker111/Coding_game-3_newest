/**
 * Phase 2 (compiler): compile bot source text into a deterministic executable
 * instruction list.
 */
export { compileBotSource } from './dsl/compileBotSource.js'

/**
 * Phase 5 (engine): deterministic DSL VM + ruleset-accurate server-style sim.
 */
export { runMatchToReplay } from './sim/runMatchToReplay.js'
