import * as React from 'react'

import type { Replay, ReplayBotState, ReplayPowerupState, SlotId } from '../../replay/replayTypes'

const ARENA_SIZE_WORLD = 192
const SECTOR_SIZE_WORLD = 64
const ZONE_SIZE_WORLD = 32

const BOT_RADIUS_WORLD = 8

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

function clampInt(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.floor(v)))
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function chooseScale(availablePx: number, arenaSizeWorld: number) {
  // ArenaVisualPlan.md §3.1
  const candidates = [6, 5, 4, 3, 2, 1]
  for (const s of candidates) {
    if (arenaSizeWorld * s <= availablePx) return s
  }
  return 1
}

function snapPx(cssPx: number, dpr: number) {
  // ArenaVisualPlan.md §2.6
  return Math.round(cssPx * dpr) / dpr
}

function linePos(cssPx: number, lineWidth: number, dpr: number) {
  // For odd widths, draw on half-pixel boundaries to avoid blur.
  const off = lineWidth % 2 === 1 ? 0.5 : 0
  return snapPx(cssPx + off, dpr)
}

function getFallbackBotColor(slotId: SlotId) {
  // deterministic slot palette
  switch (slotId) {
    case 'BOT1':
      return '#3b82f6'
    case 'BOT2':
      return '#ef4444'
    case 'BOT3':
      return '#22c55e'
    case 'BOT4':
      return '#eab308'
  }
}

function hpFill(hp01: number) {
  // green -> yellow -> red
  const t = clamp(hp01, 0, 1)
  if (t >= 0.5) {
    const u = (t - 0.5) / 0.5
    const r = Math.round(255 * (1 - u))
    const g = 255
    return `rgb(${r},${g},64)`
  }
  const u = t / 0.5
  const r = 255
  const g = Math.round(255 * u)
  return `rgb(${r},${g},64)`
}

function fillRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2))
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.lineTo(x + w - rr, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr)
  ctx.lineTo(x + w, y + h - rr)
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h)
  ctx.lineTo(x + rr, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr)
  ctx.lineTo(x, y + rr)
  ctx.quadraticCurveTo(x, y, x + rr, y)
  ctx.closePath()
  ctx.fill()
}

function useElementSize<T extends HTMLElement>() {
  const ref = React.useRef<T | null>(null)
  const [size, setSize] = React.useState<{ width: number; height: number } | null>(null)

  React.useEffect(() => {
    if (!ref.current) return

    const el = ref.current

    const update = () => {
      const cr = el.getBoundingClientRect()
      setSize({ width: cr.width, height: cr.height })
    }

    update()

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver((entries) => {
        const cr = entries[0]?.contentRect
        if (!cr) return
        setSize({ width: cr.width, height: cr.height })
      })
      ro.observe(el)
      return () => ro.disconnect()
    }

    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  return { ref, size }
}

function locToWorld(loc: { sector: number; zone: number }) {
  // ArenaVisualPlan.md §2.3
  const sectorId = clampInt(loc.sector, 1, 9)
  const zone = clampInt(loc.zone, 0, 4)

  const sectorRow = Math.floor((sectorId - 1) / 3)
  const sectorCol = (sectorId - 1) % 3
  const sectorOriginX = sectorCol * SECTOR_SIZE_WORLD
  const sectorOriginY = sectorRow * SECTOR_SIZE_WORLD

  if (zone === 0) {
    return { x: sectorOriginX + 32, y: sectorOriginY + 32 }
  }

  const zoneOffsets: Record<number, { x: number; y: number }> = {
    1: { x: 0, y: 0 },
    2: { x: 32, y: 0 },
    3: { x: 0, y: 32 },
    4: { x: 32, y: 32 },
  }

  const off = zoneOffsets[zone] ?? { x: 0, y: 0 }
  return {
    x: sectorOriginX + off.x + 16,
    y: sectorOriginY + off.y + 16,
  }
}

let warnedMissingEnergy = false

function getEnergy(bot: ReplayBotState) {
  if (typeof bot.energy === 'number') return bot.energy

  if (!warnedMissingEnergy) {
    // eslint-disable-next-line no-console
    console.warn('[ArenaCanvas] replay bot energy missing; treating as 0')
    warnedMissingEnergy = true
  }

  return 0
}

type RenderBot = {
  botId: SlotId
  pos: { x: number; y: number }
  hp: number
  ammo: number
  energy: number
  alive: boolean
  color: string
}

type RenderBullet = {
  bulletId: string
  pos: { x: number; y: number }
  ownerBotId?: SlotId
}

type Props = {
  replay: Replay
  tick: number
  /** Intra-tick progress in [0,1]. */
  p: number
  className?: string
  style?: React.CSSProperties
}

/**
 * Canvas renderer for the 192x192 arena.
 *
 * Usage:
 * ```tsx
 * <ArenaCanvas replay={replay} tick={tick} p={p} style={{ width: '100%', height: '100%' }} />
 * ```
 */
export function ArenaCanvas({ replay, tick, p, className, style }: Props) {
  const { ref: containerRef, size: containerSize } = useElementSize<HTMLDivElement>()
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)

  const resolvedScale = React.useMemo(() => {
    const available = containerSize ? Math.min(containerSize.width, containerSize.height) : 0
    if (!available) return 2 // reasonable pre-measure fallback
    return chooseScale(available, ARENA_SIZE_WORLD)
  }, [containerSize])

  const drawModel = React.useMemo(() => {
    const maxTick = Math.max(0, replay.state.length - 1)
    const t = clampInt(tick, 0, maxTick)

    const startState = replay.state[t === 0 ? 0 : t - 1] ?? replay.state[0]
    const endState = replay.state[t] ?? startState

    const pp = t === 0 ? 1 : clamp(p, 0, 1)

    const startBots = new Map(startState.bots.map((b) => [b.botId, b]))
    const endBots = new Map(endState.bots.map((b) => [b.botId, b]))

    const snapState = pp >= 1 ? endState : startState

    const bots: RenderBot[] = []
    for (const b of snapState.bots) {
      const b0 = startBots.get(b.botId) ?? b
      const b1 = endBots.get(b.botId) ?? b

      const pos = {
        x: lerp(b0.pos.x, b1.pos.x, pp),
        y: lerp(b0.pos.y, b1.pos.y, pp),
      }

      const header = replay.bots.find((hb) => hb.slotId === b.botId)
      const color = header?.appearance?.color ?? getFallbackBotColor(b.botId)

      bots.push({
        botId: b.botId,
        pos,
        hp: b.hp,
        ammo: b.ammo,
        energy: getEnergy(b),
        alive: b.alive,
        color,
      })
    }

    const startBullets = new Map(startState.bullets.map((bl) => [bl.bulletId, bl]))
    const endBullets = new Map(endState.bullets.map((bl) => [bl.bulletId, bl]))

    const bulletIds = new Set<string>()
    for (const bl of startState.bullets) bulletIds.add(bl.bulletId)
    for (const bl of endState.bullets) bulletIds.add(bl.bulletId)

    const bullets: RenderBullet[] = []
    for (const bulletId of bulletIds) {
      const b0 = startBullets.get(bulletId)
      const b1 = endBullets.get(bulletId)
      if (!b0 && !b1) continue

      const from =
        !b0 && b1
          ? { x: b1.pos.x - b1.vel.x, y: b1.pos.y - b1.vel.y }
          : b0?.pos ?? b1!.pos

      const to = b1?.pos ?? b0!.pos

      bullets.push({
        bulletId,
        ownerBotId: b1?.ownerBotId ?? b0?.ownerBotId,
        pos: {
          x: lerp(from.x, to.x, pp),
          y: lerp(from.y, to.y, pp),
        },
      })
    }

    const powerups: ReplayPowerupState[] = snapState.powerups

    return {
      tick: t,
      pp,
      scale: resolvedScale,
      bots,
      bullets,
      powerups,
    }
  }, [p, replay, resolvedScale, tick])

  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const s = drawModel.scale
    const cssSize = ARENA_SIZE_WORLD * s

    const dpr = typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1

    canvas.style.width = `${cssSize}px`
    canvas.style.height = `${cssSize}px`
    canvas.width = Math.max(1, Math.round(cssSize * dpr))
    canvas.height = Math.max(1, Math.round(cssSize * dpr))

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.imageSmoothingEnabled = false

    // Background
    ctx.clearRect(0, 0, cssSize, cssSize)
    ctx.fillStyle = '#0b0f0e'
    ctx.fillRect(0, 0, cssSize, cssSize)

    const zoneStepPx = ZONE_SIZE_WORLD * s
    const sectorStepPx = SECTOR_SIZE_WORLD * s

    // Zone grid
    ctx.strokeStyle = 'rgba(34, 197, 94, 0.18)'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let x = zoneStepPx; x < cssSize; x += zoneStepPx) {
      const xx = linePos(x, 1, dpr)
      ctx.moveTo(xx, 0)
      ctx.lineTo(xx, cssSize)
    }
    for (let y = zoneStepPx; y < cssSize; y += zoneStepPx) {
      const yy = linePos(y, 1, dpr)
      ctx.moveTo(0, yy)
      ctx.lineTo(cssSize, yy)
    }
    ctx.stroke()

    // Sector grid
    ctx.strokeStyle = 'rgba(34, 197, 94, 0.42)'
    ctx.lineWidth = 2
    ctx.beginPath()
    for (let x = sectorStepPx; x < cssSize; x += sectorStepPx) {
      const xx = linePos(x, 2, dpr)
      ctx.moveTo(xx, 0)
      ctx.lineTo(xx, cssSize)
    }
    for (let y = sectorStepPx; y < cssSize; y += sectorStepPx) {
      const yy = linePos(y, 2, dpr)
      ctx.moveTo(0, yy)
      ctx.lineTo(cssSize, yy)
    }
    ctx.stroke()

    // Outer wall
    const wallWidth = s >= 4 ? 4 : 3
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.85)'
    ctx.lineWidth = wallWidth
    const inset = wallWidth / 2
    const x0 = linePos(inset, wallWidth, dpr)
    const y0 = linePos(inset, wallWidth, dpr)
    const x1 = linePos(cssSize - inset, wallWidth, dpr)
    const y1 = linePos(cssSize - inset, wallWidth, dpr)
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.lineTo(x1, y0)
    ctx.lineTo(x1, y1)
    ctx.lineTo(x0, y1)
    ctx.closePath()
    ctx.stroke()

    // Sector labels
    const sectorsPerRow = 3
    const fontSize = Math.max(12, Math.floor(10 + s * 1.25))
    ctx.font = `600 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = 'rgba(34, 197, 94, 0.28)'

    for (let row = 0; row < sectorsPerRow; row++) {
      for (let col = 0; col < sectorsPerRow; col++) {
        const sectorId = row * sectorsPerRow + col + 1
        const cxWorld = col * SECTOR_SIZE_WORLD + SECTOR_SIZE_WORLD / 2
        const cyWorld = row * SECTOR_SIZE_WORLD + SECTOR_SIZE_WORLD / 2
        const cx = snapPx(Math.round(cxWorld * s), dpr)
        const cy = snapPx(Math.round(cyWorld * s), dpr)
        ctx.fillText(String(sectorId), cx, cy)
      }
    }

    const toPx = (w: number) => snapPx(Math.round(w * s), dpr)

    // Powerups
    for (const pu of drawModel.powerups) {
      const worldPos = pu.pos ?? locToWorld(pu.loc)
      const x = toPx(worldPos.x)
      const y = toPx(worldPos.y)

      const size = Math.max(10, Math.round(6 * s))

      ctx.save()
      ctx.translate(x, y)

      let color = 'rgba(233, 239, 255, 0.85)'
      if (pu.type === 'HEALTH') color = 'rgba(248, 113, 113, 0.9)'
      if (pu.type === 'AMMO') color = 'rgba(245, 158, 11, 0.9)'
      if (pu.type === 'ENERGY') color = 'rgba(96, 165, 250, 0.9)'

      // base disk
      ctx.beginPath()
      ctx.arc(0, 0, Math.max(4, Math.round(2.2 * s)), 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()

      // simple icon
      ctx.strokeStyle = 'rgba(0,0,0,0.65)'
      ctx.lineWidth = Math.max(1, Math.round(s * 0.7))
      ctx.lineCap = 'round'

      if (pu.type === 'HEALTH') {
        // plus
        ctx.beginPath()
        ctx.moveTo(-size * 0.25, 0)
        ctx.lineTo(size * 0.25, 0)
        ctx.moveTo(0, -size * 0.25)
        ctx.lineTo(0, size * 0.25)
        ctx.stroke()
      } else if (pu.type === 'AMMO') {
        // bullet-ish
        ctx.beginPath()
        ctx.moveTo(-size * 0.25, -size * 0.18)
        ctx.lineTo(size * 0.25, -size * 0.18)
        ctx.lineTo(size * 0.25, size * 0.18)
        ctx.lineTo(-size * 0.25, size * 0.18)
        ctx.closePath()
        ctx.stroke()
      } else {
        // lightning-ish
        ctx.beginPath()
        ctx.moveTo(-size * 0.15, -size * 0.28)
        ctx.lineTo(size * 0.05, -size * 0.05)
        ctx.lineTo(-size * 0.02, -size * 0.05)
        ctx.lineTo(size * 0.15, size * 0.28)
        ctx.stroke()
      }

      ctx.restore()
    }

    // Bullets
    for (const bl of drawModel.bullets) {
      const x = toPx(bl.pos.x)
      const y = toPx(bl.pos.y)
      const r = Math.max(1, Math.round(s * 0.8))

      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,255,255,0.92)'
      ctx.fill()
    }

    // Bots
    const showAllBars = s > 1

    for (const bot of drawModel.bots) {
      if (!bot.alive) continue

      const x = toPx(bot.pos.x)
      const y = toPx(bot.pos.y)
      const botRadiusPx = BOT_RADIUS_WORLD * s

      const hp01 = clamp(bot.hp / 100, 0, 1)
      const ammo01 = clamp(bot.ammo / 100, 0, 1)
      const energy01 = clamp(bot.energy / 100, 0, 1)

      const barW = Math.max(28, Math.round(16 * s + 16))
      const barH = Math.max(2, Math.floor(0.6 * s))
      const barGap = 1

      const barCount = showAllBars ? 3 : 1
      const barsH = barCount * barH + (barCount - 1) * barGap

      const label = bot.botId
      const labelFontSize = Math.max(10, Math.floor(9 + s * 1.1))
      ctx.font = `700 ${labelFontSize}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"`
      const tm = ctx.measureText(label)
      const padX = 6
      const padY = 3
      const pillW = tm.width + padX * 2
      const pillH = labelFontSize + padY * 2

      const groupGap = 3
      const top = y - botRadiusPx - groupGap - barsH - groupGap - pillH

      // label pill
      const pillX = x - pillW / 2
      const pillY = top
      ctx.fillStyle = 'rgba(0,0,0,0.72)'
      fillRoundRect(ctx, pillX, pillY, pillW, pillH, 6)
      ctx.fillStyle = 'rgba(255,255,255,0.92)'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(label, x, pillY + pillH / 2)

      // bars
      const barX = x - barW / 2
      let barY = pillY + pillH + groupGap

      const drawBar = (fill: string, value01: number) => {
        ctx.fillStyle = 'rgba(0,0,0,0.65)'
        ctx.fillRect(barX, barY, barW, barH)
        ctx.fillStyle = fill
        ctx.fillRect(barX, barY, barW * clamp(value01, 0, 1), barH)
        barY += barH + barGap
      }

      drawBar(hpFill(hp01), hp01)
      if (showAllBars) {
        drawBar('rgba(245, 158, 11, 0.9)', ammo01)
        drawBar('rgba(96, 165, 250, 0.9)', energy01)
      }

      // bot token
      ctx.beginPath()
      ctx.arc(x, y, botRadiusPx, 0, Math.PI * 2)
      ctx.fillStyle = bot.color
      ctx.fill()

      ctx.strokeStyle = 'rgba(0,0,0,0.6)'
      ctx.lineWidth = Math.max(1, Math.floor(1 + s * 0.2))
      ctx.stroke()
    }
  }, [drawModel])

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        ...style,
      }}
    >
      <canvas ref={canvasRef} />
    </div>
  )
}


