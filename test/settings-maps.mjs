/**
 * Settings-plane round trip for this plugin's arbitrary-key maps.
 *
 * `groupLabels` and `providerHints` are maps whose keys only exist at runtime,
 * and the settings service projects every form field key by key. A map declared
 * as an empty object schema therefore reads back as `{}` even while the stored
 * document holds entries: the value survives the write and vanishes from the
 * read, so a saved edit looks like it never took effect. This gate drives the
 * REAL `@deepseek-ai/dsh-settings` service over this plugin's exported `Config`
 * schema and asserts the maps survive describe → mutate → describe untouched,
 * including what a blank providerHints map does once one is set.
 */
import assert from 'node:assert/strict'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context, Service } from '@deepseek-ai/cordis'
import SettingsForms from '@deepseek-ai/dsh-settings'
import { Config } from '../lib/index.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const NS = 'dsh-llm-omniroute'

/** The loader the settings service reads the legacy document through; nothing to await here. */
class StubLoader extends Service {
  constructor(ctx) {
    super(ctx, 'loader')
  }

  await() {
    return Promise.resolve()
  }
}

/**
 * Mount the real settings service over one plugin entry, with the profile
 * patch reads and writes landing in `entry` exactly as the loader would.
 * @param raw - the profile patch this entry starts from.
 * @returns the service, plus the entry it edits.
 */
function mountSettings(raw) {
  const ctx = new Context()
  new StubLoader(ctx)
  // The legacy-document import runs off `profileContext.home`; pointing it at a
  // path with no settings.yaml keeps the service inert there.
  ctx.profileContext = { home: join(ROOT, 'test', 'fixtures', 'absent-home'), name: 'test' }
  const entry = {
    id: NS,
    options: { id: NS, config: raw },
    fiber: { uid: 'settings-map-probe', state: 2, config: Config(raw), runtime: { Config }, ctx },
  }
  class StubConfigEditor extends Service {
    constructor(inner) {
      super(inner, 'configEditor')
      this.documentPath = join(ROOT, 'cordis.patch.yml')
    }

    entries() {
      return [entry]
    }

    configuration() {
      return [{ entry, inherited: {}, override: {} }]
    }

    /** The real editor validates and re-parses the next patch; this mirrors it. */
    edit(target, change) {
      const next = change(target.options.config, {})
      target.options.config = next
      target.fiber.config = Config(next)
    }
  }
  new StubConfigEditor(ctx)
  return { settings: new SettingsForms(ctx), entry }
}

const raw = {
  groupLabels: { agy: 'AGY' },
  providerHints: { defaults: { glm: 'zai' }, models: { 'agy/claude-sonnet-4-6': 'anthropic' } },
}
const { settings, entry } = mountSettings(raw)
const view = () => {
  const row = settings.describe().find(candidate => candidate.ns === NS)
  assert.notEqual(row, undefined, `settings has no namespace ${NS}`)
  return row
}

// A stored map reaches the form whole: the page that edits it can show the
// current labels instead of an empty table.
assert.deepEqual(view().value.groupLabels, { agy: 'AGY' })
assert.deepEqual(view().value.providerHints, raw.providerHints)
assert.deepEqual(entry.options.config.groupLabels, { agy: 'AGY' })

// A saved edit is what the next read reports — the edit that used to look like
// it never happened.
await settings.mutate(NS, [
  { op: 'set', path: ['groupLabels'], value: { agy: 'AGY', 'command-code': 'CMD' } },
], view().revision)
assert.deepEqual(view().value.groupLabels, { agy: 'AGY', 'command-code': 'CMD' })

// Clearing every label drops the field, and the read stays coherent.
await settings.mutate(NS, [{ op: 'unset', path: ['groupLabels'] }], view().revision)
assert.deepEqual(view().value.groupLabels, {})
assert.equal(entry.options.config.groupLabels, undefined)

// The hints map is the same shape and takes the same edits.
await settings.mutate(NS, [
  { op: 'set', path: ['providerHints'], value: { defaults: { qwen: 'alibaba' }, models: {} } },
], view().revision)
assert.deepEqual(view().value.providerHints, { defaults: { qwen: 'alibaba' }, models: {} })

console.log('settings maps: groupLabels and providerHints round-trip through describe/mutate OK')
