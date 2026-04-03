import { EXAMPLE_BOTS } from './exampleBots'

describe('built-in example bots', () => {
  it('bot0 starter is aggressive and uses core instructions', () => {
    const src = EXAMPLE_BOTS.bot0.sourceText
    expect(src).toContain('TARGET_CLOSEST')
    expect(src).toMatch(/\bSET_MOVE_TO_TARGET\b/) 
    expect(src).toMatch(/\bFIRE_SLOT1\b|\bUSE_SLOT1\b/) 
    expect(src).toMatch(/\bIF\b/) 
  })

  it('bot5 is a powerup-aware script with timers', () => {
    const src = EXAMPLE_BOTS.bot5.sourceText
    expect(src).toContain('TARGET_POWERUP')
    expect(src).toContain('SET_TIMER')
    expect(src).toContain('MOVE_TO_TARGET')
  })

  it('bot6 includes SAW logic and is powerup-aware with timers', () => {
    const src = EXAMPLE_BOTS.bot6.sourceText
    expect(src).toContain('TARGET_POWERUP')
    expect(src).toContain('SET_TIMER')
    expect(src).toMatch(/\bSAW\b/i)
    expect(src).toContain('MOVE_TO_TARGET')
  })
})
