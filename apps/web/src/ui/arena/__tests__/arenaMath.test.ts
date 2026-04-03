// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { pickScale, snapCssPx } from '../arenaMath'

describe('pickScale', () => {
  it('selects the largest integer scale that fits', () => {
    expect(pickScale(1200)).toBe(6)
    expect(pickScale(1152)).toBe(6)

    expect(pickScale(1151)).toBe(5)
    expect(pickScale(960)).toBe(5)

    expect(pickScale(959)).toBe(4)
    expect(pickScale(768)).toBe(4)

    expect(pickScale(767)).toBe(3)
    expect(pickScale(576)).toBe(3)

    expect(pickScale(575)).toBe(2)
    expect(pickScale(384)).toBe(2)

    expect(pickScale(383)).toBe(1)
    expect(pickScale(192)).toBe(1)
  })
})

describe('snapCssPx', () => {
  it('snaps onto the device pixel grid', () => {
    expect(snapCssPx(10.25, 2)).toBe(10.5)
    expect(snapCssPx(10.24, 2)).toBe(10)

    // On dpr=1, snapping is integer.
    expect(snapCssPx(10.49, 1)).toBe(10)
    expect(snapCssPx(10.5, 1)).toBe(11)
  })
})
