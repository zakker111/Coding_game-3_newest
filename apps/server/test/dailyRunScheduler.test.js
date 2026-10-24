import test from 'node:test'
import assert from 'node:assert/strict'
import {
  nextScheduledTime,
  parseDailyRunHour,
  startDailyRunScheduler,
} from '../src/dailyRunScheduler.js'

const quietLog = { info() {}, error() {} }

function fakeService(runs = []) {
  const created = []
  return {
    created,
    listRuns: () => ({ runs }),
    createRun(input) {
      created.push(input)
      return { runId: 'd_test', status: 'complete' }
    },
  }
}

test('parseDailyRunHour defaults to 3, accepts 0-23, and "off" disables', () => {
  assert.equal(parseDailyRunHour(undefined), 3)
  assert.equal(parseDailyRunHour('0'), 0)
  assert.equal(parseDailyRunHour('23'), 23)
  assert.equal(parseDailyRunHour('off'), null)
  assert.throws(() => parseDailyRunHour('24'))
  assert.throws(() => parseDailyRunHour('noon'))
})

test('nextScheduledTime picks today before the slot and tomorrow after it', () => {
  assert.equal(
    nextScheduledTime(new Date('2026-10-24T01:00:00Z'), 3).toISOString(),
    '2026-10-24T03:00:00.000Z'
  )
  assert.equal(
    nextScheduledTime(new Date('2026-10-24T05:00:00Z'), 3).toISOString(),
    '2026-10-25T03:00:00.000Z'
  )
})

test('scheduler runs once for today after the slot when no run exists', () => {
  const service = fakeService([])
  const handle = startDailyRunScheduler({
    dailyRunService: service,
    hour: 3,
    now: () => new Date('2026-10-24T04:00:00Z'),
    log: quietLog,
    setTimer: () => ({ unref() {} }),
    clearTimer() {},
  })
  handle.stop()
  assert.deepEqual(service.created, [{ runDate: '2026-10-24' }])
})

test('scheduler skips when today already has a run', () => {
  const service = fakeService([{ runId: 'd_1', runDate: '2026-10-24' }])
  startDailyRunScheduler({
    dailyRunService: service,
    hour: 3,
    now: () => new Date('2026-10-24T04:00:00Z'),
    log: quietLog,
    setTimer: () => ({ unref() {} }),
    clearTimer() {},
  }).stop()
  assert.deepEqual(service.created, [])
})

test('scheduler does nothing before the slot', () => {
  const service = fakeService([])
  startDailyRunScheduler({
    dailyRunService: service,
    hour: 3,
    now: () => new Date('2026-10-24T02:00:00Z'),
    log: quietLog,
    setTimer: () => ({ unref() {} }),
    clearTimer() {},
  }).stop()
  assert.deepEqual(service.created, [])
})
