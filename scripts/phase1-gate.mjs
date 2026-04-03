import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')

function parseArgs(argv) {
  const out = {
    logFile: path.join(repoRoot, 'phase1-gate.log'),
    skipInstall: false,
  }

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]

    if (a === '--skip-install') out.skipInstall = true

    if ((a === '--log' && argv[i + 1]) || a.startsWith('--log=')) {
      const v = a === '--log' ? argv[++i] : a.slice('--log='.length)
      if (v) out.logFile = path.resolve(repoRoot, v)
    }
  }

  return out
}

function fmtTs(d = new Date()) {
  return d.toISOString()
}

function commandForPnpm() {
  // On Windows, pnpm is typically pnpm.cmd.
  return process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
}

function run(cmd, args, { logStream }) {
  return new Promise((resolve, reject) => {
    const header = `\n===== ${fmtTs()} RUN: ${cmd} ${args.join(' ')} =====\n`
    process.stdout.write(header)
    logStream.write(header)

    const proc = spawn(cmd, args, {
      cwd: repoRoot,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    proc.stdout.on('data', (buf) => {
      process.stdout.write(buf)
      logStream.write(buf)
    })

    proc.stderr.on('data', (buf) => {
      process.stderr.write(buf)
      logStream.write(buf)
    })

    proc.on('error', (err) => {
      const msg = `\n[phase1-gate] spawn error: ${String(err?.stack || err)}\n`
      process.stderr.write(msg)
      logStream.write(msg)
      reject(err)
    })

    proc.on('exit', (code) => {
      if (code === 0) return resolve()
      reject(new Error(`[phase1-gate] command failed (code=${code ?? 'null'}): ${cmd} ${args.join(' ')}`))
    })
  })
}

async function main() {
  const { logFile, skipInstall } = parseArgs(process.argv.slice(2))
  const pnpm = commandForPnpm()

  const logStream = fs.createWriteStream(logFile, { flags: 'w' })
  logStream.write(`# Phase 1 Gate Log\n# started: ${fmtTs()}\n# cwd: ${repoRoot}\n`)

  try {
    if (!skipInstall) {
      await run(pnpm, ['install', '--no-frozen-lockfile'], { logStream })
    }

    await run(pnpm, ['check:deploy'], { logStream })
    await run(pnpm, ['check:deploy:imports'], { logStream })

    await run(pnpm, ['-C', 'packages/engine', 'test'], { logStream })
    await run(pnpm, ['-C', 'packages/replay', 'test'], { logStream })
    await run(pnpm, ['-C', 'apps/web', 'test'], { logStream })

    await run(pnpm, ['qa:phase1'], { logStream })

    const ok = `\n===== ${fmtTs()} SUCCESS: Phase 1 gate complete =====\n`
    process.stdout.write(ok)
    logStream.write(ok)
  } finally {
    logStream.end()
  }
}

main().catch((err) => {
  process.stderr.write(`\n${String(err?.stack || err)}\n`)
  process.exitCode = 1
})
