import { runMatchToReplay } from '@coding-game/engine'
import { BULLET_DAMAGE } from '../packages/engine/src/sim/constants.js'

const bots = [
  {
    slotId: 'BOT1',
    loadout: ['BULLET', null, null],
    sourceText: ['LABEL LOOP', 'IF (SLOT_READY(SLOT1)) DO FIRE_SLOT1 BOT2', 'GOTO LOOP', ''].join('\n'),
  },
  {
    slotId: 'BOT2',
    loadout: [null, 'ARMOR', null],
    sourceText: ['WAIT 1', ''].join('\n'),
  },
  { slotId: 'BOT3', loadout: [null, null, null], sourceText: 'WAIT 1\n' },
  { slotId: 'BOT4', loadout: [null, null, null], sourceText: 'WAIT 1\n' },
]

const replay = runMatchToReplay({ seed: 123, tickCap: 60, bots })
const allEvents = replay.events.flat()

const expectedDamage = BULLET_DAMAGE - Math.floor(BULLET_DAMAGE / 3)

const bulletHits = allEvents.filter((e) => e && e.type === 'BULLET_HIT' && e.victimBotId === 'BOT2')
const bulletDamageEvents = allEvents.filter(
  (e) => e && e.type === 'DAMAGE' && e.victimBotId === 'BOT2' && e.source === 'BULLET'
)

console.log('BULLET_DAMAGE:', BULLET_DAMAGE)
console.log('Expected armored bullet damage:', expectedDamage)
console.log('BULLET_HIT count:', bulletHits.length)
console.log('DAMAGE(BULLET) count:', bulletDamageEvents.length)
console.log('First 5 BULLET_HIT events:')
console.log(JSON.stringify(bulletHits.slice(0, 5), null, 2))
console.log('First 5 DAMAGE(BULLET) events:')
console.log(JSON.stringify(bulletDamageEvents.slice(0, 5), null, 2))
