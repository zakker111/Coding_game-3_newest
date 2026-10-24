// Visibility and fork metadata for bot records (Todo 10.5).
//
// visibility: 'public' | 'private'. Private bots are hidden from other users
//   (list, source, versions) and cannot be forked. Builtin bots are always public.
// forkedFrom: 'owner/name' of the bot this one was forked from, or null.
// forkBaseline: { sourceHash, loadout } captured at fork time. A forked bot stays
//   'pending' in the daily league until its source or loadout differs from this.

export const BOT_VISIBILITIES = ['public', 'private']

export function normalizeVisibility(value, fallback = 'public') {
  return BOT_VISIBILITIES.includes(value) ? value : fallback
}

export function normalizeForkedFrom(value) {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

export function normalizeForkBaseline(value) {
  if (!value || typeof value !== 'object') return null
  if (typeof value.sourceHash !== 'string') return null
  return {
    sourceHash: value.sourceHash,
    loadout: Array.isArray(value.loadout) ? value.loadout : [],
  }
}

export function botMetaFields(record) {
  const source = record && typeof record === 'object' ? record : {}
  return {
    visibility: normalizeVisibility(source.visibility),
    forkedFrom: normalizeForkedFrom(source.forkedFrom),
  }
}

// Decide the rankedStatus of a bot after a save.
//   existing: stored record or null
//   next: { sourceHash, loadout, forkBaseline? (fork action), rankedStatus }
// Returns the new rankedStatus.
export function nextRankedStatusAfterSave({ existing, sourceHash, loadout, forked }) {
  if (forked) return 'pending'
  const current = existing?.rankedStatus
  const baseline = normalizeForkBaseline(existing?.forkBaseline)
  if (current === 'pending' && baseline) {
    const changed =
      sourceHash !== baseline.sourceHash || JSON.stringify(loadout) !== JSON.stringify(baseline.loadout)
    if (changed) return 'active'
    return 'pending'
  }
  if (current === 'dropped') return 'pending'
  if (!existing) return 'active'
  return current === 'pending' || current === 'dropped' ? current : 'active'
}
