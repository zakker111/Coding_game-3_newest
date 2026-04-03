import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const repoRoot = path.resolve(__dirname, '..')
const deployRoot = path.join(repoRoot, 'deploy')

async function listFilesRecursive(dir) {
  const out = []

  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const e of entries) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      out.push(...(await listFilesRecursive(p)))
    } else if (e.isFile()) {
      out.push(p)
    }
  }

  return out
}

function stripQueryAndHash(spec) {
  const q = spec.indexOf('?')
  const h = spec.indexOf('#')
  const i = q === -1 ? h : h === -1 ? q : Math.min(q, h)
  return i === -1 ? spec : spec.slice(0, i)
}

function extractSpecifiers(jsText) {
  /** @type {Array<{ spec: string, kind: string }>} */
  const out = []

  // `import ... from 'x'` and `export ... from 'x'`
  // This is intentionally simple (not a full parser) but is adequate for our deploy files.
  const reStatic = /\b(?:import|export)\s+(?:[^'";]*?\sfrom\s*)?['"]([^'"]+)['"]/g
  for (;;) {
    const m = reStatic.exec(jsText)
    if (!m) break
    out.push({ spec: m[1], kind: 'static' })
  }

  // `import('x')`
  const reDynamic = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g
  for (;;) {
    const m = reDynamic.exec(jsText)
    if (!m) break
    out.push({ spec: m[1], kind: 'dynamic' })
  }

  // `new Worker(new URL('./x.js', import.meta.url), { type: 'module' })`
  const reMetaUrl = /new\s+URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/g
  for (;;) {
    const m = reMetaUrl.exec(jsText)
    if (!m) break
    out.push({ spec: m[1], kind: 'importMetaUrl' })
  }

  return out
}

async function fileExists(p) {
  try {
    const st = await fs.stat(p)
    return st.isFile()
  } catch {
    return false
  }
}

function isRelative(spec) {
  return spec.startsWith('./') || spec.startsWith('../')
}

function isHttpLike(spec) {
  return spec.startsWith('http://') || spec.startsWith('https://')
}

async function main() {
  const files = await listFilesRecursive(deployRoot)

  const jsFiles = files.filter((p) => p.endsWith('.js') || p.endsWith('.mjs'))

  /** @type {Array<{ from: string, spec: string, resolved: string }>} */
  const missing = []

  for (const f of jsFiles) {
    const txt = await fs.readFile(f, 'utf8')
    const specs = extractSpecifiers(txt)

    for (const { spec } of specs) {
      if (!spec) continue
      if (isHttpLike(spec)) continue

      const cleaned = stripQueryAndHash(spec)
      if (!isRelative(cleaned)) continue

      const resolved = path.resolve(path.dirname(f), cleaned)
      if (!(await fileExists(resolved))) {
        missing.push({ from: f, spec, resolved })
      }
    }
  }

  if (missing.length) {
    console.error('Missing deploy import targets:') // eslint-disable-line no-console
    for (const m of missing) {
      console.error(`- ${path.relative(repoRoot, m.from)} -> ${m.spec} (resolved: ${path.relative(repoRoot, m.resolved)})`) // eslint-disable-line no-console
    }
    process.exitCode = 1
    return
  }

  console.log(`OK: ${jsFiles.length} deploy JS modules have resolvable relative imports.`) // eslint-disable-line no-console
}

await main()
