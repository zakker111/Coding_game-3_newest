import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const EXAMPLES_DIR = fileURLToPath(new URL('../../../../examples', import.meta.url))

function extractFirstTextFence(markdown) {
  const match = String(markdown).match(/```text\s*\n([\s\S]*?)\n```/)
  if (!match) return ''
  const body = match[1].replace(/\s+$/g, '')
  return body.length > 0 ? `${body}\n` : ''
}

function compareExampleNames(a, b) {
  const aNum = Number.parseInt(a.replace(/\D+/g, ''), 10)
  const bNum = Number.parseInt(b.replace(/\D+/g, ''), 10)
  return aNum - bNum
}

export function loadBuiltinExampleBots() {
  const ids = readdirSync(EXAMPLES_DIR)
    .filter((name) => /^bot\d+\.md$/.test(name))
    .sort(compareExampleNames)

  return ids.map((filename) => {
    const id = filename.replace(/\.md$/g, '')
    const markdown = readFileSync(`${EXAMPLES_DIR}/${filename}`, 'utf8')

    return {
      ownerUsername: 'builtin',
      name: id,
      botId: `builtin/${id}`,
      sourceText: extractFirstTextFence(markdown),
    }
  })
}
