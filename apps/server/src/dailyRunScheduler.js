// Runs the daily league once per UTC day at a fixed hour, without an admin click.
// Config: NOWT_DAILY_RUN_HOUR_UTC (0-23, default 3). Set to "off" to disable.

const DAY_MS = 24 * 60 * 60 * 1000

export function parseDailyRunHour(value) {
  if (value == null || value === '') return 3
  if (String(value).trim().toLowerCase() === 'off') return null
  const hour = Number.parseInt(String(value), 10)
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new Error('NOWT_DAILY_RUN_HOUR_UTC must be an integer 0-23 or "off"')
  }
  return hour
}

export function utcDateString(date) {
  return date.toISOString().slice(0, 10)
}

// The next moment (UTC) at which `hour` occurs, strictly after `from` if today's slot already passed.
export function nextScheduledTime(from, hour) {
  const today = new Date(`${utcDateString(from)}T00:00:00.000Z`)
  const todaySlot = today.getTime() + hour * 60 * 60 * 1000
  return new Date(from.getTime() < todaySlot ? todaySlot : todaySlot + DAY_MS)
}

export function startDailyRunScheduler({ dailyRunService, hour, now = () => new Date(), log = console, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let timer = null
  let stopped = false

  const hasRunForDate = (runDate) => {
    const latest = dailyRunService.listRuns().runs[0]
    return Boolean(latest && latest.runDate === runDate)
  }

  const runIfDue = () => {
    const current = now()
    const runDate = utcDateString(current)
    const slotPassed = current.getUTCHours() >= hour
    if (!slotPassed || hasRunForDate(runDate)) return
    try {
      const run = dailyRunService.createRun({ runDate })
      log.info?.(`[daily-run] ran ${runDate} as ${run.runId} (${run.status})`)
    } catch (error) {
      log.error?.(`[daily-run] scheduled run for ${runDate} failed: ${error.message}`)
    }
  }

  const schedule = () => {
    if (stopped) return
    const current = now()
    const next = nextScheduledTime(current, hour)
    timer = setTimer(() => {
      runIfDue()
      schedule()
    }, Math.max(1000, next.getTime() - current.getTime()))
    timer.unref?.()
  }

  // Catch up once on startup (e.g. after a redeploy past the slot), then follow the timer.
  runIfDue()
  schedule()

  return {
    stop() {
      stopped = true
      clearTimer(timer)
    },
  }
}
