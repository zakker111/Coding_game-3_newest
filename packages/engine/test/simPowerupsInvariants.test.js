import test from 'node:test'
import assert from 'node:assert/strict'

import { runMatchToReplay } from '@coding-game/engine'

test('runMatchToReplay: powerups maxActive=6 and RULES TTL despawns when no pickups', () => {
  const bots = [
    { slotId: 'BOT1', sourceText: 'WAIT 1\n' },
    { slotId: 'BOT2', sourceText: 'WAIT 1\n' },
    { slotId: 'BOT3', sourceText: 'WAIT 1\n' },
    { slotId: 'BOT4', sourceText: 'WAIT 1\n' },
  ]

  const replay = runMatchToReplay({ seed: 999, tickCap: 120, bots })

  for (const s of replay.state) {
    assert.ok(s.powerups.length <= 6, `expected <= 6 active powerups at tick ${s.t}`)
  }

  const allEvents = replay.events.flat()

  const spawns = allEvents.filter((e) => e.type === 'POWERUP_SPAWN')
  assert.ok(spawns.length > 0, 'expected at least one POWERUP_SPAWN')

  const pickups = allEvents.filter((e) => e.type === 'POWERUP_PICKUP')
  assert.equal(pickups.length, 0, 'expected no POWERUP_PICKUP events for idle bots')

  const despawnsRules = allEvents.filter((e) => e.type === 'POWERUP_DESPAWN' && e.reason === 'RULES')
  assert.ok(despawnsRules.length > 0, 'expected at least one POWERUP_DESPAWN(reason=RULES)')

  const despawnsPickup = allEvents.filter((e) => e.type === 'POWERUP_DESPAWN' && e.reason === 'PICKUP')
  assert.equal(despawnsPickup.length, 0, 'expected no POWERUP_DESPAWN(reason=PICKUP) when no pickups')

  const spawnedIds = new Set(spawns.map((e) => e.powerupId))
  for (const e of despawnsRules) {
    assert.ok(spawnedIds.has(e.powerupId), 'expected despawned powerupId to have been spawned')
  }
})
