import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '../../..')

test('deploy workshop static files expose the QA contract surface', () => {
  const html = readFileSync(path.join(repoRoot, 'deploy', 'workshop', 'index.html'), 'utf8')
  const js = readFileSync(path.join(repoRoot, 'deploy', 'workshop', 'workshop.js'), 'utf8')

  const requiredIds = [
    'runBtn',
    'randomizeOpponentsBtn',
    'scrub',
    'tickLabel',
    'runNotice',
    'inspectStats',
    'tickEventsAllBtn',
    'tickEventsRawBtn',
    'tickEventsFilterInput',
    'tickEventsFilterStatus',
    'tickEventsList',
    'eventLog',
    'workshopBuildTag',
  ]

  for (const id of requiredIds) {
    assert.match(html, new RegExp(`id="${id}"`), `expected deploy/workshop/index.html to expose #${id}`)
  }

  assert.match(html, /<script type="module" src="\.\/workshop\.js"><\/script>/, 'expected workshop module entry script')
  assert.match(js, /const WORKSHOP_BUILD = '0\.[0-9]+\.[0-9]+'/)
  assert.match(js, /Target bullet/)
  assert.match(js, /function renderTabs\(/)
  assert.match(js, /function updateInspector\(/)
})
