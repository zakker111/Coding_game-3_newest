import type { Loadout } from '@coding-game/replay'

import { applyLoadoutHeaderDirectives, DEFAULT_WORKSHOP_LOADOUT, parseLoadoutHeaderDirectives } from './loadout'

export type LocalBot = {
  id: string
  name: string
  sourceText: string
  loadout: Loadout
}

export type LocalBotLibraryV2 = {
  version: 2
  selectedBotId: string
  bots: LocalBot[]
}

export const LOCAL_BOTS_STORAGE_KEY = 'nowt:workshop:myBots:v1'

// Legacy per-slot drafts (pre "My Bots" library).
const LEGACY_DRAFTS_STORAGE_KEY = 'nowt:workshop:drafts:v1'

type LegacyDrafts = Partial<Record<'BOT1' | 'BOT2' | 'BOT3' | 'BOT4', string>>

function isLoadout(v: unknown): v is Loadout {
  if (!Array.isArray(v) || v.length !== 3) return false
  return v.every((slot) => slot === null || slot === 'BULLET' || slot === 'SAW' || slot === 'SHIELD' || slot === 'ARMOR')
}

function deriveInitialLoadoutFromSource(sourceText: string): Loadout {
  const parsed = parseLoadoutHeaderDirectives(sourceText)
  return parsed.hasDirectives ? parsed.loadout : DEFAULT_WORKSHOP_LOADOUT
}

function normalizeBotFromSource(id: string, name: string, sourceText: string, loadout?: Loadout): LocalBot {
  const nextLoadout = loadout ?? deriveInitialLoadoutFromSource(sourceText)
  const nextSourceText = applyLoadoutHeaderDirectives(sourceText, nextLoadout)
  return { id, name, sourceText: nextSourceText, loadout: nextLoadout }
}

export function createDefaultLocalBotLibrary(starterSourceText: string): LocalBotLibraryV2 {
  return {
    version: 2,
    selectedBotId: 'my-bot-1',
    bots: [1, 2, 3].map((i) => normalizeBotFromSource(`my-bot-${i}`, `my-bot-${i}`, starterSourceText)),
  }
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0
}

function normalizeParsedLibrary(parsed: unknown, starterSourceText: string): LocalBotLibraryV2 {
  if (!parsed || typeof parsed !== 'object') return createDefaultLocalBotLibrary(starterSourceText)

  const anyParsed = parsed as any
  const botsRaw: unknown = anyParsed.bots

  const bots: LocalBot[] = Array.isArray(botsRaw)
    ? botsRaw
        .map((b) => {
          if (!b || typeof b !== 'object') return null
          const anyB = b as any

          const id = anyB.id
          const name = anyB.name
          const sourceText = anyB.sourceText

          if (!isNonEmptyString(id)) return null
          if (typeof name !== 'string') return null
          if (typeof sourceText !== 'string') return null

          const loadout: unknown = anyB.loadout
          return normalizeBotFromSource(id, name, sourceText, isLoadout(loadout) ? loadout : undefined)
        })
        .filter((b): b is LocalBot => b != null)
    : []

  const seen = new Set<string>()
  const uniqueBots = bots.filter((b) => {
    if (seen.has(b.id)) return false
    seen.add(b.id)
    return true
  })

  if (!uniqueBots.length) return createDefaultLocalBotLibrary(starterSourceText)

  const selectedBotId = isNonEmptyString(anyParsed.selectedBotId) ? anyParsed.selectedBotId : uniqueBots[0].id
  const selectedExists = uniqueBots.some((b) => b.id === selectedBotId)

  return {
    version: 2,
    selectedBotId: selectedExists ? selectedBotId : uniqueBots[0].id,
    bots: uniqueBots,
  }
}

function readLegacyDrafts(): LegacyDrafts | null {
  try {
    const raw = localStorage.getItem(LEGACY_DRAFTS_STORAGE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as any
    const out: LegacyDrafts = {}

    for (const slot of ['BOT1', 'BOT2', 'BOT3', 'BOT4'] as const) {
      const v = parsed?.[slot]
      if (typeof v === 'string' && v.length > 0) out[slot] = v
    }

    return Object.keys(out).length ? out : null
  } catch {
    return null
  }
}

function createLibraryFromLegacyDrafts(legacy: LegacyDrafts, starterSourceText: string): LocalBotLibraryV2 {
  const bots: LocalBot[] = (['BOT1', 'BOT2', 'BOT3'] as const).map((slotId, i) => {
    const sourceText = legacy[slotId] ?? starterSourceText
    const botNumber = i + 1
    return normalizeBotFromSource(`my-bot-${botNumber}`, `my-bot-${botNumber}`, sourceText)
  })

  if (typeof legacy.BOT4 === 'string' && legacy.BOT4.length > 0) {
    bots.push(normalizeBotFromSource('my-bot-4', 'my-bot-4', legacy.BOT4))
  }

  return {
    version: 2,
    selectedBotId: bots[0].id,
    bots,
  }
}

export function loadLocalBotLibrary(starterSourceText: string): LocalBotLibraryV2 {
  try {
    const raw = localStorage.getItem(LOCAL_BOTS_STORAGE_KEY)

    // Migration path: if no library exists yet, try to import legacy drafts.
    if (!raw) {
      const legacy = readLegacyDrafts()
      const created = legacy
        ? createLibraryFromLegacyDrafts(legacy, starterSourceText)
        : createDefaultLocalBotLibrary(starterSourceText)

      saveLocalBotLibrary(created)
      return created
    }

    const parsed = JSON.parse(raw) as unknown
    const normalized = normalizeParsedLibrary(parsed, starterSourceText)

    // If the stored value was malformed or missing required fields, re-save the normalized value.
    if (JSON.stringify(normalized) !== JSON.stringify(parsed)) {
      saveLocalBotLibrary(normalized)
    }

    return normalized
  } catch {
    const created = createDefaultLocalBotLibrary(starterSourceText)
    saveLocalBotLibrary(created)
    return created
  }
}

export function saveLocalBotLibrary(state: LocalBotLibraryV2) {
  try {
    localStorage.setItem(LOCAL_BOTS_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // ignore quota/unavailable
  }
}

export function createNewLocalBotId(existingIds: Iterable<string>): string {
  const set = new Set(existingIds)
  for (let i = 1; i < 10_000; i++) {
    const id = `my-bot-${i}`
    if (!set.has(id)) return id
  }
  return `my-bot-${Date.now()}`
}
