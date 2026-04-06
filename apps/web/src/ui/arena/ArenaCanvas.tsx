import * as React from 'react'
import {
  ARENA_SIZE_WORLD,
  SECTOR_SIZE_WORLD,
  ZONE_SIZE_WORLD,
  lineCssPx,
  pickScale,
  snapCssPx,
  worldToSnappedCssPx,
} from './arenaMath'

export type SlotId = 'BOT1' | 'BOT2' | 'BOT3' | 'BOT4'

export type ArenaRenderBot = {
  slotId: SlotId
  pos: { x: number; y: number }
  hp: number
  ammo: number
  energy: number
  alive: boolean
  appearanceColor?: string
  displayName?: string
}

export type ArenaRenderBullet = {
  bulletId: string
  ownerBotId?: SlotId
  pos: { x: number; y: number }
  vel?: { x: number; y: number }
  alpha?: number
}

export type ArenaRenderGrenade = {
  grenadeId: string
  ownerBotId?: SlotId
  pos: { x: number; y: number }
  vel?: { x: number; y: number }
  fuse?: number
  alpha?: number
}

export type ArenaRenderPowerup = {
  powerupId: string
  kind: 'HEALTH' | 'AMMO' | 'ENERGY'
  pos: { x: number; y: number }
}

export type ArenaRenderState = {
  bots: ArenaRenderBot[]
  bullets?: ArenaRenderBullet[]
  grenades?: ArenaRenderGrenade[]
  powerups?: ArenaRenderPowerup[]
}

export type ArenaCanvasProps = {
  renderState: ArenaRenderState
  selectedBotId?: SlotId
  arenaSizeWorld?: number
  /**
   * Integer pixels-per-world-unit.
   * If omitted, the component picks the largest S in {1..6} that fits the container.
   */
  scale?: number
  className?: string
  style?: React.CSSProperties
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

function slotFallbackColor(slotId: SlotId) {
  switch (slotId) {
    case 'BOT1':
      return '#3b82f6' // blue
    case 'BOT2':
      return '#ef4444' // red
    case 'BOT3':
      return '#22c55e' // green
    case 'BOT4':
      return '#eab308' // yellow
  }
}

function hpFill(hp01: number) {
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
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect
      if (!cr) return
      setSize({ width: cr.width, height: cr.height })
    })

    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return { ref, size }
}

function renderResourceBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  value01: number,
  fill: string,
) {
  ctx.fillStyle = 'rgba(0,0,0,0.65)'
  ctx.fillRect(x, y, w, h)

  ctx.fillStyle = fill
  ctx.fillRect(x, y, w * clamp(value01, 0, 1), h)
}

export function ArenaCanvas({
  renderState,
  selectedBotId,
  arenaSizeWorld = ARENA_SIZE_WORLD,
  scale,
  className,
  style,
}: ArenaCanvasProps) {
  const { ref: containerRef, size: containerSize } = useElementSize<HTMLDivElement>()
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)

  const resolvedScale = React.useMemo(() => {
    if (typeof scale === 'number') return clamp(Math.floor(scale), 1, 6)
    const availablePx = containerSize ? Math.min(containerSize.width, containerSize.height) : 0
    if (!availablePx) return 2 // reasonable initial guess before measuring
    return pickScale(availablePx, arenaSizeWorld)
  }, [arenaSizeWorld, containerSize, scale])

  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const s = resolvedScale
    const cssSize = arenaSizeWorld * s
    const dpr = typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1

    canvas.style.width = `${cssSize}px`
    canvas.style.height = `${cssSize}px`
    canvas.width = Math.max(1, Math.round(cssSize * dpr))
    canvas.height = Math.max(1, Math.round(cssSize * dpr))

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.imageSmoothingEnabled = false

    // Background
    ctx.clearRect(0, 0, cssSize, cssSize)
    ctx.fillStyle = '#0b0f17'
    ctx.fillRect(0, 0, cssSize, cssSize)

    const zoneStepPx = ZONE_SIZE_WORLD * s
    const sectorStepPx = SECTOR_SIZE_WORLD * s

    // Zone grid (thin)
    ctx.strokeStyle = 'rgba(34, 197, 94, 0.18)'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let x = zoneStepPx; x < cssSize; x += zoneStepPx) {
      const xx = lineCssPx(x, 1, dpr)
      ctx.moveTo(xx, 0)
      ctx.lineTo(xx, cssSize)
    }
    for (let y = zoneStepPx; y < cssSize; y += zoneStepPx) {
      const yy = lineCssPx(y, 1, dpr)
      ctx.moveTo(0, yy)
      ctx.lineTo(cssSize, yy)
    }
    ctx.stroke()

    // Sector grid (thicker)
    ctx.strokeStyle = 'rgba(34, 197, 94, 0.42)'
    ctx.lineWidth = 2
    ctx.beginPath()
    for (let x = sectorStepPx; x < cssSize; x += sectorStepPx) {
      const xx = lineCssPx(x, 2, dpr)
      ctx.moveTo(xx, 0)
      ctx.lineTo(xx, cssSize)
    }
    for (let y = sectorStepPx; y < cssSize; y += sectorStepPx) {
      const yy = lineCssPx(y, 2, dpr)
      ctx.moveTo(0, yy)
      ctx.lineTo(cssSize, yy)
    }
    ctx.stroke()

    // Outer wall
    const wallWidth = s >= 4 ? 4 : 3
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.85)'
    ctx.lineWidth = wallWidth
    const inset = wallWidth / 2
    const x0 = lineCssPx(inset, wallWidth, dpr)
    const y0 = lineCssPx(inset, wallWidth, dpr)
    const x1 = lineCssPx(cssSize - inset, wallWidth, dpr)
    const y1 = lineCssPx(cssSize - inset, wallWidth, dpr)
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.lineTo(x1, y0)
    ctx.lineTo(x1, y1)
    ctx.lineTo(x0, y1)
    ctx.closePath()
    ctx.stroke()

    // Sector labels 1..9
    const sectorsPerRow = Math.max(1, Math.floor(arenaSizeWorld / SECTOR_SIZE_WORLD))
    const sectorFontSize = Math.max(12, Math.floor(10 + s * 1.25))
    ctx.font = `600 ${sectorFontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = 'rgba(34, 197, 94, 0.28)'

    for (let row = 0; row < sectorsPerRow; row++) {
      for (let col = 0; col < sectorsPerRow; col++) {
        const sectorId = row * sectorsPerRow + col + 1
        const cxWorld = col * SECTOR_SIZE_WORLD + SECTOR_SIZE_WORLD / 2
        const cyWorld = row * SECTOR_SIZE_WORLD + SECTOR_SIZE_WORLD / 2

        const cx = snapCssPx(Math.round(cxWorld * s), dpr)
        const cy = snapCssPx(Math.round(cyWorld * s), dpr)
        ctx.fillText(String(sectorId), cx, cy)
      }
    }

    // Powerups
    if (renderState.powerups?.length) {
      for (const p of renderState.powerups) {
        const x = worldToSnappedCssPx(p.pos.x, s, dpr)
        const y = worldToSnappedCssPx(p.pos.y, s, dpr)

        const r = Math.max(4, Math.floor(2.2 * s))

        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(Math.PI / 4)

        switch (p.kind) {
          case 'HEALTH':
            ctx.fillStyle = 'rgba(248, 113, 113, 0.9)'
            break
          case 'AMMO':
            ctx.fillStyle = 'rgba(96, 165, 250, 0.9)'
            break
          case 'ENERGY':
            ctx.fillStyle = 'rgba(234, 179, 8, 0.9)'
            break
          default:
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
            break
        }

        ctx.fillRect(-r, -r, r * 2, r * 2)
        ctx.restore()
      }
    }

    // Bullets
    if (renderState.bullets?.length) {
      for (const b of renderState.bullets) {
        const x = worldToSnappedCssPx(b.pos.x, s, dpr)
        const y = worldToSnappedCssPx(b.pos.y, s, dpr)

        const r = Math.max(2, Math.floor(1.2 * s))
        const ownerColor = b.ownerBotId ? slotFallbackColor(b.ownerBotId) : null
        const alpha = typeof b.alpha === 'number' ? clamp(b.alpha, 0, 1) : 1

        ctx.save()
        ctx.globalAlpha = alpha

        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fillStyle = ownerColor ?? 'rgba(255, 255, 255, 0.85)'
        ctx.fill()

        if (b.vel) {
          // small direction hint
          const dx = Math.max(-12, Math.min(12, b.vel.x))
          const dy = Math.max(-12, Math.min(12, b.vel.y))
          ctx.beginPath()
          ctx.moveTo(x, y)
          ctx.lineTo(
            worldToSnappedCssPx(b.pos.x + dx * 0.1, s, dpr),
            worldToSnappedCssPx(b.pos.y + dy * 0.1, s, dpr),
          )
          ctx.strokeStyle = 'rgba(0,0,0,0.45)'
          ctx.lineWidth = Math.max(1, Math.floor(0.25 * s))
          ctx.stroke()
        }

        ctx.restore()
      }
    }

    if (renderState.grenades?.length) {
      for (const g of renderState.grenades) {
        const x = worldToSnappedCssPx(g.pos.x, s, dpr)
        const y = worldToSnappedCssPx(g.pos.y, s, dpr)

        const r = Math.max(3, Math.floor(1.8 * s))
        const ownerColor = g.ownerBotId ? slotFallbackColor(g.ownerBotId) : null
        const alpha = typeof g.alpha === 'number' ? clamp(g.alpha, 0, 1) : 1

        ctx.save()
        ctx.globalAlpha = alpha

        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fillStyle = ownerColor ?? 'rgba(248, 250, 252, 0.9)'
        ctx.fill()
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.8)'
        ctx.lineWidth = Math.max(1, Math.floor(0.25 * s))
        ctx.stroke()

        if (typeof g.fuse === 'number') {
          ctx.fillStyle = 'rgba(15, 23, 42, 0.9)'
          ctx.font = `${Math.max(8, Math.floor(2.2 * s))}px ui-monospace, monospace`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(String(Math.max(0, g.fuse)), x, y)
        }

        ctx.restore()
      }
    }

    // Bots
    const botRadiusPx = 8 * s
    const barH = Math.max(2, Math.floor(0.6 * s))
    const barGap = 2
    const multiBarGap = 1

    for (const bot of renderState.bots) {
      const x = worldToSnappedCssPx(bot.pos.x, s, dpr)
      const y = worldToSnappedCssPx(bot.pos.y, s, dpr)

      const fill = bot.appearanceColor ?? slotFallbackColor(bot.slotId)
      const alpha = bot.alive ? 1 : 0.35

      // Selection ring
      if (selectedBotId && bot.slotId === selectedBotId) {
        ctx.save()
        ctx.globalAlpha = 1
        ctx.strokeStyle = 'rgba(99, 102, 241, 0.95)'
        ctx.lineWidth = Math.max(2, Math.floor(1.2 * s))
        ctx.shadowColor = 'rgba(99, 102, 241, 0.55)'
        ctx.shadowBlur = 10
        ctx.beginPath()
        ctx.arc(x, y, botRadiusPx + Math.max(4, s), 0, Math.PI * 2)
        ctx.stroke()
        ctx.restore()
      }

      // Resource bars (above token)
      const showAllBars = s > 1
      const barsCount = showAllBars ? 3 : 1
      const barsTotalH = barsCount * barH + (barsCount - 1) * multiBarGap
      const barW = Math.max(24, 16 * s + 2)
      const barX = x - barW / 2
      const barY = y - botRadiusPx - barGap - barsTotalH

      ctx.save()
      ctx.globalAlpha = alpha
      renderResourceBar(ctx, barX, barY, barW, barH, bot.hp / 100, hpFill(bot.hp / 100))

      if (showAllBars) {
        renderResourceBar(
          ctx,
          barX,
          barY + barH + multiBarGap,
          barW,
          barH,
          bot.ammo / 100,
          'rgba(245, 158, 11, 0.95)',
        )
        renderResourceBar(
          ctx,
          barX,
          barY + (barH + multiBarGap) * 2,
          barW,
          barH,
          bot.energy / 100,
          'rgba(56, 189, 248, 0.95)',
        )
      }

      // Label pill
      const label = bot.displayName ?? bot.slotId
      const labelFontSize = Math.max(10, Math.floor(9 + s * 1.1))
      ctx.font = `700 ${labelFontSize}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"`
      const tm = ctx.measureText(label)
      const padX = 6
      const padY = 3
      const pillW = tm.width + padX * 2
      const pillH = labelFontSize + padY * 2
      const pillX = x - pillW / 2
      const pillY = barY - barGap - pillH

      ctx.fillStyle = 'rgba(0,0,0,0.72)'
      fillRoundRect(ctx, pillX, pillY, pillW, pillH, 6)

      ctx.fillStyle = 'rgba(255,255,255,0.92)'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(label, x, pillY + pillH / 2)

      // Bot token
      ctx.beginPath()
      ctx.arc(x, y, botRadiusPx, 0, Math.PI * 2)
      ctx.fillStyle = fill
      ctx.fill()

      ctx.strokeStyle = 'rgba(0,0,0,0.6)'
      ctx.lineWidth = Math.max(1, Math.floor(1 + s * 0.2))
      ctx.stroke()

      ctx.restore()
    }
  }, [arenaSizeWorld, renderState, resolvedScale, selectedBotId])

  const cssSize = arenaSizeWorld * resolvedScale

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
        background: 'transparent',
        ...style,
      }}
    >
      <canvas ref={canvasRef} width={cssSize} height={cssSize} />
    </div>
  )
}
