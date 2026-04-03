import fs from 'node:fs'
import path from 'node:path'

function getArgValue(args, name) {
  const idx = args.indexOf(name)
  if (idx === -1) return undefined
  return args[idx + 1]
}

function generateMockReplay(seed) {
  return {
    schemaVersion: '0.2.0',
    rulesetVersion: '0.2.0',
    ticksPerSecond: 1,
    matchSeed: seed,
    tickCap: 2,
    bots: [
      {
        slotId: 'BOT1',
        displayName: 'Player',
        appearance: { kind: 'COLOR', color: '#4ade80' },
        loadout: [null, null, null],
        sourceText: 'LABEL LOOP\nWAIT 1\nGOTO LOOP\n',
      },
      {
        slotId: 'BOT2',
        displayName: 'Chaser Shooter',
        appearance: { kind: 'COLOR', color: '#60a5fa' },
        loadout: [null, null, null],
        sourceText: 'LABEL LOOP\nSET_MOVE_TO_TARGET\nWAIT 1\nGOTO LOOP\n',
      },
      {
        slotId: 'BOT3',
        displayName: 'Corner Bunker',
        appearance: { kind: 'COLOR', color: '#f472b6' },
        loadout: [null, null, null],
        sourceText: 'LABEL LOOP\nWAIT 1\nGOTO LOOP\n',
      },
      {
        slotId: 'BOT4',
        displayName: 'Saw Rusher',
        appearance: { kind: 'COLOR', color: '#fbbf24' },
        loadout: [null, null, null],
        sourceText: 'LABEL LOOP\nWAIT 1\nGOTO LOOP\n',
      },
    ],
    state: [
      {
        t: 0,
        bots: [
          {
            botId: 'BOT1',
            pos: { x: 32, y: 32 },
            hp: 100,
            ammo: 50,
            energy: 100,
            alive: true,
          },
          {
            botId: 'BOT2',
            pos: { x: 160, y: 32 },
            hp: 100,
            ammo: 50,
            energy: 100,
            alive: true,
          },
          {
            botId: 'BOT3',
            pos: { x: 32, y: 160 },
            hp: 100,
            ammo: 50,
            energy: 100,
            alive: true,
          },
          {
            botId: 'BOT4',
            pos: { x: 160, y: 160 },
            hp: 100,
            ammo: 50,
            energy: 100,
            alive: true,
          },
        ],
        bullets: [],
        powerups: [],
      },
      {
        t: 1,
        bots: [
          {
            botId: 'BOT1',
            pos: { x: 34, y: 32 },
            hp: 100,
            ammo: 49,
            energy: 100,
            alive: true,
          },
          {
            botId: 'BOT2',
            pos: { x: 158, y: 32 },
            hp: 100,
            ammo: 50,
            energy: 100,
            alive: true,
          },
          {
            botId: 'BOT3',
            pos: { x: 32, y: 160 },
            hp: 100,
            ammo: 50,
            energy: 100,
            alive: true,
          },
          {
            botId: 'BOT4',
            pos: { x: 160, y: 158 },
            hp: 100,
            ammo: 50,
            energy: 100,
            alive: true,
          },
        ],
        bullets: [
          {
            bulletId: 'B1',
            ownerBotId: 'BOT1',
            pos: { x: 42, y: 32 },
            vel: { x: 8, y: 0 },
          },
        ],
        powerups: [
          {
            powerupId: 'P1',
            type: 'AMMO',
            loc: { sector: 5, zone: 0 },
          },
        ],
      },
      {
        t: 2,
        bots: [
          {
            botId: 'BOT1',
            pos: { x: 36, y: 32 },
            hp: 100,
            ammo: 49,
            energy: 100,
            alive: true,
          },
          {
            botId: 'BOT2',
            pos: { x: 156, y: 32 },
            hp: 100,
            ammo: 50,
            energy: 100,
            alive: true,
          },
          {
            botId: 'BOT3',
            pos: { x: 32, y: 160 },
            hp: 100,
            ammo: 50,
            energy: 100,
            alive: true,
          },
          {
            botId: 'BOT4',
            pos: { x: 160, y: 156 },
            hp: 100,
            ammo: 50,
            energy: 100,
            alive: true,
          },
        ],
        bullets: [
          {
            bulletId: 'B1',
            ownerBotId: 'BOT1',
            pos: { x: 50, y: 32 },
            vel: { x: 8, y: 0 },
          },
        ],
        powerups: [
          {
            powerupId: 'P1',
            type: 'AMMO',
            loc: { sector: 5, zone: 0 },
          },
        ],
      },
    ],
  }
}

const args = process.argv.slice(2)
const seedRaw = getArgValue(args, '--seed')
const outPathRaw = getArgValue(args, '--out')
const seed = seedRaw ? Number(seedRaw) : 12345

if (!Number.isFinite(seed)) {
  console.error(`Invalid --seed: ${seedRaw}`)
  process.exit(1)
}

const replay = generateMockReplay(seed)
const json = JSON.stringify(replay, null, 2) + '\n'

if (outPathRaw) {
  const outPath = path.resolve(process.cwd(), outPathRaw)
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, json)
} else {
  process.stdout.write(json)
}
