import { createHash } from 'node:crypto'

function countLines(text) {
  return text === '' ? 0 : text.split('\n').length
}

export function normalizeSourceText(raw) {
  return String(raw)
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
}

export function canonicalSourceForHash(sourceText) {
  const normalized = normalizeSourceText(sourceText).replace(/\n+$/g, '')
  if (normalized === '') return ''
  return `${normalized}\n`
}

export function sha256Hex(text) {
  return createHash('sha256').update(text).digest('hex')
}

export function validateSourceLimits(sourceText, config) {
  const lineCount = countLines(sourceText)

  if (sourceText.length > config.maxSourceChars) {
    throw Object.assign(new Error(`Source exceeds ${config.maxSourceChars} characters`), {
      statusCode: 400,
      code: 'SOURCE_LIMIT_EXCEEDED',
      details: { limit: config.maxSourceChars, actual: sourceText.length, kind: 'chars' },
    })
  }

  if (lineCount > config.maxSourceLines) {
    throw Object.assign(new Error(`Source exceeds ${config.maxSourceLines} lines`), {
      statusCode: 400,
      code: 'SOURCE_LIMIT_EXCEEDED',
      details: { limit: config.maxSourceLines, actual: lineCount, kind: 'lines' },
    })
  }
}

export function createSourceSnapshot(rawSourceText, config) {
  const sourceTextSnapshot = normalizeSourceText(rawSourceText)
  validateSourceLimits(sourceTextSnapshot, config)

  return {
    sourceTextSnapshot,
    sourceHash: sha256Hex(canonicalSourceForHash(sourceTextSnapshot)),
  }
}
