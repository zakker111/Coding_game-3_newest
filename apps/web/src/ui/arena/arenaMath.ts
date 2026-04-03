export const ARENA_SIZE_WORLD = 192
export const ZONE_SIZE_WORLD = 32
export const SECTOR_SIZE_WORLD = 64
const MAX_ARENA_SCALE = 8

export function pickScale(availablePx: number, arenaSizeWorld: number = ARENA_SIZE_WORLD): number {
  for (let s = MAX_ARENA_SCALE; s >= 1; s--) {
    if (arenaSizeWorld * s <= availablePx) return s
  }
  return 1
}

/**
 * Snap a CSS pixel coordinate onto the device pixel grid.
 *
 * After you set `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)`, all drawing coordinates are in CSS pixels.
 */
export function snapCssPx(cssPx: number, dpr: number): number {
  return Math.round(cssPx * dpr) / dpr
}

export function worldToCssPx(world: number, scale: number): number {
  return Math.round(world * scale)
}

export function worldToSnappedCssPx(world: number, scale: number, dpr: number): number {
  return snapCssPx(worldToCssPx(world, scale), dpr)
}

/**
 * Returns the correct CSS pixel position for a crisp canvas stroke.
 * For odd line widths (1px/3px), draw at x+0.5 to avoid blur.
 */
export function lineCssPx(cssPx: number, lineWidth: number, dpr: number): number {
  const offset = lineWidth % 2 === 1 ? 0.5 : 0
  return snapCssPx(cssPx + offset, dpr)
}
