import { EXAMPLE_BOTS } from './exampleBots'

describe('built-in example bots', () => {
  it('bot0 starter is aggressive and uses core instructions', () => {
    const src = EXAMPLE_BOTS.bot0.sourceText
    expect(src).toContain('TARGET_CLOSEST')
    expect(src).toMatch(/\bSET_MOVE_TO_TARGET\b/) 
    expect(src).toMatch(/\bFIRE_SLOT1\b|\bUSE_SLOT1\b/) 
    expect(src).toMatch(/\bIF\b/) 
  })

  it('bot0 starter demonstrates bullet-target evasion', () => {
    const src = EXAMPLE_BOTS.bot0.sourceText
    expect(src).toContain('TARGET_CLOSEST_BULLET')
    expect(src).toContain('MOVE_AWAY_FROM_TARGET')
  })

  it('bot1 patrol teaches weakest-target selection and bullet-target clearing', () => {
    const src = EXAMPLE_BOTS.bot1.sourceText
    expect(src).toContain('TARGET_LOWEST_HEALTH')
    expect(src).toContain('TARGET_CLOSEST_BULLET')
    expect(src).toContain('CLEAR_TARGET_BULLET')
  })

  it('bot2 teaches target cycling with immediate movement', () => {
    const src = EXAMPLE_BOTS.bot2.sourceText
    expect(src).toContain('TARGET_NEXT')
    expect(src).toContain('TARGET_NEXT_IF_DEAD')
    expect(src).toContain('MOVE_TO_TARGET')
  })

  it('bot4 teaches generic slot-driven toggle control', () => {
    const src = EXAMPLE_BOTS.bot4.sourceText
    expect(src).toContain('USE_SLOT1')
    expect(src).toContain('USE_SLOT2')
    expect(src).toContain('STOP_SLOT1')
    expect(src).toContain('STOP_SLOT2')
  })

  it('bot5 is a powerup-aware script with target-state cleanup and slot3 defense', () => {
    const src = EXAMPLE_BOTS.bot5.sourceText
    expect(src).toContain('CLEAR_TARGET')
    expect(src).toContain('CLEAR_TARGET_POWERUP')
    expect(src).toContain('TARGET_POWERUP')
    expect(src).toContain('USE_SLOT3')
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

  it('bot6 demonstrates bullet-target-aware defense', () => {
    const src = EXAMPLE_BOTS.bot6.sourceText
    expect(src).toContain('TARGET_CLOSEST_BULLET')
    expect(src).toContain('DIST_TO_TARGET_BULLET')
  })
})
