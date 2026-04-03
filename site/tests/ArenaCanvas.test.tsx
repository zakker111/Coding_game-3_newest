import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import mockReplay from '../public/replays/mock-replay.json'
import type { Replay } from '../src/replay/replayTypes'
import { ArenaCanvas } from '../src/ui/arena/ArenaCanvas'

describe('ArenaCanvas', () => {
  it('renders a canvas for the mock replay at tick 0', () => {
    const ctx = {
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      closePath: vi.fn(),
      fillText: vi.fn(),
      measureText: vi.fn(() => ({ width: 10 })),
      arc: vi.fn(),
      fill: vi.fn(),
      quadraticCurveTo: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
    } as any

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((type) => {
      return type === '2d' ? (ctx as any) : null
    })

    const replay = mockReplay as unknown as Replay

    const { container } = render(
      <div style={{ width: 400, height: 400 }}>
        <ArenaCanvas replay={replay} tick={0} p={1} />
      </div>,
    )

    expect(container.querySelector('canvas')).toBeInTheDocument()
  })
})
