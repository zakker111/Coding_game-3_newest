import { EXAMPLE_BOTS } from './exampleBots'

describe('built-in example bots', () => {
  it('bot0 starter is aggressive and uses core instructions', () => {
    const src = EXAMPLE_BOTS.bot0.sourceText
    expect(src).toContain('TARGET_CLOSEST')
    expect(src).toMatch(/\bSET_MOVE_TO_TARGET\b/) 
    expect(src).toContain('USE_SLOT1 TARGET')
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
    expect(src).toContain('TARGET_POWERUP ENERGY')
  })

  it('bot3 teaches immediate-move bunker control with mines and bullet dodging', () => {
    const src = EXAMPLE_BOTS.bot3.sourceText
    expect(src).toContain('USE_SLOT1 NONE')
    expect(src).toContain('SET_TIMER T1 6')
    expect(src).toContain('MOVE_TO_SECTOR 1 ZONE 1')
    expect(src).toContain('TARGET_CLOSEST_BULLET')
    expect(src).toContain('CLEAR_TARGET_BULLET')
  })

  it('bot5 is a powerup-aware script with target-state cleanup and repair-drone sustain', () => {
    const src = EXAMPLE_BOTS.bot5.sourceText
    expect(src).toContain('CLEAR_TARGET')
    expect(src).toContain('CLEAR_TARGET_POWERUP')
    expect(src).toContain('TARGET_POWERUP')
    expect(src).toContain('TARGET_POWERUP ENERGY')
    expect(src).toContain('USE_SLOT3')
    expect(src).toContain('DRONE_COUNT()')
    expect(src).toContain('MOVE_TO_TARGET')
    expect(src).toContain('USE_SLOT1 TARGET')
  })

  it('built-in bots stick to the canonical instruction spellings', () => {
    const allSource = Object.values(EXAMPLE_BOTS).map((bot) => bot.sourceText).join('\n')
    expect(allSource).not.toMatch(/\bFIRE_SLOT[123]\b/)
    expect(allSource).not.toMatch(/\bMOVE_TO_WALL\b/)
    expect(allSource).not.toMatch(/\bRETREAT_TO_SECTOR\b/)
    expect(allSource).not.toMatch(/\bHOLD_POSITION\b/)
    expect(allSource).not.toMatch(/\bNEAREST_BOT\b/)
    expect(allSource).not.toMatch(/\bWEAKEST_BOT\b/)
  })

  it('bot6 includes SAW logic and is powerup-aware with timers', () => {
    const src = EXAMPLE_BOTS.bot6.sourceText
    expect(src).toContain('TARGET_POWERUP ENERGY')
    expect(src).toContain('SET_TIMER')
    expect(src).toMatch(/\bSAW\b/i)
    expect(src).toContain('MOVE_TO_TARGET')
  })

  it('the built-in bot roster teaches health, ammo, and energy powerup seeking', () => {
    const allSource = Object.values(EXAMPLE_BOTS).map((bot) => bot.sourceText).join('\n')
    expect(allSource).toMatch(/TARGET_POWERUP HEALTH|MOVE_TO_POWERUP HEALTH/)
    expect(allSource).toMatch(/TARGET_POWERUP AMMO|MOVE_TO_POWERUP AMMO/)
    expect(allSource).toMatch(/TARGET_POWERUP ENERGY|MOVE_TO_POWERUP ENERGY/)
  })

  it('bot6 demonstrates bullet-target-aware defense', () => {
    const src = EXAMPLE_BOTS.bot6.sourceText
    expect(src).toContain('TARGET_CLOSEST_BULLET')
    expect(src).toContain('DIST_TO_TARGET_BULLET')
  })
})
