import React from 'react'
import { Link } from 'react-router-dom'

import { compileBotSource } from '@coding-game/engine'
import type { KnownReplayEvent, Loadout, ModuleId, Replay, ReplayEvent, SlotId } from '@coding-game/replay'

import { getLineRangeForLine, getSourceLineForPc, getSourceLineText, getSourceLines } from '../botSourceDebug'
import { EXAMPLE_BOTS, EXAMPLE_OPPONENT_IDS } from '../exampleBots'
import {
  createNewLocalBotId,
  createDefaultLocalBotLibrary,
  loadLocalBotLibrary,
  MAX_LOCAL_BOTS,
  saveLocalBotLibrary,
  type LocalBotLibraryV2,
} from '../localBots'
import { selectDistinctFromPool } from '../opponents'
import { applyLoadoutHeaderDirectives, DEFAULT_WORKSHOP_LOADOUT, parseLoadoutHeaderDirectives } from '../loadout'
import { fnv1a32 } from '../worker/seed'

import { initialPlaybackState, playbackReducer } from '../replay/playbackReducer'
import { getAppearanceColorMap, getBotsForPlayback, SLOT_IDS } from '../replay/interpolate'
import { ArenaCanvas, type ArenaRenderState } from '../ui/arena'
import { runLocalInWorker } from '../worker/runLocalInWorker'

const LOADOUT_OPTION_VALUES = ['EMPTY', 'BULLET', 'SAW', 'SHIELD', 'ARMOR'] as const
type LoadoutOptionValue = (typeof LOADOUT_OPTION_VALUES)[number]

function parseLoadoutOptionValue(v: string): ModuleId | null {
  const upper = String(v ?? '').toUpperCase()
  if (upper === 'EMPTY') return null
  if (upper === 'BULLET' || upper === 'SAW' || upper === 'SHIELD' || upper === 'ARMOR') return upper
  return null
}

function formatLoadoutOptionValue(mod: ModuleId | null): LoadoutOptionValue {
  if (mod === 'BULLET' || mod === 'SAW' || mod === 'SHIELD' || mod === 'ARMOR') return mod
  return 'EMPTY'
}

const OPPONENT_NONCE_KEY = 'nowt:workshop:opponentNonce:v1'
const OPPONENT_ASSIGNMENTS_KEY = 'nowt:workshop:opponents:v1'

type OpponentAssignments = {
  BOT2: string
  BOT3: string
  BOT4: string
}

type StoredOpponentAssignmentsV1 = {
  version: 1
} & OpponentAssignments

const DEFAULT_OPPONENT_ASSIGNMENTS: StoredOpponentAssignmentsV1 = {
  version: 1,
  BOT2: 'bot2',
  BOT3: 'bot3',
  BOT4: 'bot4',
}

const OPPONENT_SLOTS = ['BOT2', 'BOT3', 'BOT4'] as const

function readOpponentNonce(): number {
  try {
    const raw = localStorage.getItem(OPPONENT_NONCE_KEY)
    const n = raw == null ? 0 : Number(raw)
    return Number.isFinite(n) ? (n >>> 0) : 0
  } catch {
    return 0
  }
}

function writeOpponentNonce(n: number) {
  try {
    localStorage.setItem(OPPONENT_NONCE_KEY, String(n >>> 0))
  } catch {
    // ignore
  }
}

function readOpponentAssignments(): OpponentAssignments {
  try {
    const raw = localStorage.getItem(OPPONENT_ASSIGNMENTS_KEY)
    if (!raw) {
      return {
        BOT2: DEFAULT_OPPONENT_ASSIGNMENTS.BOT2,
        BOT3: DEFAULT_OPPONENT_ASSIGNMENTS.BOT3,
        BOT4: DEFAULT_OPPONENT_ASSIGNMENTS.BOT4,
      }
    }

    const parsed = JSON.parse(raw) as Partial<StoredOpponentAssignmentsV1>
    if (parsed.version !== 1) {
      return {
        BOT2: DEFAULT_OPPONENT_ASSIGNMENTS.BOT2,
        BOT3: DEFAULT_OPPONENT_ASSIGNMENTS.BOT3,
        BOT4: DEFAULT_OPPONENT_ASSIGNMENTS.BOT4,
      }
    }

    return {
      BOT2: typeof parsed.BOT2 === 'string' ? parsed.BOT2 : DEFAULT_OPPONENT_ASSIGNMENTS.BOT2,
      BOT3: typeof parsed.BOT3 === 'string' ? parsed.BOT3 : DEFAULT_OPPONENT_ASSIGNMENTS.BOT3,
      BOT4: typeof parsed.BOT4 === 'string' ? parsed.BOT4 : DEFAULT_OPPONENT_ASSIGNMENTS.BOT4,
    }
  } catch {
    return {
      BOT2: DEFAULT_OPPONENT_ASSIGNMENTS.BOT2,
      BOT3: DEFAULT_OPPONENT_ASSIGNMENTS.BOT3,
      BOT4: DEFAULT_OPPONENT_ASSIGNMENTS.BOT4,
    }
  }
}

function normalizeOpponentAssignments(prev: OpponentAssignments, poolIds: string[]): OpponentAssignments {
  if (poolIds.length < 3) {
    throw new Error(`Not enough opponent choices (${poolIds.length})`)
  }

  const used = new Set<string>()
  const next: OpponentAssignments = { ...prev }

  for (const slot of OPPONENT_SLOTS) {
    const current = prev[slot]

    if (poolIds.includes(current) && !used.has(current)) {
      next[slot] = current
      used.add(current)
      continue
    }

    const replacement = poolIds.find((id) => !used.has(id))
    if (!replacement) break

    next[slot] = replacement
    used.add(replacement)
  }

  if (next.BOT2 === prev.BOT2 && next.BOT3 === prev.BOT3 && next.BOT4 === prev.BOT4) return prev
  return next
}

function isRelevantEvent(e: ReplayEvent, botId: SlotId): boolean {
  switch (e.type) {
    case 'BOT_EXEC':
    case 'BOT_MOVED':
    case 'RESOURCE_DELTA':
    case 'BUMP_WALL':
      return e.botId === botId
    case 'BUMP_BOT':
      return e.botId === botId || e.otherBotId === botId
    case 'BULLET_SPAWN':
      return e.ownerBotId === botId || e.targetBotId === botId
    case 'BULLET_HIT':
      return e.victimBotId === botId
    case 'DAMAGE':
      return e.victimBotId === botId || e.sourceBotId === botId
    case 'BOT_DIED':
      return e.victimBotId === botId || e.creditedBotId === botId
    case 'POWERUP_PICKUP':
      return e.botId === botId
    case 'POWERUP_SPAWN':
    case 'POWERUP_DESPAWN':
      return true
    default:
      return false
  }
}

function isKnownReplayEventType<TType extends KnownReplayEvent['type']>(
  e: ReplayEvent,
  type: TType,
): e is Extract<KnownReplayEvent, { type: TType }> {
  return e.type === type
}

function deriveLoadoutFromScriptOrDefault(sourceText: string): Loadout {
  const parsed = parseLoadoutHeaderDirectives(sourceText)
  return parsed.hasDirectives ? parsed.loadout : DEFAULT_WORKSHOP_LOADOUT
}

type OpponentOption = {
  id: string
  displayName: string
  sourceText: string
  loadout: Loadout
}

type AppliedRunInfo = {
  seed: number
  tickCap: number
  bot1Id: string
  bot1Name: string
  botSpecHashBySlot: Record<SlotId, number>
}

type TickEventLine = {
  key: string
  label: string
  detail?: string
  tone?: 'muted' | 'bad' | 'good'
}

const BOT_ID_NAME_FIELDS = [
  ['botId', 'botName'],
  ['otherBotId', 'otherBotName'],
  ['ownerBotId', 'ownerBotName'],
  ['targetBotId', 'targetBotName'],
  ['victimBotId', 'victimBotName'],
  ['sourceBotId', 'sourceBotName'],
  ['creditedBotId', 'creditedBotName'],
] as const

function formatTickEventLine(e: KnownReplayEvent): TickEventLine {
  switch (e.type) {
    case 'BOT_EXEC': {
      const tone = e.result === 'EXECUTED' ? 'good' : e.reason ? 'bad' : 'muted'
      return {
        key: `BOT_EXEC:${e.botId}:${e.pcBefore}:${e.pcAfter}`,
        label: `${e.botId} BOT_EXEC`,
        detail: `${e.instrText}  (pc ${e.pcBefore}→${e.pcAfter}, ${e.result}${e.reason ? `, ${e.reason}` : ''})`,
        tone,
      }
    }
    case 'BOT_MOVED':
      return {
        key: `BOT_MOVED:${e.botId}:${e.fromPos.x},${e.fromPos.y}->${e.toPos.x},${e.toPos.y}`,
        label: `${e.botId} moved`,
        detail: `${e.fromPos.x},${e.fromPos.y} → ${e.toPos.x},${e.toPos.y}${e.dir ? ` (${e.dir})` : ''}`,
      }
    case 'BUMP_WALL':
      return {
        key: `BUMP_WALL:${e.botId}:${e.dir}`,
        label: `${e.botId} bumped wall`,
        detail: `${e.dir} (damage ${e.damage})`,
        tone: e.damage > 0 ? 'bad' : 'muted',
      }
    case 'BUMP_BOT':
      return {
        key: `BUMP_BOT:${e.botId}:${e.otherBotId}:${e.dir}`,
        label: `bump`,
        detail: `${e.botId} ↔ ${e.otherBotId} (${e.dir})`,
      }
    case 'RESOURCE_DELTA': {
      const parts = []
      if (e.healthDelta) parts.push(`HP ${e.healthDelta > 0 ? '+' : ''}${e.healthDelta}`)
      if (e.ammoDelta) parts.push(`AMMO ${e.ammoDelta > 0 ? '+' : ''}${e.ammoDelta}`)
      if (e.energyDelta) parts.push(`ENERGY ${e.energyDelta > 0 ? '+' : ''}${e.energyDelta}`)
      return {
        key: `RESOURCE_DELTA:${e.botId}:${e.cause}:${parts.join(',')}`,
        label: `${e.botId} resources`,
        detail: `${parts.join(', ') || '(no delta)'} (${e.cause})`,
        tone: e.healthDelta < 0 ? 'bad' : e.healthDelta > 0 ? 'good' : 'muted',
      }
    }
    case 'DAMAGE':
      return {
        key: `DAMAGE:${e.victimBotId}:${e.amount}:${e.source}:${e.sourceBotId ?? ''}`,
        label: `damage`,
        detail: `${e.victimBotId} -${e.amount} (${e.source}${e.sourceBotId ? ` by ${e.sourceBotId}` : ''}, ${e.kind})`,
        tone: 'bad',
      }
    case 'BOT_DIED':
      return {
        key: `BOT_DIED:${e.victimBotId}:${e.creditedBotId ?? ''}`,
        label: `death`,
        detail: `${e.victimBotId} died${e.creditedBotId ? ` (credited ${e.creditedBotId})` : ''}`,
        tone: 'bad',
      }
    case 'BULLET_SPAWN':
      return {
        key: `BULLET_SPAWN:${e.bulletId}`,
        label: `bullet spawn`,
        detail: `${e.ownerBotId} @ ${e.pos.x},${e.pos.y} vel ${e.vel.x},${e.vel.y}`,
      }
    case 'BULLET_HIT':
      return {
        key: `BULLET_HIT:${e.bulletId}:${e.victimBotId}`,
        label: `bullet hit`,
        detail: `${e.bulletId} hit ${e.victimBotId} (${e.damage})`,
        tone: 'bad',
      }
    case 'BULLET_DESPAWN':
      return {
        key: `BULLET_DESPAWN:${e.bulletId}:${e.reason}`,
        label: `bullet despawn`,
        detail: `${e.bulletId} (${e.reason})`,
        tone: 'muted',
      }
    case 'POWERUP_PICKUP':
      return {
        key: `POWERUP_PICKUP:${e.powerupId}:${e.botId}`,
        label: `powerup pickup`,
        detail: `${e.botId} picked ${e.powerupType} (${e.loc.sector}/${e.loc.zone})`,
        tone: 'good',
      }
    case 'POWERUP_SPAWN':
      return {
        key: `POWERUP_SPAWN:${e.powerupId}`,
        label: `powerup spawn`,
        detail: `${e.powerupType} at ${e.loc.sector}/${e.loc.zone}`,
        tone: 'muted',
      }
    case 'POWERUP_DESPAWN':
      return {
        key: `POWERUP_DESPAWN:${e.powerupId}:${e.reason}`,
        label: `powerup despawn`,
        detail: `${e.powerupId} (${e.reason})`,
        tone: 'muted',
      }
    case 'MATCH_END':
      return { key: 'MATCH_END', label: 'match end', detail: e.endReason, tone: 'muted' }
    default:
      return { key: e.type, label: e.type, detail: JSON.stringify(e), tone: 'muted' }
  }
}

function tickEventSearchText(e: KnownReplayEvent, displayNameBySlot: Record<SlotId, string>) {
  const { label, detail } = formatTickEventLine(e)
  const parts = [label, detail]
  const eventRecord = e as Record<string, unknown>

  for (const [idKey] of BOT_ID_NAME_FIELDS) {
    const id = eventRecord[idKey]
    if (typeof id !== 'string') continue
    parts.push(id)
    const displayName = displayNameBySlot[id as SlotId]
    if (displayName && displayName !== id) parts.push(displayName)
  }

  return parts.filter(Boolean).join(' ')
}

function tickEventMatchesFilter(e: KnownReplayEvent, displayNameBySlot: Record<SlotId, string>, query: string) {
  const qq = typeof query === 'string' ? query.trim().toLowerCase() : ''
  if (!qq) return true
  return tickEventSearchText(e, displayNameBySlot).toLowerCase().includes(qq)
}

function withTickEventNames(e: KnownReplayEvent, displayNameBySlot: Record<SlotId, string>) {
  const eventRecord = e as Record<string, unknown>
  const out: Record<string, unknown> = { ...eventRecord }

  for (const [idKey, nameKey] of BOT_ID_NAME_FIELDS) {
    const id = eventRecord[idKey]
    if (typeof id !== 'string') continue
    const displayName = displayNameBySlot[id as SlotId]
    if (displayName) out[nameKey] = displayName
  }

  return out
}

function buildRawTickEventsPayload(params: {
  events: KnownReplayEvent[]
  displayNameBySlot: Record<SlotId, string>
  selectedBotId: SlotId
  showAllTickEvents: boolean
  query: string
  totalCount: number
}) {
  const { events, displayNameBySlot, selectedBotId, showAllTickEvents, query, totalCount } = params
  const eventsWithNames = events.map((e) => withTickEventNames(e, displayNameBySlot))

  if (!query) {
    return {
      scope: showAllTickEvents ? 'all' : selectedBotId,
      nameMap: displayNameBySlot,
      events,
      eventsWithNames,
    }
  }

  return {
    scope: showAllTickEvents ? 'all' : selectedBotId,
    nameMap: displayNameBySlot,
    query,
    totalCount,
    matchedCount: events.length,
    events,
    eventsWithNames,
  }
}

function serializeReplay(replay: Replay) {
  return JSON.stringify(replay, null, 2)
}

export function WorkshopPage() {
  const editorTextareaRef = React.useRef<HTMLTextAreaElement | null>(null)
  const [seed, setSeed] = React.useState<number>(12345)
  const [tickCap, setTickCap] = React.useState<number>(200)

  const starterSourceText = EXAMPLE_BOTS.bot0.sourceText

  const [myBots, setMyBots] = React.useState<LocalBotLibraryV2>(() =>
    createDefaultLocalBotLibrary(starterSourceText),
  )
  const [opponents, setOpponents] = React.useState<OpponentAssignments>({
    BOT2: DEFAULT_OPPONENT_ASSIGNMENTS.BOT2,
    BOT3: DEFAULT_OPPONENT_ASSIGNMENTS.BOT3,
    BOT4: DEFAULT_OPPONENT_ASSIGNMENTS.BOT4,
  })
  const [loaded, setLoaded] = React.useState(false)

  const [selectedBotId, setSelectedBotId] = React.useState<SlotId>('BOT1')

  const [running, setRunning] = React.useState(false)
  const [runError, setRunError] = React.useState<string | null>(null)
  const [appliedRun, setAppliedRun] = React.useState<AppliedRunInfo | null>(null)

  const [showAllTickEvents, setShowAllTickEvents] = React.useState(false)
  const [showRawTickEvents, setShowRawTickEvents] = React.useState(false)
  const [tickEventsFilter, setTickEventsFilter] = React.useState('')
  const [replayExportNotice, setReplayExportNotice] = React.useState<{ tone: 'good' | 'bad'; text: string } | null>(null)

  const [playback, dispatch] = React.useReducer(playbackReducer, initialPlaybackState)
  const [alpha, setAlpha] = React.useState(1)

  React.useEffect(() => {
    setMyBots(loadLocalBotLibrary(starterSourceText))
    setOpponents(readOpponentAssignments())
    setLoaded(true)
  }, [starterSourceText])

  React.useEffect(() => {
    if (!loaded) return
    saveLocalBotLibrary(myBots)
  }, [loaded, myBots])

  React.useEffect(() => {
    if (!loaded) return

    try {
      const stored: StoredOpponentAssignmentsV1 = { version: 1, ...opponents }
      localStorage.setItem(OPPONENT_ASSIGNMENTS_KEY, JSON.stringify(stored))
    } catch {
      // ignore quota/unavailable
    }
  }, [loaded, opponents])

  const selectedMyBot = React.useMemo(() => {
    return myBots.bots.find((b) => b.id === myBots.selectedBotId) ?? myBots.bots[0]
  }, [myBots])

  const opponentPool: OpponentOption[] = React.useMemo(() => {
    const exampleOpponents: OpponentOption[] = EXAMPLE_OPPONENT_IDS.map((id) => ({
      id,
      displayName: EXAMPLE_BOTS[id].displayName,
      sourceText: EXAMPLE_BOTS[id].sourceText,
      loadout: deriveLoadoutFromScriptOrDefault(EXAMPLE_BOTS[id].sourceText),
    }))

    const localOpponents: OpponentOption[] = myBots.bots
      .filter((b) => b.id !== selectedMyBot.id)
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((b) => ({
        id: b.id,
        displayName: `${b.name} (my bot)`,
        sourceText: b.sourceText,
        loadout: b.loadout,
      }))

    return [...exampleOpponents, ...localOpponents]
  }, [myBots.bots, selectedMyBot.id])

  const opponentPoolById = React.useMemo(() => {
    return new Map(opponentPool.map((o) => [o.id, o]))
  }, [opponentPool])

  const opponentPoolIds = React.useMemo(() => opponentPool.map((o) => o.id), [opponentPool])

  React.useEffect(() => {
    setOpponents((prev) => normalizeOpponentAssignments(prev, opponentPoolIds))
  }, [opponentPoolIds])

  const sourcesBySlot: Record<SlotId, string> = React.useMemo(() => {
    return {
      BOT1: selectedMyBot.sourceText,
      BOT2: opponentPoolById.get(opponents.BOT2)?.sourceText ?? '',
      BOT3: opponentPoolById.get(opponents.BOT3)?.sourceText ?? '',
      BOT4: opponentPoolById.get(opponents.BOT4)?.sourceText ?? '',
    }
  }, [opponents.BOT2, opponents.BOT3, opponents.BOT4, opponentPoolById, selectedMyBot.sourceText])

  const loadoutBySlot: Record<SlotId, Loadout> = React.useMemo(() => {
    return {
      BOT1: selectedMyBot.loadout ?? DEFAULT_WORKSHOP_LOADOUT,
      BOT2: opponentPoolById.get(opponents.BOT2)?.loadout ?? DEFAULT_WORKSHOP_LOADOUT,
      BOT3: opponentPoolById.get(opponents.BOT3)?.loadout ?? DEFAULT_WORKSHOP_LOADOUT,
      BOT4: opponentPoolById.get(opponents.BOT4)?.loadout ?? DEFAULT_WORKSHOP_LOADOUT,
    }
  }, [opponents.BOT2, opponents.BOT3, opponents.BOT4, opponentPoolById, selectedMyBot.loadout])

  const displayNameBySlot: Record<SlotId, string> = React.useMemo(() => {
    const normalizeOpponentLabel = (name: string) => name.replace(/\s+\(my bot\)$/, '')

    return {
      BOT1: selectedMyBot.name,
      BOT2: normalizeOpponentLabel(opponentPoolById.get(opponents.BOT2)?.displayName ?? 'BOT2'),
      BOT3: normalizeOpponentLabel(opponentPoolById.get(opponents.BOT3)?.displayName ?? 'BOT3'),
      BOT4: normalizeOpponentLabel(opponentPoolById.get(opponents.BOT4)?.displayName ?? 'BOT4'),
    }
  }, [opponents.BOT2, opponents.BOT3, opponents.BOT4, opponentPoolById, selectedMyBot.name])

  const opponentCards = React.useMemo(() => {
    return OPPONENT_SLOTS.map((slotId) => ({
      slotId,
      opponent: opponentPoolById.get(opponents[slotId]),
      loadout: loadoutBySlot[slotId],
    }))
  }, [loadoutBySlot, opponentPoolById, opponents])

  const currentBotSpecHashBySlot: Record<SlotId, number> = React.useMemo(() => {
    const sig = (loadout: Loadout) => loadout.map((s) => (s == null ? 'EMPTY' : s)).join(',')

    return {
      BOT1: fnv1a32(`${sourcesBySlot.BOT1}\n${sig(loadoutBySlot.BOT1)}\n`),
      BOT2: fnv1a32(`${sourcesBySlot.BOT2}\n${sig(loadoutBySlot.BOT2)}\n`),
      BOT3: fnv1a32(`${sourcesBySlot.BOT3}\n${sig(loadoutBySlot.BOT3)}\n`),
      BOT4: fnv1a32(`${sourcesBySlot.BOT4}\n${sig(loadoutBySlot.BOT4)}\n`),
    }
  }, [loadoutBySlot, sourcesBySlot])

  const previewUpToDate = React.useMemo(() => {
    if (!playback.replay || !appliedRun) return false
    if (appliedRun.seed !== seed) return false
    if (appliedRun.tickCap !== tickCap) return false
    if (appliedRun.bot1Id !== selectedMyBot.id) return false

    return SLOT_IDS.every((slotId) => appliedRun.botSpecHashBySlot[slotId] === currentBotSpecHashBySlot[slotId])
  }, [appliedRun, currentBotSpecHashBySlot, playback.replay, seed, selectedMyBot.id, tickCap])

  const previewStatusText = !playback.replay ? 'Not run yet' : previewUpToDate ? 'Applied' : 'Out of date'

  React.useEffect(() => {
    const replay = playback.replay
    if (!replay) return

    if (!playback.playing) {
      setAlpha(1)
      return
    }

    let rafId = 0
    let lastNow = performance.now()
    let accMs = 0

    const tickMs = 1000 / replay.ticksPerSecond

    const frame = (now: number) => {
      const dt = now - lastNow
      lastNow = now

      accMs += dt * playback.speed

      const steps = Math.floor(accMs / tickMs)
      if (steps > 0) {
        accMs -= steps * tickMs
        dispatch({ type: 'STEP', delta: steps })
      }

      setAlpha(accMs / tickMs)
      rafId = window.requestAnimationFrame(frame)
    }

    rafId = window.requestAnimationFrame(frame)
    return () => window.cancelAnimationFrame(rafId)
  }, [playback.playing, playback.speed, playback.replay])

  const replay = playback.replay

  React.useEffect(() => {
    setReplayExportNotice(null)
  }, [replay])

  const appearanceMap = React.useMemo(() => {
    return replay ? getAppearanceColorMap(replay) : ({} as Record<SlotId, string>)
  }, [replay])

  const botsForRender = React.useMemo(() => {
    if (!replay) return []
    return getBotsForPlayback(replay, playback.tick, playback.playing ? alpha : 1)
  }, [alpha, playback.playing, playback.tick, replay])

  const bulletsForRender = React.useMemo(() => {
    if (!replay) return []

    const t = clamp(playback.tick, 0, replay.tickCap)
    const a = playback.playing ? alpha : 1

    const next = replay.state[t]
    const prev = t > 0 ? replay.state[t - 1] : next

    if (!next || !prev) return []

    const prevById = new Map(prev.bullets.map((b) => [b.bulletId, b]))
    const nextById = new Map(next.bullets.map((b) => [b.bulletId, b]))

    const bulletIds = new Set<string>()
    for (const b of prev.bullets) bulletIds.add(b.bulletId)
    for (const b of next.bullets) bulletIds.add(b.bulletId)

    const spawnsByBulletId = new Map(
      (replay.events[t] ?? [])
        .filter((e): e is Extract<KnownReplayEvent, { type: 'BULLET_SPAWN' }> => isKnownReplayEventType(e, 'BULLET_SPAWN'))
        .map((e) => [e.bulletId, e]),
    )

    const despawnsByBulletId = new Map(
      (replay.events[t] ?? [])
        .filter((e): e is Extract<KnownReplayEvent, { type: 'BULLET_DESPAWN' }> => isKnownReplayEventType(e, 'BULLET_DESPAWN'))
        .map((e) => [e.bulletId, e]),
    )

    const out = [] as Array<{
      bulletId: string
      ownerBotId: SlotId
      pos: { x: number; y: number }
      vel: { x: number; y: number }
      alpha?: number
    }>

    for (const bulletId of bulletIds) {
      const b0 = prevById.get(bulletId)
      const b1 = nextById.get(bulletId)
      if (!b0 && !b1) continue

      // Despawn: bullet present in prev, missing in next.
      if (b0 && !b1) {
        if (a >= 1) continue

        const despawn = despawnsByBulletId.get(bulletId)
        const to = despawn?.pos ?? b0.pos

        out.push({
          bulletId,
          ownerBotId: b0.ownerBotId,
          vel: b0.vel,
          pos: {
            x: b0.pos.x + (to.x - b0.pos.x) * a,
            y: b0.pos.y + (to.y - b0.pos.y) * a,
          },
          alpha: 1 - a,
        })
        continue
      }

      // Spawn: bullet missing in prev, present in next.
      if (!b0 && b1) {
        const spawn = spawnsByBulletId.get(bulletId)
        const from = spawn?.pos ?? { x: b1.pos.x - b1.vel.x, y: b1.pos.y - b1.vel.y }

        out.push({
          bulletId,
          ownerBotId: b1.ownerBotId,
          vel: b1.vel,
          pos: {
            x: from.x + (b1.pos.x - from.x) * a,
            y: from.y + (b1.pos.y - from.y) * a,
          },
        })
        continue
      }

      // Normal movement.
      const from = b0?.pos ?? b1!.pos
      const to = b1?.pos ?? b0!.pos
      const vel = b1?.vel ?? b0!.vel
      const ownerBotId = b1?.ownerBotId ?? b0!.ownerBotId

      out.push({
        bulletId,
        ownerBotId,
        vel,
        pos: {
          x: from.x + (to.x - from.x) * a,
          y: from.y + (to.y - from.y) * a,
        },
      })
    }

    return out
  }, [alpha, playback.playing, playback.tick, replay])

  const powerupsForRender = React.useMemo(() => {
    if (!replay) return []
    const t = clamp(playback.tick, 0, replay.tickCap)
    const snap = replay.state[t]
    const powerups = snap?.powerups ?? []

    return powerups.map((p) => ({
      powerupId: p.powerupId,
      kind: p.type,
      pos: powerupLocToWorld(p.loc),
    }))
  }, [playback.tick, replay])

  const renderState: ArenaRenderState = React.useMemo(() => {
    return {
      bots: botsForRender.map((b) => ({
        slotId: b.botId,
        pos: b.pos,
        hp: b.hp,
        ammo: b.ammo,
        energy: b.energy,
        alive: b.alive,
        appearanceColor: appearanceMap[b.botId],
        displayName: displayNameBySlot[b.botId],
      })),
      bullets: bulletsForRender,
      powerups: powerupsForRender,
    }
  }, [appearanceMap, botsForRender, bulletsForRender, displayNameBySlot, powerupsForRender])

  const selectedBotState = React.useMemo(() => {
    if (!replay) return null
    const t = clamp(playback.tick, 0, replay.tickCap)
    return replay.state[t]?.bots.find((b) => b.botId === selectedBotId) ?? null
  }, [playback.tick, replay, selectedBotId])

  const allTickEvents = React.useMemo(() => {
    if (!replay) return []
    const t = clamp(playback.tick, 0, replay.tickCap)
    return (replay.events[t] ?? []) as KnownReplayEvent[]
  }, [playback.tick, replay])

  const scopedTickEvents = React.useMemo(() => {
    if (showAllTickEvents) return allTickEvents
    return allTickEvents.filter((e) => isRelevantEvent(e, selectedBotId))
  }, [allTickEvents, selectedBotId, showAllTickEvents])

  const selectedBotExecEvent = React.useMemo(() => {
    return (
      allTickEvents.find(
        (e): e is Extract<KnownReplayEvent, { type: 'BOT_EXEC' }> =>
          isKnownReplayEventType(e, 'BOT_EXEC') && e.botId === selectedBotId,
      ) ?? null
    )
  }, [allTickEvents, selectedBotId])

  const tickEventsQuery = tickEventsFilter.trim()

  const filteredTickEvents = React.useMemo(() => {
    if (!tickEventsQuery) return scopedTickEvents
    return scopedTickEvents.filter((e) => tickEventMatchesFilter(e, displayNameBySlot, tickEventsQuery))
  }, [displayNameBySlot, scopedTickEvents, tickEventsQuery])

  const listTickEvents = React.useMemo(() => {
    return scopedTickEvents.filter((e) => {
      if (e.type !== 'BOT_EXEC') return true
      if (!showAllTickEvents) return false
      return e.botId !== selectedBotId
    })
  }, [scopedTickEvents, selectedBotId, showAllTickEvents])

  const filteredListTickEvents = React.useMemo(() => {
    if (!tickEventsQuery) return listTickEvents
    return listTickEvents.filter((e) => tickEventMatchesFilter(e, displayNameBySlot, tickEventsQuery))
  }, [displayNameBySlot, listTickEvents, tickEventsQuery])

  const selectedTickEventLines = React.useMemo(() => {
    return filteredListTickEvents.map((e, index) => {
      const line = formatTickEventLine(e)
      return { ...line, key: `${line.key}:${index}` }
    })
  }, [filteredListTickEvents])

  const tickEventsFilterStatusText = React.useMemo(() => {
    if (!tickEventsQuery) return ''
    if (showRawTickEvents) return `${filteredTickEvents.length} / ${scopedTickEvents.length} match “${tickEventsQuery}”`
    return `${filteredListTickEvents.length} / ${listTickEvents.length} match “${tickEventsQuery}”`
  }, [filteredListTickEvents.length, filteredTickEvents.length, listTickEvents.length, scopedTickEvents.length, showRawTickEvents, tickEventsQuery])

  const rawTickEventsText = React.useMemo(() => {
    if (!replay) return 'Run a match to see events.'
    if (!tickEventsQuery && !scopedTickEvents.length) return '(no events)'

    return JSON.stringify(
      buildRawTickEventsPayload({
        events: filteredTickEvents,
        displayNameBySlot,
        selectedBotId,
        showAllTickEvents,
        query: tickEventsQuery,
        totalCount: scopedTickEvents.length,
      }),
      null,
      2,
    )
  }, [displayNameBySlot, filteredTickEvents, replay, scopedTickEvents.length, selectedBotId, showAllTickEvents, tickEventsQuery])

  async function handleCopyReplayJson() {
    if (!replay) return

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard API unavailable in this browser context')
      }

      await navigator.clipboard.writeText(serializeReplay(replay))
      setReplayExportNotice({ tone: 'good', text: 'Replay JSON copied to clipboard.' })
    } catch (err) {
      setReplayExportNotice({
        tone: 'bad',
        text: err instanceof Error ? `Copy failed: ${err.message}` : 'Copy failed.',
      })
    }
  }

  function handleDownloadReplayJson() {
    if (!replay) return

    const blob = new Blob([serializeReplay(replay)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `replay-seed-${appliedRun?.seed ?? seed}-tick-${replay.tickCap}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    setReplayExportNotice({ tone: 'good', text: 'Replay JSON download started.' })
  }

  function jumpToHighlightedBot1SourceLine() {
    if (highlightedBot1SourceLine == null) return

    const editor = editorTextareaRef.current
    if (!editor) return

    const lineRange = getLineRangeForLine(editorSourceText, highlightedBot1SourceLine)
    if (!lineRange) return

    editor.focus()
    editor.setSelectionRange(lineRange.start, lineRange.end)
  }

  function createNewBot() {
    setMyBots((prev) => {
      if (prev.bots.length >= MAX_LOCAL_BOTS) return prev

      const id = createNewLocalBotId(prev.bots.map((b) => b.id))
      const loadout = deriveLoadoutFromScriptOrDefault(starterSourceText)

      return {
        version: 2,
        selectedBotId: id,
        bots: [...prev.bots, { id, name: id, sourceText: applyLoadoutHeaderDirectives(starterSourceText, loadout), loadout }],
      }
    })
  }

  function renameSelectedBot() {
    const current = selectedMyBot
    const next = window.prompt('Rename bot', current.name)
    if (next == null) return

    const trimmed = next.trim()
    if (!trimmed) return

    setMyBots((prev) => ({
      ...prev,
      bots: prev.bots.map((b) => (b.id === current.id ? { ...b, name: trimmed } : b)),
    }))
  }

  function deleteSelectedBot() {
    if (myBots.bots.length <= 1) return
    const ok = window.confirm(`Delete "${selectedMyBot.name}"?`)
    if (!ok) return

    setMyBots((prev) => {
      if (prev.bots.length <= 1) return prev

      const remaining = prev.bots.filter((b) => b.id !== prev.selectedBotId)
      const nextSelectedBotId = remaining[0]?.id ?? prev.selectedBotId

      return {
        version: 2,
        selectedBotId: nextSelectedBotId,
        bots: remaining.length ? remaining : prev.bots,
      }
    })
  }

  function selectBotAsBot1(id: string) {
    setMyBots((prev) => ({ ...prev, selectedBotId: id }))
  }

  function loadStarter() {
    const loadout = deriveLoadoutFromScriptOrDefault(starterSourceText)

    setMyBots((prev) => ({
      ...prev,
      bots: prev.bots.map((b) =>
        b.id === prev.selectedBotId
          ? { ...b, loadout, sourceText: applyLoadoutHeaderDirectives(starterSourceText, loadout) }
          : b,
      ),
    }))
  }

  function setMyBotLoadoutSlot(slotIndex: 0 | 1 | 2, nextMod: ModuleId | null) {
    setMyBots((prev) => ({
      ...prev,
      bots: prev.bots.map((b) => {
        if (b.id !== prev.selectedBotId) return b

        const nextLoadout = [...(b.loadout ?? DEFAULT_WORKSHOP_LOADOUT)] as Loadout
        nextLoadout[slotIndex] = nextMod

        return {
          ...b,
          loadout: nextLoadout,
          sourceText: applyLoadoutHeaderDirectives(b.sourceText, nextLoadout),
        }
      }),
    }))
  }

  function setOpponent(slot: keyof OpponentAssignments, id: string) {
    setOpponents((prev) => normalizeOpponentAssignments({ ...prev, [slot]: id }, opponentPoolIds))
  }

  function randomizeOpponents() {
    const nonce = readOpponentNonce()
    const randomizeSeed = (seed >>> 0) ^ fnv1a32(selectedMyBot.sourceText ?? '') ^ nonce

    const ids = selectDistinctFromPool(randomizeSeed, opponentPoolIds, 3)

    setOpponents({ BOT2: ids[0], BOT3: ids[1], BOT4: ids[2] })
    writeOpponentNonce((nonce + 1) >>> 0)
  }

  async function handleRun() {
    setRunning(true)
    setRunError(null)

    try {
      const bots = SLOT_IDS.map((slotId) => {
        const sourceText = sourcesBySlot[slotId]
        const loadout = loadoutBySlot[slotId]
        return { slotId, sourceText, loadout }
      })
      const nextReplay: Replay = await runLocalInWorker({ seed, tickCap, bots })

      setAppliedRun({
        seed,
        tickCap,
        bot1Id: selectedMyBot.id,
        bot1Name: selectedMyBot.name,
        botSpecHashBySlot: currentBotSpecHashBySlot,
      })

      dispatch({ type: 'LOAD_REPLAY', replay: nextReplay })
    } catch (err) {
      setRunError(err instanceof Error ? err.message : String(err))
    } finally {
      setRunning(false)
    }
  }

  function optionsForOpponentSlot(slot: keyof OpponentAssignments) {
    const otherSlots = OPPONENT_SLOTS.filter((s) => s !== slot)
    const usedByOtherSlots = new Set(otherSlots.map((s) => opponents[s]))

    return opponentPool.filter((o) => o.id === opponents[slot] || !usedByOtherSlots.has(o.id))
  }

  const speedButtons = [0.5, 1, 2, 6] as const
  const effectiveTickCap = replay?.tickCap ?? tickCap

  const editorSourceText = selectedMyBot.sourceText
  const selectedMyBotLoadout = selectedMyBot.loadout ?? DEFAULT_WORKSHOP_LOADOUT
  const editorSourceLines = React.useMemo(() => getSourceLines(editorSourceText), [editorSourceText])
  const compiledEditorBot = React.useMemo(() => compileBotSource(editorSourceText), [editorSourceText])

  const bot1ExecEvent = React.useMemo(() => {
    return (
      allTickEvents.find(
        (e): e is Extract<KnownReplayEvent, { type: 'BOT_EXEC' }> =>
          isKnownReplayEventType(e, 'BOT_EXEC') && e.botId === 'BOT1',
      ) ?? null
    )
  }, [allTickEvents])

  const highlightedBot1SourceLine = React.useMemo(() => {
    if (!previewUpToDate || compiledEditorBot.errors.length || !bot1ExecEvent) return null
    return getSourceLineForPc(compiledEditorBot.program.pcToSourceLine, bot1ExecEvent.pcBefore)
  }, [bot1ExecEvent, compiledEditorBot, previewUpToDate])

  const highlightedBot1SourceText = React.useMemo(() => {
    if (highlightedBot1SourceLine == null) return null
    return getSourceLineText(editorSourceText, highlightedBot1SourceLine)
  }, [editorSourceText, highlightedBot1SourceLine])

  const bot1LoadoutWarnings = React.useMemo(() => {
    const loadout = selectedMyBotLoadout

    const counts = new Map<ModuleId, number>()
    for (const mod of loadout) {
      if (mod == null) continue
      counts.set(mod, (counts.get(mod) ?? 0) + 1)
    }

    const dupes = [...counts.entries()]
      .filter(([, n]) => n > 1)
      .map(([m]) => m)

    const weaponCount = loadout.filter((m) => m === 'BULLET' || m === 'SAW').length

    const warnings: string[] = []
    if (dupes.length) warnings.push(`Duplicate modules: ${dupes.join(', ')}`)
    if (weaponCount > 1) warnings.push('More than one weapon selected (BULLET/SAW)')

    return warnings
  }, [selectedMyBotLoadout])

  return (
    <>
      <div className="workshop-header">
        <div>
          <h1 className="workshop-title">Workshop</h1>
          <div className="subtitle">Edit bots, run a deterministic local match, and inspect the replay.</div>
        </div>

        <div className="workshop-header-actions">
          <label className="mini-field">
            <div className="mini-label">Seed</div>
            <input className="mini-input" type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value))} />
          </label>

          <label className="mini-field">
            <div className="mini-label">Tick cap</div>
            <input
              className="mini-input"
              type="number"
              value={tickCap}
              onChange={(e) => setTickCap(Math.max(1, Number(e.target.value)))}
            />
          </label>

          <div className="mini-field">
            <div className="mini-label">BOT1 (next run)</div>
            <div className="mini-input" style={{ display: 'flex', alignItems: 'center', width: 180, fontWeight: 700 }}>
              {selectedMyBot.name}
            </div>
          </div>

          <div className="mini-field">
            <div className="mini-label">Preview</div>
            <div
              className="mini-input"
              style={{ display: 'flex', alignItems: 'center', width: 180 }}
              title={appliedRun ? `Last run BOT1: ${appliedRun.bot1Name}` : undefined}
            >
              {previewStatusText}
            </div>
          </div>

          <button className="ui-button" onClick={handleRun} disabled={running}>
            {running ? 'Running…' : 'Run / Preview'}
          </button>
          <button className="ui-button ui-button-secondary" disabled>
            Save
          </button>
        </div>
      </div>

      {runError ? (
        <div className="panel" style={{ marginTop: 16, borderColor: 'rgba(239, 68, 68, 0.4)' }}>
          <strong style={{ color: '#fecaca' }}>Run failed</strong>
          <div className="muted" style={{ marginTop: 8 }}>{runError}</div>
        </div>
      ) : null}

      {playback.replay && !previewUpToDate ? (
        <div className="panel" style={{ marginTop: 16, borderColor: 'rgba(34, 197, 94, 0.22)' }}>
          <strong style={{ color: 'var(--text)' }}>Preview out of date</strong>
          <div className="muted" style={{ marginTop: 8 }}>
            BOT1 source or match settings changed since the last run. Click{' '}
            <strong style={{ color: 'var(--text)' }}>Run / Preview</strong> to apply and re-run.
          </div>
          {appliedRun ? (
            <div className="muted" style={{ marginTop: 8 }}>
              Last run BOT1: <strong style={{ color: 'var(--text)' }}>{appliedRun.bot1Name}</strong>
            </div>
          ) : null}
        </div>
      ) : null}

      <section className="panel workshop-setup-panel" style={{ marginTop: 16 }}>
        <div className="workshop-setup-header">
          <div>
            <div className="panel-title">Match setup</div>
            <div className="muted" style={{ marginTop: 6 }}>
              Choose the bot for BOT1, review the equipped loadouts, and choose the opponent field for the next run.
            </div>
          </div>

          <button className="ui-button ui-button-secondary" type="button" onClick={randomizeOpponents}>
            Randomize opponents
          </button>
        </div>

        <div className="workshop-setup-grid" style={{ marginTop: 14 }}>
          <section className="workshop-bot-card">
            <div className="workshop-bot-card-label">BOT1 · Your bot</div>
            <div className="workshop-bot-card-title">{selectedMyBot.name}</div>
            <div className="workshop-bot-card-subtitle">Selected from your local bot library for the next deterministic run.</div>
            <div className="workshop-loadout-summary" style={{ marginTop: 14 }}>
              {selectedMyBotLoadout.map((mod, index) => (
                <div key={`bot1-loadout-${index}`} className="workshop-loadout-chip">
                  <span className="mini-label">Slot {index + 1}</span>
                  <strong>{formatLoadoutOptionValue(mod ?? null)}</strong>
                </div>
              ))}
            </div>
          </section>

          {opponentCards.map(({ slotId, opponent, loadout }) => (
            <section key={slotId} className="workshop-bot-card">
              <div className="workshop-bot-card-label">{slotId} · Opponent</div>
              <label className="mini-field">
                <div className="mini-label">Opponent bot</div>
                <select className="mini-input workshop-select" value={opponents[slotId]} onChange={(e) => setOpponent(slotId, e.target.value)}>
                  {optionsForOpponentSlot(slotId).map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.displayName}
                    </option>
                  ))}
                </select>
              </label>
              <div className="workshop-bot-card-subtitle">{opponent?.displayName ?? displayNameBySlot[slotId]}</div>
              <div className="workshop-loadout-summary" style={{ marginTop: 14 }}>
                {loadout.map((mod, index) => (
                  <div key={`${slotId}-loadout-${index}`} className="workshop-loadout-chip">
                    <span className="mini-label">Slot {index + 1}</span>
                    <strong>{formatLoadoutOptionValue(mod ?? null)}</strong>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>

      <div className="workshop-grid" style={{ marginTop: 16 }}>
        <div className="workshop-stage-column">
          <section className="panel">
            <div className="panel-title">Arena</div>

            <div className="arena-wrap" style={{ marginTop: 10 }}>
              <ArenaCanvas renderState={renderState} selectedBotId={selectedBotId} />
            </div>

            <div className="controls" style={{ marginTop: 12 }}>
              <button
                className="ui-button ui-button-secondary"
                onClick={() => dispatch({ type: 'TOGGLE_PLAY' })}
                disabled={!replay}
              >
                {playback.playing ? 'Pause' : 'Play'}
              </button>

              <button
                className="ui-button ui-button-secondary"
                onClick={() => dispatch({ type: 'STEP', delta: 1 })}
                disabled={!replay || playback.playing}
              >
                Step
              </button>

              <button
                className="ui-button ui-button-secondary"
                onClick={() => dispatch({ type: 'RESTART' })}
                disabled={!replay}
              >
                Restart
              </button>

              <span className="muted" style={{ marginLeft: 8 }}>
                tick {playback.tick} / {effectiveTickCap}
              </span>
            </div>

            <div className="controls" style={{ marginTop: 10 }}>
              <div className="muted">Speed</div>
              {speedButtons.map((s) => (
                <button
                  key={s}
                  className={['chip', playback.speed === s ? 'active' : ''].join(' ')}
                  onClick={() => dispatch({ type: 'SET_SPEED', speed: s })}
                  disabled={!replay}
                >
                  {s}×
                </button>
              ))}
            </div>

            <div style={{ marginTop: 10 }}>
              <input
                type="range"
                min={0}
                max={effectiveTickCap}
                value={clamp(playback.tick, 0, effectiveTickCap)}
                onChange={(e) => dispatch({ type: 'SET_TICK', tick: Number(e.target.value) })}
                disabled={!replay || playback.playing}
              />
            </div>
          </section>

          <section className="panel">
            <div className="panel-title">Replay analysis</div>

            <div className="tab-row" style={{ marginTop: 10 }}>
              {SLOT_IDS.map((id) => (
                <button
                  key={id}
                  className={['tab', id === selectedBotId ? 'active' : ''].join(' ')}
                  onClick={() => setSelectedBotId(id)}
                >
                  {id}
                </button>
              ))}
            </div>

            <div className="workshop-analysis-grid" style={{ marginTop: 14 }}>
              <section className="workshop-analysis-card">
                <div className="panel-title">Inspector</div>

                <div style={{ marginTop: 12 }} className="muted">
                  {selectedBotState ? (
                    <>
                      <div>
                        <strong style={{ color: 'var(--text)' }}>{selectedBotId}</strong>
                      </div>
                      <div style={{ marginTop: 8 }}>HP: {selectedBotState.hp}</div>
                      <div>Ammo: {selectedBotState.ammo}</div>
                      <div>Energy: {selectedBotState.energy}</div>
                      <div>Alive: {selectedBotState.alive ? 'yes' : 'no'}</div>
                      <div>PC: {selectedBotState.pc}</div>
                      <div>Pos: {selectedBotState.pos.x.toFixed(3)}, {selectedBotState.pos.y.toFixed(3)}</div>
                    </>
                  ) : (
                    'Run a replay to inspect bots.'
                  )}
                </div>
              </section>

              <section className="workshop-analysis-card">
                <div className="panel-title">Execution</div>
                <div
                  style={{
                    marginTop: 8,
                    padding: 10,
                    borderRadius: 10,
                    background: 'rgba(0,0,0,0.35)',
                  }}
                >
                  {(() => {
                    if (!replay) return <div className="muted">Run a match to inspect execution.</div>

                    const exec = selectedBotExecEvent
                    if (!exec) return <div className="muted">(no BOT_EXEC)</div>

                    return (
                      <div className="muted" style={{ lineHeight: 1.5 }}>
                        <div>
                          <strong style={{ color: 'var(--text)' }}>{exec.instrText}</strong>
                        </div>
                        <div style={{ marginTop: 6 }}>
                          pc {exec.pcBefore} → {exec.pcAfter}
                          {' • '}
                          result <strong style={{ color: 'var(--text)' }}>{exec.result}</strong>
                          {exec.reason ? (
                            <>
                              {' • '}
                              reason <strong style={{ color: '#fecaca' }}>{exec.reason}</strong>
                            </>
                          ) : null}
                        </div>
                      </div>
                    )
                  })()}
                </div>
              </section>
            </div>

            <div style={{ marginTop: 18 }}>
              <div className="panel-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <span>Tick events</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className={['chip', showAllTickEvents ? 'active' : ''].join(' ')}
                    onClick={() => setShowAllTickEvents((v) => !v)}
                    disabled={!replay}
                    title="Toggle all tick events"
                  >
                    All
                  </button>
                  <button
                    type="button"
                    className={['chip', showRawTickEvents ? 'active' : ''].join(' ')}
                    onClick={() => setShowRawTickEvents((v) => !v)}
                    disabled={!replay}
                    title="Toggle raw JSON"
                  >
                    Raw
                  </button>
                  <input
                    aria-label="Tick events filter"
                    className="mini-input"
                    type="text"
                    value={tickEventsFilter}
                    onChange={(e) => setTickEventsFilter(e.target.value)}
                    placeholder="Filter…"
                    disabled={!replay}
                    style={{ width: 150 }}
                  />
                </div>
              </div>
              {tickEventsFilterStatusText ? (
                <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>{tickEventsFilterStatusText}</div>
              ) : null}

              {replay ? (
                showRawTickEvents ? (
                  <pre
                    style={{
                      marginTop: 8,
                      padding: 10,
                      borderRadius: 10,
                      background: 'rgba(0,0,0,0.35)',
                      overflow: 'auto',
                      height: 240,
                    }}
                  >
                    {rawTickEventsText}
                  </pre>
                ) : (
                  <div
                    style={{
                      marginTop: 8,
                      padding: 10,
                      borderRadius: 10,
                      background: 'rgba(0,0,0,0.35)',
                      overflow: 'auto',
                      height: 240,
                      fontFamily:
                        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                      fontSize: 12,
                      lineHeight: 1.55,
                    }}
                  >
                    {selectedTickEventLines.length ? (
                      selectedTickEventLines.map((l) => {
                        const color =
                          l.tone === 'bad'
                            ? '#fecaca'
                            : l.tone === 'good'
                              ? 'rgba(134, 239, 172, 0.95)'
                              : 'rgba(148, 163, 184, 0.95)'

                        return (
                          <div key={l.key} style={{ marginBottom: 6 }}>
                            <div style={{ color }}>
                              <strong style={{ color: 'var(--text)' }}>{l.label}</strong>
                              {l.detail ? <span style={{ marginLeft: 8 }}>{l.detail}</span> : null}
                            </div>
                          </div>
                        )
                      })
                    ) : (
                      <div className="muted">(no events)</div>
                    )}
                  </div>
                )
              ) : (
                <pre
                  style={{
                    marginTop: 8,
                    padding: 10,
                    borderRadius: 10,
                    background: 'rgba(0,0,0,0.35)',
                    overflow: 'auto',
                    height: 240,
                  }}
                >{'Run a match to see events.'}</pre>
              )}
            </div>

            <div style={{ marginTop: 18 }}>
              <div className="panel-title">Replay export</div>
              <div className="controls" style={{ marginTop: 10 }}>
                <button className="ui-button ui-button-secondary" type="button" onClick={handleCopyReplayJson} disabled={!replay}>
                  Copy replay JSON
                </button>
                <button className="ui-button ui-button-secondary" type="button" onClick={handleDownloadReplayJson} disabled={!replay}>
                  Download replay JSON
                </button>
              </div>
              {replayExportNotice ? (
                <div
                  className="muted"
                  style={{
                    marginTop: 8,
                    color: replayExportNotice.tone === 'bad' ? '#fecaca' : 'rgba(134, 239, 172, 0.95)',
                  }}
                >
                  {replayExportNotice.text}
                </div>
              ) : null}
            </div>

            <div style={{ marginTop: 18 }}>
              <div className="panel-title">Loadout</div>
              {(() => {
                const configured = loadoutBySlot[selectedBotId] ?? DEFAULT_WORKSHOP_LOADOUT
                const headerBot = replay?.bots?.find((b) => b.slotId === selectedBotId)
                const resolved = headerBot?.loadout ?? configured
                const issues = headerBot?.loadoutIssues ?? []

                const row = (label: string, l: Loadout) => (
                  <div style={{ marginTop: 6, lineHeight: 1.5 }}>
                    <div className="muted" style={{ fontSize: 12 }}>{label}</div>
                    <div>
                      slot1:{' '}
                      <strong style={{ color: 'var(--text)' }}>{formatLoadoutOptionValue(l?.[0] ?? null)}</strong>
                      {'  '}slot2:{' '}
                      <strong style={{ color: 'var(--text)' }}>{formatLoadoutOptionValue(l?.[1] ?? null)}</strong>
                      {'  '}slot3:{' '}
                      <strong style={{ color: 'var(--text)' }}>{formatLoadoutOptionValue(l?.[2] ?? null)}</strong>
                    </div>
                  </div>
                )

                const showResolved =
                  Boolean(replay) && (resolved[0] !== configured[0] || resolved[1] !== configured[1] || resolved[2] !== configured[2])

                return (
                  <div className="muted" style={{ marginTop: 8 }}>
                    {row('Configured (input)', configured)}
                    {showResolved ? row('Resolved by engine', resolved) : null}

                    {issues.length ? (
                      <div style={{ marginTop: 10, color: '#fecaca', fontSize: 12, lineHeight: 1.5 }}>
                        <div style={{ fontWeight: 700, color: 'var(--text)' }}>Loadout issues</div>
                        {issues.map((i, idx) => (
                          <div key={idx}>
                            {i.kind} (slot {i.slot}{i.module ? `: ${i.module}` : ''})
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {selectedBotId === 'BOT1' ? (
                      <div style={{ marginTop: 10 }}>
                        Edit BOT1 loadout in the bot editor. The <code>;@slot</code> header directives are locked and kept in sync with the dropdowns.
                      </div>
                    ) : null}
                  </div>
                )
              })()}
            </div>

            <div style={{ marginTop: 18 }}>
              <div className="panel-title">Instruction reference</div>
              <div style={{ marginTop: 10 }}>
                <Link className="ui-button ui-button-secondary" to="/docs">
                  Open bot instructions
                </Link>
              </div>
            </div>
          </section>
        </div>

        <div className="workshop-side-column">
          <section className="panel">
            <div className="panel-title">Bot library</div>

            <label className="mini-field" style={{ marginTop: 10 }}>
              <div className="mini-label">BOT1 selection</div>
              <select
                aria-label="BOT1 selection"
                className="mini-input workshop-select"
                value={myBots.selectedBotId}
                onChange={(e) => selectBotAsBot1(e.target.value)}
              >
                {myBots.bots.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="muted" style={{ marginTop: 10 }}>
              Up to {MAX_LOCAL_BOTS} local bots.
            </div>

            <div className="controls" style={{ marginTop: 10 }}>
              <button
                className="ui-button ui-button-secondary"
                type="button"
                onClick={createNewBot}
                disabled={myBots.bots.length >= MAX_LOCAL_BOTS}
              >
                Add bot
              </button>
              <button className="ui-button ui-button-secondary" type="button" onClick={renameSelectedBot}>
                Rename
              </button>
              <button
                className="ui-button ui-button-secondary"
                type="button"
                onClick={deleteSelectedBot}
                disabled={myBots.bots.length <= 1}
              >
                Delete
              </button>
            </div>
          </section>

          <section className="panel">
            <div className="panel-title">Bot editor</div>

            <div className="controls" style={{ marginTop: 10 }}>
              <button className="ui-button ui-button-secondary" type="button" onClick={loadStarter}>
                Load starter
              </button>
            </div>

            <div className="controls" style={{ marginTop: 12 }}>
              <label className="mini-field">
                <div className="mini-label">Slot 1 · {formatLoadoutOptionValue(selectedMyBotLoadout[0] ?? null)}</div>
                <select
                  className="mini-input"
                  value={formatLoadoutOptionValue(selectedMyBotLoadout[0] ?? null)}
                  onChange={(e) => setMyBotLoadoutSlot(0, parseLoadoutOptionValue(e.target.value))}
                >
                  {LOADOUT_OPTION_VALUES.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>

              <label className="mini-field">
                <div className="mini-label">Slot 2 · {formatLoadoutOptionValue(selectedMyBotLoadout[1] ?? null)}</div>
                <select
                  className="mini-input"
                  value={formatLoadoutOptionValue(selectedMyBotLoadout[1] ?? null)}
                  onChange={(e) => setMyBotLoadoutSlot(1, parseLoadoutOptionValue(e.target.value))}
                >
                  {LOADOUT_OPTION_VALUES.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>

              <label className="mini-field">
                <div className="mini-label">Slot 3 · {formatLoadoutOptionValue(selectedMyBotLoadout[2] ?? null)}</div>
                <select
                  className="mini-input"
                  value={formatLoadoutOptionValue(selectedMyBotLoadout[2] ?? null)}
                  onChange={(e) => setMyBotLoadoutSlot(2, parseLoadoutOptionValue(e.target.value))}
                >
                  {LOADOUT_OPTION_VALUES.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {bot1LoadoutWarnings.length ? (
              <div style={{ marginTop: 10, color: '#fecaca', fontSize: 12, lineHeight: 1.5 }}>
                {bot1LoadoutWarnings.map((w) => (
                  <div key={w}>{w}</div>
                ))}
              </div>
            ) : null}

            <div style={{ marginTop: 12, padding: 12, borderRadius: 12, border: '1px solid var(--border)', background: 'rgba(255, 255, 255, 0.02)' }}>
              <div className="panel-title">BOT1 source focus</div>
              <div className="muted" style={{ marginTop: 8, lineHeight: 1.5 }}>
                {!playback.replay ? (
                  'Run a match to map BOT1 pc values back to source lines.'
                ) : !previewUpToDate ? (
                  'BOT1 source changed since the last run. Re-run to refresh source-line mapping.'
                ) : compiledEditorBot.errors.length ? (
                  <>
                    Current BOT1 source has compile errors. Highlighting is disabled until the editor compiles cleanly.
                    <div style={{ marginTop: 6 }}>
                      First error: line {compiledEditorBot.errors[0].line} — {compiledEditorBot.errors[0].message}
                    </div>
                  </>
                ) : !bot1ExecEvent ? (
                  '(no BOT1 BOT_EXEC)'
                ) : highlightedBot1SourceLine == null ? (
                  'No source line mapping found for the current BOT1 pc.'
                ) : (
                  <>
                    <div>
                      Tick {playback.tick} • pc {bot1ExecEvent.pcBefore} → {bot1ExecEvent.pcAfter} • source line{' '}
                      <strong style={{ color: 'var(--text)' }}>{highlightedBot1SourceLine}</strong>
                    </div>
                    <div style={{ marginTop: 6 }}>
                      <code>{highlightedBot1SourceText || '(blank line)'}</code>
                    </div>
                    <div style={{ marginTop: 10 }}>
                      <button className="ui-button ui-button-secondary" type="button" onClick={jumpToHighlightedBot1SourceLine}>
                        Jump to highlighted line
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="code-editor-shell" style={{ marginTop: 12 }}>
              <div className="code-editor-gutter" aria-hidden="true">
                {editorSourceLines.map((_, index) => {
                  const lineNumber = index + 1
                  return (
                    <div
                      key={`source-line-${lineNumber}`}
                      className={['code-editor-line-number', lineNumber === highlightedBot1SourceLine ? 'active' : ''].join(' ')}
                    >
                      {lineNumber}
                    </div>
                  )
                })}
              </div>

              <textarea
                ref={editorTextareaRef}
                className="code-editor code-editor-textarea"
                value={editorSourceText}
                onChange={(e) => {
                  const nextSourceText = e.target.value
                  setMyBots((prev) => {
                    const current = prev.bots.find((b) => b.id === prev.selectedBotId)
                    if (!current) return prev

                    const nextText = applyLoadoutHeaderDirectives(nextSourceText, current.loadout ?? DEFAULT_WORKSHOP_LOADOUT)

                    return {
                      ...prev,
                      bots: prev.bots.map((b) => (b.id === prev.selectedBotId ? { ...b, sourceText: nextText } : b)),
                    }
                  })
                }}
                spellCheck={false}
              />
            </div>

            <div className="muted" style={{ marginTop: 10 }}>
              Loadout directives <code>;@slot1</code>, <code>;@slot2</code>, <code>;@slot3</code> are locked and kept in sync with the dropdowns.
            </div>
          </section>
        </div>
      </div>
    </>
  )
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

function clampInt(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.floor(v)))
}

function powerupLocToWorld(loc: { sector: number; zone: number }): { x: number; y: number } {
  const sectorId = clampInt(loc.sector, 1, 9)
  const zone = clampInt(loc.zone, 0, 4)

  const sectorRow = Math.floor((sectorId - 1) / 3)
  const sectorCol = (sectorId - 1) % 3
  const sectorOriginX = sectorCol * 64
  const sectorOriginY = sectorRow * 64

  if (zone === 0) return { x: sectorOriginX + 32, y: sectorOriginY + 32 }

  const zoneOffsets: Record<number, { x: number; y: number }> = {
    1: { x: 0, y: 0 },
    2: { x: 32, y: 0 },
    3: { x: 0, y: 32 },
    4: { x: 32, y: 32 },
  }

  const off = zoneOffsets[zone] ?? { x: 0, y: 0 }
  return { x: sectorOriginX + off.x + 16, y: sectorOriginY + off.y + 16 }
}
