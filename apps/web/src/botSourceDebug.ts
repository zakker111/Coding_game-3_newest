export function getSourceLines(sourceText: string): string[] {
  return sourceText.split('\n')
}

export function getSourceLineForPc(pcToSourceLine: number[], pc: number): number | null {
  if (!Number.isInteger(pc) || pc < 1 || pc >= pcToSourceLine.length) return null

  const lineNumber = pcToSourceLine[pc]
  if (!Number.isInteger(lineNumber) || lineNumber <= 0) return null
  return lineNumber
}

export function getSourceLineText(sourceText: string, lineNumber: number): string | null {
  if (!Number.isInteger(lineNumber) || lineNumber < 1) return null

  const lines = getSourceLines(sourceText)
  return lines[lineNumber - 1] ?? null
}

export function getLineRangeForLine(sourceText: string, lineNumber: number): { start: number; end: number } | null {
  if (!Number.isInteger(lineNumber) || lineNumber < 1) return null

  const lines = getSourceLines(sourceText)
  if (lineNumber > lines.length) return null

  let start = 0
  for (let i = 0; i < lineNumber - 1; i++) start += lines[i].length + 1

  return {
    start,
    end: start + lines[lineNumber - 1].length,
  }
}
