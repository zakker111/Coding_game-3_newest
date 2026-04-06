import { isKnownModuleId } from '@coding-game/ruleset'
import type { Loadout, ModuleId } from '@coding-game/ruleset'
import type { SlotId } from '@coding-game/replay'

function normalizeNewlines(s: string): string {
  return s.replace(/\r\n?/g, '\n')
}

export const DEFAULT_WORKSHOP_LOADOUT: Loadout = ['BULLET', null, null]

function parseModuleId(raw: string): ModuleId | null {
  const upper = raw.trim().toUpperCase()
  if (upper === 'EMPTY' || upper === 'NONE') return null
  if (isKnownModuleId(upper)) return upper
  // Unknown module => treat as empty.
  return null
}

function formatModuleId(mod: ModuleId | null): string {
  return mod == null ? 'EMPTY' : mod
}

export function formatLoadoutHeaderDirectives(loadout: Loadout): string {
  const a = Array.isArray(loadout) ? loadout : ([null, null, null] as Loadout)
  return [`;@slot1 ${formatModuleId(a[0])}`, `;@slot2 ${formatModuleId(a[1])}`, `;@slot3 ${formatModuleId(a[2])}`].join(
    '\n',
  )
}

/**
 * Rewrites a script so the first 3 non-blank lines are the locked loadout directives.
 *
 * Any existing ;@slotN directives found in the leading comment header are removed.
 */
export function applyLoadoutHeaderDirectives(sourceText: string, loadout: Loadout): string {
  const lines = normalizeNewlines(String(sourceText ?? '')).split('\n')

  // Strip leading blank lines so directives become the first 3 non-blank lines.
  let i = 0
  while (i < lines.length && !lines[i].trim()) i++

  const headerLines: string[] = []
  const directiveRe = /^;\s*@slot([123])\s*[:=]?\s*(\S+)\s*$/i

  let j = i

  // If the script starts with a comment header, preserve it (minus directives).
  if (j < lines.length && lines[j].trim().startsWith(';')) {
    while (j < lines.length) {
      const trimmed = lines[j].trim()
      if (!trimmed) {
        headerLines.push(lines[j])
        j++
        continue
      }

      if (!trimmed.startsWith(';')) break

      if (!directiveRe.test(trimmed)) {
        headerLines.push(lines[j])
      }

      j++
    }
  }

  // Avoid double-blank lines between directives and the preserved header.
  while (headerLines.length && !headerLines[0]!.trim()) headerLines.shift()

  const restLines = lines.slice(j)

  const outLines = [formatLoadoutHeaderDirectives(loadout), '', ...headerLines, ...restLines]

  // Join and keep a trailing newline to match how the app stores sources.
  const out = outLines.join('\n').replace(/\s+$/, '')
  return out.length ? `${out}\n` : ''
}

export type LoadoutParseResult = {
  loadout: Loadout

  /** True if we saw at least one ;@slotN directive (even if it set EMPTY). */
  hasDirectives: boolean
}

/**
 * Parse Workshop "locked header" loadout directives from the top-of-script comment header:
 *   ;@slot1 BULLET
 *   ;@slot2 EMPTY
 *   ;@slot3 ARMOR
 *
 * Only the first 3 non-blank comment lines are considered.
 */
export function parseLoadoutHeaderDirectives(sourceText: string): LoadoutParseResult {
  const lines = normalizeNewlines(String(sourceText ?? '')).split('\n')

  const loadout: Loadout = [null, null, null]

  let headerCommentLinesSeen = 0
  let hasDirectives = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // Only scan the leading comment header.
    if (!trimmed.startsWith(';')) break

    headerCommentLinesSeen++

    const m = trimmed.match(/^;\s*@slot([123])\s*[:=]?\s*(\S+)\s*$/i)
    if (m) {
      const slot = Number(m[1])
      const mod = parseModuleId(m[2])

      hasDirectives = true
      if (slot >= 1 && slot <= 3) loadout[slot - 1] = mod
    }

    if (headerCommentLinesSeen >= 3) break
  }

  return { loadout, hasDirectives }
}

/**
 * Temporary Phase 2 wiring: derive a per-slot Loadout from source headers.
 *
 * If no directives are present, default to the empty loadout.
 *
 * This matches the `rulesetVersion = 0.2.0` contract: omitted/unknown loadouts are not silently inferred.
 */
export function deriveLoadoutForSlot(_slotId: SlotId, sourceText: string): Loadout {
  const parsed = parseLoadoutHeaderDirectives(sourceText)

  if (!parsed.hasDirectives) return [null, null, null]
  return parsed.loadout
}
