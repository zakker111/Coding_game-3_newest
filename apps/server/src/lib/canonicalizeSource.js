export function canonicalizeSource(sourceText) {
  const normalized = String(sourceText ?? '').replace(/\r\n?/g, '\n')
  const lines = normalized.split('\n').map((line) => line.replace(/[ \t]+$/g, ''))
  const body = lines.join('\n').replace(/\n*$/, '')
  return body.length ? `${body}\n` : ''
}
