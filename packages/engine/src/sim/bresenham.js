/**
 * Bresenham 8-connected line stepping.
 * Returns intermediate points excluding the start, including the end.
 *
 * All inputs must be integers.
 */
export function bresenhamPoints(from, to) {
  let x0 = from.x
  let y0 = from.y
  const x1 = to.x
  const y1 = to.y

  const dx = Math.abs(x1 - x0)
  const dy = Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1

  let err = dx - dy

  /** @type {Array<{x:number,y:number}>} */
  const out = []

  while (!(x0 === x1 && y0 === y1)) {
    const e2 = 2 * err

    if (e2 > -dy) {
      err -= dy
      x0 += sx
    }

    if (e2 < dx) {
      err += dx
      y0 += sy
    }

    out.push({ x: x0, y: y0 })
  }

  return out
}
