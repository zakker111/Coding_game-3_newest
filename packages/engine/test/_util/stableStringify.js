export function stableStringify(value) {
  return JSON.stringify(stableClone(value)) ?? 'null'
}

function stableClone(value) {
  if (value == null) return value

  if (Array.isArray(value)) return value.map(stableClone)

  if (typeof value === 'object') {
    const keys = Object.keys(value).sort()
    const out = {}
    for (const k of keys) out[k] = stableClone(value[k])
    return out
  }

  return value
}
