import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import pg from 'pg'

import { createPersistentStoreBundle } from '../src/store/persistentStoreBundle.js'
import { createPostgresStorage } from '../src/store/postgresStorage.js'
import { createFileStorage } from '../src/store/fileStorage.js'

// Runs only when a scratch database is provided, e.g.
//   TEST_DATABASE_URL=postgres://nowt:nowt@localhost:5432/nowt_test node --test
const url = process.env.TEST_DATABASE_URL
const skip = url ? false : 'set TEST_DATABASE_URL to run the Postgres integration test'

async function resetDatabase() {
  const client = new pg.Client({ connectionString: url })
  await client.connect()
  await client.query('DROP TABLE IF EXISTS nowt_records')
  await client.end()
}

test('Postgres storage keeps users, sessions, bots, matches, and runs across restarts', { skip }, async () => {
  await resetDatabase()

  const first = await createPostgresStorage({ connectionString: url, log: { log() {}, error() {} } })
  const db1 = createPersistentStoreBundle({ storage: first })
  const user = db1.userStore.createUser({ username: 'alice', passwordHash: 'hash' })
  const session = db1.userStore.createSession({ userId: user.id, expiresAt: '2099-01-01T00:00:00.000Z' })
  const gone = db1.userStore.createSession({ userId: user.id })
  db1.userStore.deleteSession(gone.sessionId)
  db1.botStore.saveBot({ ownerUsername: 'alice', name: 'bot1', sourceText: 'WAIT 1\n', sourceHash: 'h1', loadout: [null, null, null] })
  const match = db1.matchStore.createMatch({ kind: 'sandbox' })
  db1.matchStore.markComplete(match.matchId, { result: { ok: true }, replay: { frames: [1, 2, 3] } })
  const run = db1.dailyRunStore.createRun({ runDate: '2026-10-24' })
  await db1.flush()
  await first.close()

  const second = await createPostgresStorage({ connectionString: url, log: { log() {}, error() {} } })
  const db2 = createPersistentStoreBundle({ storage: second })
  assert.equal(db2.userStore.getUserByUsername('alice')?.id, user.id)
  assert.equal(db2.userStore.getSession(session.sessionId)?.userId, user.id)
  assert.equal(db2.userStore.getSession(gone.sessionId), null)
  assert.equal(db2.botStore.getBot('alice', 'bot1')?.sourceHash, 'h1')
  assert.deepEqual(db2.matchStore.getReplay(match.matchId), { frames: [1, 2, 3] })
  assert.equal(db2.dailyRunStore.getRun(run.runId)?.runDate, '2026-10-24')

  // Counters survive: the next user id continues after the saved one.
  const bob = db2.userStore.createUser({ username: 'bob', passwordHash: 'hash' })
  assert.equal(bob.id, 'u_000002')
  await db2.flush()
  await second.close()
})

test('first start imports an existing JSON state file into an empty database', { skip }, async () => {
  await resetDatabase()
  const dir = mkdtempSync(join(tmpdir(), 'nowt-import-'))
  const filePath = join(dir, 'state.json')

  const fileDb = createPersistentStoreBundle({ storage: createFileStorage(filePath) })
  fileDb.userStore.createUser({ username: 'carol', passwordHash: 'hash' })
  await fileDb.flush()

  const storage = await createPostgresStorage({
    connectionString: url,
    importFromFile: filePath,
    log: { log() {}, error() {} },
  })
  const db = createPersistentStoreBundle({ storage })
  assert.ok(db.userStore.getUserByUsername('carol'))
  await db.flush()
  await storage.close()

  const again = await createPostgresStorage({ connectionString: url, log: { log() {}, error() {} } })
  assert.ok(createPersistentStoreBundle({ storage: again }).userStore.getUserByUsername('carol'))
  await again.close()
})

test('a failed write does not bring back a session that was deleted before the next good write', { skip }, async () => {
  await resetDatabase()
  const quiet = { log() {}, error() {} }
  const state = (sessions) => ({
    version: 1,
    nextUserId: 2,
    nextMatchId: 1,
    users: [],
    sessions,
    bots: [],
    matches: [],
    dailyRuns: [],
  })
  const kept = { sessionId: 'S-kept', userId: 'u_000001', createdAt: '2026-01-01T00:00:00.000Z' }
  const loggedOut = { sessionId: 'S-logged-out', userId: 'u_000001', createdAt: '2026-01-01T00:00:00.000Z' }
  const boom = { sessionId: 'S-boom', userId: 'u_000001', createdAt: '2026-01-01T00:00:00.000Z' }

  const storage = await createPostgresStorage({ connectionString: url, log: quiet })
  await storage.save(state([kept, loggedOut]))

  // Make the next write fail once, by raising an error for one specific row.
  const admin = new pg.Client({ connectionString: url })
  await admin.connect()
  await admin.query(
    `CREATE OR REPLACE FUNCTION nowt_test_fail() RETURNS trigger AS $$
     BEGIN RAISE EXCEPTION 'simulated write failure'; END $$ LANGUAGE plpgsql`
  )
  await admin.query(
    `CREATE TRIGGER nowt_test_fail BEFORE INSERT OR UPDATE ON nowt_records
     FOR EACH ROW WHEN (NEW.id = 'S-boom') EXECUTE FUNCTION nowt_test_fail()`
  )
  await storage.save(state([kept, boom])) // fails and rolls back
  await admin.query('DROP TRIGGER nowt_test_fail ON nowt_records')

  // The user logs out: the session is gone from memory and the next save must remove it in the database too.
  await storage.save(state([kept]))
  await storage.flush()
  await storage.close()
  await admin.end()

  const restarted = await createPostgresStorage({ connectionString: url, log: quiet })
  const sessionIds = restarted.load().sessions.map((session) => session.sessionId).sort()
  assert.deepEqual(sessionIds, ['S-kept'])
  await restarted.close()
})
