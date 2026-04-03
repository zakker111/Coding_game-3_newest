import type { BotSpec } from './messages'

/** FNV-1a 32-bit hash of UTF-16 code units. Deterministic across JS engines. */
export function fnv1a32(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * Mixes the user-provided seed with bot sources so the stub replay changes when source changes.
 *
 * This is NOT a gameplay rule; it's only for the client-only "Run / Preview" stub.
 */
export function mixSeed(seed: number, bots: BotSpec[]): number {
  let h = seed >>> 0
  for (const b of bots) {
    const loadoutSig = (b.loadout || []).map((s) => (s == null ? 'EMPTY' : s)).join(',')
    h ^= fnv1a32(`${b.slotId}\n${b.sourceText}\n${loadoutSig}\n`)
    h = Math.imul(h, 2654435761) >>> 0
  }
  return h >>> 0
}
