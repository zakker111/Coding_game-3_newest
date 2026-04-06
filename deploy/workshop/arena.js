const ARENA_SIZE_WORLD = 192
const SECTOR_SIZE_WORLD = 64
const ZONE_SIZE_WORLD = 32

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v))
}

function slotFallbackColor(slotId) {
  switch (slotId) {
    case 'BOT1':
      return '#4ade80'
    case 'BOT2':
      return '#60a5fa'
    case 'BOT3':
      return '#f472b6'
    case 'BOT4':
      return '#fbbf24'
    default:
      return '#e2e8f0'
  }
}

function hpFill(hp01) {
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

function fillRoundRect(ctx, x, y, w, h, r) {
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

function measureAndSetCanvas(canvas, desiredCssPx) {
  const dpr = window.devicePixelRatio || 1

  canvas.style.width = `${desiredCssPx}px`
  canvas.style.height = `${desiredCssPx}px`
  canvas.width = Math.max(1, Math.round(desiredCssPx * dpr))
  canvas.height = Math.max(1, Math.round(desiredCssPx * dpr))

  const ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.imageSmoothingEnabled = false

  return { ctx, dpr }
}

function buildAppearanceMap(replay) {
  const map = {}
  for (const b of replay.bots || []) {
    if (b?.appearance?.kind === 'COLOR' && typeof b.appearance.color === 'string') {
      map[b.slotId] = b.appearance.color
    }
  }
  return map
}

function buildLabelMap(replay) {
  const map = {}
  for (const b of replay.bots || []) {
    map[b.slotId] = typeof b?.displayName === 'string' && b.displayName ? b.displayName : b.slotId
  }
  return map
}

function clampInt(n, lo, hi) {
  return Math.max(lo, Math.min(hi, Math.floor(n)))
}

function locToWorld(loc) {
  const sectorId = clampInt(loc?.sector ?? 1, 1, 9)
  const zone = clampInt(loc?.zone ?? 0, 0, 4)

  const sectorRow = Math.floor((sectorId - 1) / 3)
  const sectorCol = (sectorId - 1) % 3
  const sectorOriginX = sectorCol * SECTOR_SIZE_WORLD
  const sectorOriginY = sectorRow * SECTOR_SIZE_WORLD

  if (zone === 0) return { x: sectorOriginX + 32, y: sectorOriginY + 32 }

  const zoneOffsets = {
    1: { x: 0, y: 0 },
    2: { x: 32, y: 0 },
    3: { x: 0, y: 32 },
    4: { x: 32, y: 32 },
  }

  const off = zoneOffsets[zone] ?? { x: 0, y: 0 }
  return { x: sectorOriginX + off.x + 16, y: sectorOriginY + off.y + 16 }
}

function getInterpolatedBots(replay, tick, a) {
  const t = clamp(tick, 0, replay.tickCap)
  const next = replay.state?.[t]
  const prev = t > 0 ? replay.state?.[t - 1] : next
  const prevById = new Map((prev?.bots || []).map((b) => [b.botId, b]))

  const out = []
  for (const b of next?.bots || []) {
    const p = prevById.get(b.botId) || b
    out.push({
      botId: b.botId,
      pos: {
        x: p.pos.x + (b.pos.x - p.pos.x) * a,
        y: p.pos.y + (b.pos.y - p.pos.y) * a,
      },
      hp: b.hp,
      ammo: b.ammo,
      energy: b.energy,
      alive: b.alive,
    })
  }
  return out
}

function getInterpolatedBullets(replay, tick, a) {
  const t = clamp(tick, 0, replay.tickCap)
  const next = replay.state?.[t]
  const prev = t > 0 ? replay.state?.[t - 1] : next

  if (!next || !prev) return []

  const prevById = new Map((prev?.bullets || []).map((b) => [b.bulletId, b]))
  const nextById = new Map((next?.bullets || []).map((b) => [b.bulletId, b]))

  const bulletIds = new Set()
  for (const b of prev?.bullets || []) bulletIds.add(b.bulletId)
  for (const b of next?.bullets || []) bulletIds.add(b.bulletId)

  // If a bullet is new at tick t, it won't exist in the previous snapshot (t-1).
  // Prefer the BULLET_SPAWN event position as the "from" point so bullets appear
  // to spawn at the muzzle and start moving immediately.
  const tickEvents = (replay.events && replay.events[t]) || []

  const spawnsByBulletId = new Map(
    tickEvents.filter((e) => e && e.type === 'BULLET_SPAWN' && e.bulletId).map((e) => [e.bulletId, e])
  )

  const despawnsByBulletId = new Map(
    tickEvents.filter((e) => e && e.type === 'BULLET_DESPAWN' && e.bulletId).map((e) => [e.bulletId, e])
  )

  const out = []
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
      const from =
        spawn?.pos ??
        (b1.vel ? { x: b1.pos.x - b1.vel.x, y: b1.pos.y - b1.vel.y } : { x: b1.pos.x, y: b1.pos.y })

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
    const from = b0?.pos ?? b1.pos
    const to = b1?.pos ?? b0.pos

    out.push({
      bulletId,
      ownerBotId: b1?.ownerBotId ?? b0.ownerBotId,
      vel: b1?.vel ?? b0.vel,
      pos: {
        x: from.x + (to.x - from.x) * a,
        y: from.y + (to.y - from.y) * a,
      },
    })
  }

  return out
}

function getInterpolatedGrenades(replay, tick, a) {
  const t = clamp(tick, 0, replay.tickCap)
  const next = replay.state?.[t]
  const prev = t > 0 ? replay.state?.[t - 1] : next

  if (!next || !prev) return []

  const prevGrenades = prev?.grenades || []
  const nextGrenades = next?.grenades || []

  const prevById = new Map(prevGrenades.map((g) => [g.grenadeId, g]))
  const nextById = new Map(nextGrenades.map((g) => [g.grenadeId, g]))

  const grenadeIds = new Set()
  for (const g of prevGrenades) grenadeIds.add(g.grenadeId)
  for (const g of nextGrenades) grenadeIds.add(g.grenadeId)

  const tickEvents = (replay.events && replay.events[t]) || []

  const spawnsByGrenadeId = new Map(
    tickEvents.filter((e) => e && e.type === 'GRENADE_SPAWN' && e.grenadeId).map((e) => [e.grenadeId, e])
  )

  const despawnsByGrenadeId = new Map(
    tickEvents.filter((e) => e && e.type === 'GRENADE_DESPAWN' && e.grenadeId).map((e) => [e.grenadeId, e])
  )

  const out = []
  for (const grenadeId of grenadeIds) {
    const g0 = prevById.get(grenadeId)
    const g1 = nextById.get(grenadeId)
    if (!g0 && !g1) continue

    if (g0 && !g1) {
      if (a >= 1) continue

      const despawn = despawnsByGrenadeId.get(grenadeId)
      const to = despawn?.pos || g0.pos

      out.push({
        grenadeId,
        ownerBotId: g0.ownerBotId,
        vel: g0.vel,
        fuse: g0.fuse,
        pos: {
          x: g0.pos.x + (to.x - g0.pos.x) * a,
          y: g0.pos.y + (to.y - g0.pos.y) * a,
        },
        alpha: 1 - a,
      })
      continue
    }

    if (!g0 && g1) {
      const spawn = spawnsByGrenadeId.get(grenadeId)
      const from = spawn?.pos || (g1.vel ? { x: g1.pos.x - g1.vel.x, y: g1.pos.y - g1.vel.y } : { x: g1.pos.x, y: g1.pos.y })

      out.push({
        grenadeId,
        ownerBotId: g1.ownerBotId,
        vel: g1.vel,
        fuse: g1.fuse,
        pos: {
          x: from.x + (g1.pos.x - from.x) * a,
          y: from.y + (g1.pos.y - from.y) * a,
        },
      })
      continue
    }

    const from = (g0 && g0.pos) || g1.pos
    const to = (g1 && g1.pos) || g0.pos
    const vel = (g1 && g1.vel) || g0.vel
    const ownerBotId = (g1 && g1.ownerBotId) || g0.ownerBotId
    const fuse = (g1 && g1.fuse) ?? (g0 && g0.fuse)

    out.push({
      grenadeId,
      ownerBotId,
      vel,
      fuse,
      pos: {
        x: from.x + (to.x - from.x) * a,
        y: from.y + (to.y - from.y) * a,
      },
    })
  }

  return out
}

function draw(ctx, cssSize, scale, renderState, selectedBotId) {
  ctx.clearRect(0, 0, cssSize, cssSize)

  // Background
  ctx.fillStyle = '#0b0f17'
  ctx.fillRect(0, 0, cssSize, cssSize)

  const zoneStepPx = ZONE_SIZE_WORLD * scale
  const sectorStepPx = SECTOR_SIZE_WORLD * scale

  // Zone grid
  ctx.strokeStyle = 'rgba(34, 197, 94, 0.16)'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let x = zoneStepPx; x < cssSize; x += zoneStepPx) {
    ctx.moveTo(x + 0.5, 0)
    ctx.lineTo(x + 0.5, cssSize)
  }
  for (let y = zoneStepPx; y < cssSize; y += zoneStepPx) {
    ctx.moveTo(0, y + 0.5)
    ctx.lineTo(cssSize, y + 0.5)
  }
  ctx.stroke()

  // Sector grid
  ctx.strokeStyle = 'rgba(34, 197, 94, 0.36)'
  ctx.lineWidth = 2
  ctx.beginPath()
  for (let x = sectorStepPx; x < cssSize; x += sectorStepPx) {
    ctx.moveTo(x + 0.5, 0)
    ctx.lineTo(x + 0.5, cssSize)
  }
  for (let y = sectorStepPx; y < cssSize; y += sectorStepPx) {
    ctx.moveTo(0, y + 0.5)
    ctx.lineTo(cssSize, y + 0.5)
  }
  ctx.stroke()

  // Outer wall
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.85)'
  ctx.lineWidth = Math.max(3, Math.floor(scale))
  const inset = ctx.lineWidth / 2
  ctx.strokeRect(inset, inset, cssSize - inset * 2, cssSize - inset * 2)

  // Sector labels
  ctx.fillStyle = 'rgba(34, 197, 94, 0.28)'
  ctx.font = `600 ${Math.max(12, Math.floor(10 + scale * 1.2))}px ui-monospace, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const sectorId = row * 3 + col + 1
      const cx = (col * SECTOR_SIZE_WORLD + SECTOR_SIZE_WORLD / 2) * scale
      const cy = (row * SECTOR_SIZE_WORLD + SECTOR_SIZE_WORLD / 2) * scale
      ctx.fillText(String(sectorId), Math.round(cx), Math.round(cy))
    }
  }

  // Powerups
  for (const p of renderState.powerups || []) {
    const x = p.pos.x * scale
    const y = p.pos.y * scale

    const r = Math.max(4, Math.floor(2.2 * scale))

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
        ctx.fillStyle = 'rgba(255,255,255,0.9)'
        break
    }

    ctx.fillRect(-r, -r, r * 2, r * 2)
    ctx.restore()
  }

  // Bullets
  for (const b of renderState.bullets || []) {
    const x = b.pos.x * scale
    const y = b.pos.y * scale
    const r = Math.max(2, Math.floor(1.2 * scale))

    ctx.save()
    if (typeof b.alpha === 'number') ctx.globalAlpha = clamp(b.alpha, 0, 1)

    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fillStyle = slotFallbackColor(b.ownerBotId)
    ctx.fill()

    if (b.vel) {
      const dx = clamp(b.vel.x, -12, 12)
      const dy = clamp(b.vel.y, -12, 12)
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo((b.pos.x + dx * 0.1) * scale, (b.pos.y + dy * 0.1) * scale)
      ctx.strokeStyle = 'rgba(0,0,0,0.45)'
      ctx.lineWidth = Math.max(1, Math.floor(0.25 * scale))
      ctx.stroke()
    }

    ctx.restore()
  }

  for (const g of renderState.grenades || []) {
    const x = g.pos.x * scale
    const y = g.pos.y * scale
    const r = Math.max(3, Math.floor(1.8 * scale))

    ctx.save()
    if (typeof g.alpha === 'number') ctx.globalAlpha = clamp(g.alpha, 0, 1)

    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fillStyle = slotFallbackColor(g.ownerBotId)
    ctx.fill()
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.8)'
    ctx.lineWidth = Math.max(1, Math.floor(0.25 * scale))
    ctx.stroke()

    if (typeof g.fuse === 'number') {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)'
      ctx.font = `${Math.max(8, Math.floor(2.2 * scale))}px ui-monospace, monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(Math.max(0, g.fuse)), x, y)
    }

    ctx.restore()
  }

  for (const m of renderState.mines || []) {
    const x = m.pos.x * scale
    const y = m.pos.y * scale
    const half = Math.max(3, Math.floor(1.7 * scale))
    const armed = (m.armRemaining || 0) <= 0

    ctx.save()
    ctx.fillStyle = slotFallbackColor(m.ownerBotId)
    ctx.strokeStyle = armed ? 'rgba(127, 29, 29, 0.95)' : 'rgba(15, 23, 42, 0.8)'
    ctx.lineWidth = Math.max(1, Math.floor(0.25 * scale))
    ctx.fillRect(x - half, y - half, half * 2, half * 2)
    ctx.strokeRect(x - half, y - half, half * 2, half * 2)
    ctx.fillStyle = 'rgba(15, 23, 42, 0.95)'
    ctx.font = `${Math.max(8, Math.floor(2.1 * scale))}px ui-monospace, monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(armed ? String(Math.max(0, m.fuseRemaining || 0)) : 'A', x, y)
    ctx.restore()
  }

  // Bots
  const botRadius = 8 * scale
  const barH = Math.max(2, Math.floor(0.6 * scale))
  const barW = Math.max(24, 16 * scale + 2)

  for (const bot of renderState.bots || []) {
    const x = bot.pos.x * scale
    const y = bot.pos.y * scale

    const fill = bot.appearanceColor || slotFallbackColor(bot.botId)
    const a = bot.alive ? 1 : 0.35

    // Selection ring
    if (selectedBotId && bot.botId === selectedBotId) {
      ctx.save()
      ctx.globalAlpha = 1
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.95)'
      ctx.lineWidth = Math.max(2, Math.floor(1.2 * scale))
      ctx.shadowColor = 'rgba(99, 102, 241, 0.55)'
      ctx.shadowBlur = 10
      ctx.beginPath()
      ctx.arc(x, y, botRadius + Math.max(4, scale), 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()
    }

    ctx.save()
    ctx.globalAlpha = a

    // Bars
    const barX = x - barW / 2
    const barY = y - botRadius - 6 - barH * 3 - 2

    ctx.fillStyle = 'rgba(0,0,0,0.65)'
    ctx.fillRect(barX, barY, barW, barH)
    ctx.fillStyle = hpFill(bot.hp / 100)
    ctx.fillRect(barX, barY, barW * clamp(bot.hp / 100, 0, 1), barH)

    ctx.fillStyle = 'rgba(0,0,0,0.65)'
    ctx.fillRect(barX, barY + barH + 1, barW, barH)
    ctx.fillStyle = 'rgba(245, 158, 11, 0.95)'
    ctx.fillRect(barX, barY + barH + 1, barW * clamp(bot.ammo / 100, 0, 1), barH)

    ctx.fillStyle = 'rgba(0,0,0,0.65)'
    ctx.fillRect(barX, barY + (barH + 1) * 2, barW, barH)
    ctx.fillStyle = 'rgba(56, 189, 248, 0.95)'
    ctx.fillRect(barX, barY + (barH + 1) * 2, barW * clamp(bot.energy / 100, 0, 1), barH)

    // Label
    const label = bot.label || bot.botId
    const labelFont = Math.max(10, Math.floor(9 + scale * 1.1))
    ctx.font = `700 ${labelFont}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial`
    const tm = ctx.measureText(label)
    const pillW = tm.width + 12
    const pillH = labelFont + 6
    const pillX = x - pillW / 2
    const pillY = barY - 6 - pillH

    ctx.fillStyle = 'rgba(0,0,0,0.72)'
    fillRoundRect(ctx, pillX, pillY, pillW, pillH, 6)
    ctx.fillStyle = 'rgba(255,255,255,0.92)'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, x, pillY + pillH / 2)

    // Token
    ctx.beginPath()
    ctx.arc(x, y, botRadius, 0, Math.PI * 2)
    ctx.fillStyle = fill
    ctx.fill()
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'
    ctx.lineWidth = Math.max(1, Math.floor(1 + scale * 0.2))
    ctx.stroke()

    ctx.restore()
  }
}

export function attachArenaRenderer(canvas) {
  let resizeObs = null
  let cssSize = 0
  let scale = 2
  let ctx = null

  function ensureSize() {
    const parent = canvas.parentElement
    const avail = parent ? Math.min(parent.clientWidth, parent.clientHeight || parent.clientWidth) : 640

    scale = clamp(Math.floor(avail / ARENA_SIZE_WORLD), 1, 6)
    cssSize = ARENA_SIZE_WORLD * scale
    const res = measureAndSetCanvas(canvas, cssSize)
    ctx = res.ctx
  }

  ensureSize()

  if ('ResizeObserver' in window) {
    resizeObs = new ResizeObserver(() => ensureSize())
    if (canvas.parentElement) resizeObs.observe(canvas.parentElement)
  }

  function renderEmpty() {
    ensureSize()
    draw(ctx, cssSize, scale, { bots: [], bullets: [] }, null)
  }

  function renderReplayFrame(replay, tick, alpha, selectedBotId) {
    ensureSize()

    const appearanceMap = buildAppearanceMap(replay)
    const labelMap = buildLabelMap(replay)

    const bots = getInterpolatedBots(replay, tick, alpha).map((b) => ({
      ...b,
      appearanceColor: appearanceMap[b.botId] || null,
      label: labelMap[b.botId] || b.botId,
    }))
    const bullets = getInterpolatedBullets(replay, tick, alpha)
    const grenades = getInterpolatedGrenades(replay, tick, alpha)

    const t = clamp(tick, 0, replay.tickCap)
    const snapState = replay.state[t] || null
    const powerups = (snapState?.powerups || []).map((p) => ({
      powerupId: p.powerupId,
      kind: p.type,
      pos: locToWorld(p.loc),
    }))
    const mines = (snapState?.mines || []).map((m) => ({
      mineId: m.mineId,
      ownerBotId: m.ownerBotId,
      pos: locToWorld({ sector: m.sector, zone: 0 }),
      armRemaining: m.armRemaining,
      fuseRemaining: m.fuseRemaining,
    }))

    draw(ctx, cssSize, scale, { bots, bullets, grenades, mines, powerups }, selectedBotId)
  }

  return {
    renderEmpty,
    renderReplayFrame,
  }
}
