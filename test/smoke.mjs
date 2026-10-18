/**
 * Composition smoke test: mount LlmRuntime + this plugin through real
 * cordis Contexts (no network), then assert the provider-side surface —
 * route registration, configurable-provider directory entry, capability
 * mapping and chat-only filtering over a stubbed gateway listing, the
 * thinking-level rules (no-think ids, level-carrying ids, declared tiers),
 * credential resolution through the credentials service only (no environment
 * fallback), the settings schema refusing sections the adapter cannot serve,
 * a volatile edit reaching the next request without re-applying the plugin,
 * the group display names composing into every name the route serves, and the
 * web seam providers the gateway's own search/fetch stack backs.
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { Context, Service } from '@deepseek-ai/cordis'
import { updateVolatile } from '@deepseek-ai/cosmokit'
import LlmRuntime, { resolveRetryPolicy } from '@deepseek-ai/dsh-llm'
import * as plugin from '../lib/index.js'

/** Minimal credentials service: resolve() only, from an in-memory store. */
class FakeCredentials extends Service {
  constructor(ctx, store) {
    super(ctx, 'credentials')
    this.store = store
  }

  resolve(ref) {
    return Promise.resolve(this.store[ref] === undefined
      ? undefined
      : { value: this.store[ref], source: 'store' })
  }
}

/** Minimal web server: records the routes a channel registration installs. */
class FakeWebServer extends Service {
  constructor(ctx) {
    super(ctx, 'webServer')
    this.routes = []
  }

  register(route) {
    this.routes.push(route)
    return () => {}
  }
}

/**
 * The 0.2.1 connection service, reproduced faithfully enough to catch a
 * regression. On the real package `rpc.handle` is unusable: its `rpc` getter
 * captures the service's OWN context, which injects no `webServer`, so the
 * inner `owner.webServer.register(route)` throws the cordis guard error and
 * the effect swallows it. Only `register(owner, channel, handler)` called with
 * a context that injected `webServer` can install a channel — which is what
 * the plugin must therefore do.
 */
class FakeConnection extends Service {
  constructor(ctx, channels) {
    super(ctx, 'connection')
    this.channels = channels
  }

  get rpc() {
    const owner = this.ctx
    return { handle: (channel, handler) => this.register(owner, channel, handler) }
  }

  register(owner, channel, handler) {
    return owner.effect(() => {
      const dispose = owner.webServer.register({ kind: 'prefix', path: channel })
      this.channels.push({ channel, handler })
      return dispose
    })
  }
}

/**
 * Minimal web seam: records the providers the plugin registers. The real
 * service also owns selection and error codes, which the plugin never touches.
 */
class FakeWeb extends Service {
  constructor(ctx) {
    super(ctx, 'web')
    this.searchProviders = []
    this.fetchProviders = []
  }

  registerSearchProvider(provider) {
    this.searchProviders.push(provider)
    return () => {}
  }

  registerFetchProvider(provider) {
    this.fetchProviders.push(provider)
    return () => {}
  }
}

async function mountPlugin(ctx, config = {}) {
  return ctx.plugin({
    name: plugin.name,
    inject: plugin.inject,
    Config: plugin.Config,
    apply: plugin.apply,
  }, config)
}

/** Stub fetch to answer a models listing and record the request. */
function stubModelsListing() {
  const originalFetch = globalThis.fetch
  const asked = { url: '', auth: '' }
  globalThis.fetch = async (url, init) => {
    asked.url = String(url)
    asked.auth = new Headers(init?.headers).get('authorization') ?? ''
    return new Response(JSON.stringify({
      object: 'list',
      data: [
        { id: 'deepseek-chat' },
        { id: 'text-embedding-3-large' },
        { id: 'bge-reranker-v2-m3' },
        { id: 'Qwen/Reranker-Flash' },
        { id: 'gemini-2.5-pro' },
        // Capability-shaped entries: a non-chat model whose listing says so,
        // and a chat model that discloses capacities and vision.
        { id: 'sfc/Qwen3-Embedding-8B', type: 'embedding', supported_endpoints: ['embeddings'] },
        {
          id: 'vendor/vision-chat',
          context_length: 200_000,
          max_output_tokens: 64_000,
          input_modalities: ['text', 'image'],
          capabilities: { tool_calling: true, vision: true, effort_tiers: ['low', 'high'] },
        },
      ],
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  return {
    asked,
    restore: () => { globalThis.fetch = originalFetch },
  }
}

// ── Block A: registration faces and chat-only discovery filtering ──
{
  const ctx = new Context()
  await ctx.plugin(LlmRuntime)
  const fiber = await mountPlugin(ctx)

  assert.deepEqual(
    ctx.llm.listProviders().map(provider => ({ id: provider.id, name: provider.name })),
    [{ id: 'omniroute', name: 'Custom Provider' }],
  )

  const directory = ctx.llm.listConfigurableProviders()
  assert.equal(directory.length, 1)
  assert.equal(directory[0].provider, 'omniroute')
  assert.equal(directory[0].displayName, 'Custom Provider')
  assert.equal(directory[0].settingsNs, 'dsh-llm-omniroute')
  assert.deepEqual(directory[0].settingsPath, [])
  assert.equal(directory[0].declared, true)

  const { asked, restore } = stubModelsListing()
  let discovered
  try {
    discovered = await ctx.llm.discoverModels('dsh-llm-omniroute', {
      baseURL: 'http://gw.local:3000/v1/',
      apiKey: 'smoke-key',
    })
  } finally {
    restore()
  }

  assert.equal(asked.url, 'http://gw.local:3000/v1/models')
  assert.equal(asked.auth, 'Bearer smoke-key')
  assert.deepEqual(
    discovered.map(model => model.id),
    ['deepseek-chat', 'gemini-2.5-pro', 'vendor/vision-chat'],
  )
  // The listing's own capability facts reach the discovery shape; the
  // declaration stays text-only because this wire route cannot carry images.
  const visionChat = discovered.find(model => model.id === 'vendor/vision-chat')
  assert.equal(visionChat.contextWindow, 200_000)
  assert.equal(visionChat.maxTokens, 64_000)
  assert.deepEqual(visionChat.inputModalities, ['text'])
  assert.equal(visionChat.name, 'Vision Chat[vendor]')

  // HMR safety: disposing the fiber removes the route and the directory entry.
  await fiber.dispose()
  assert.deepEqual(ctx.llm.listProviders(), [])
  assert.deepEqual(ctx.llm.listConfigurableProviders(), [])
}

// ── Block B: the API key comes from the credentials service only ──
{
  // Without a credentials service there is no key anywhere: the request-time
  // failure names the settings page, not an environment variable.
  const ctx = new Context()
  await ctx.plugin(LlmRuntime)
  await mountPlugin(ctx)
  await assert.rejects(
    ctx.llm.discoverModels('dsh-llm-omniroute', { baseURL: 'http://gw.local:3000/v1' }),
    (error) => error.code === 'MISSING_CREDENTIAL'
      && error.message.includes('Custom Provider settings page')
      && !error.message.includes('export'),
  )

  // With the service holding the fixed 'omniroute' reference, discovery rides
  // the stored value as the bearer token.
  const ctx2 = new Context()
  await ctx2.plugin(LlmRuntime)
  await ctx2.plugin(FakeCredentials, { omniroute: 'stored-key' })
  await mountPlugin(ctx2)
  const { asked, restore } = stubModelsListing()
  try {
    const found = await ctx2.llm.discoverModels('dsh-llm-omniroute', { provider: 'omniroute' })
    assert.equal(found.length, 3)
  } finally {
    restore()
  }
  assert.equal(asked.auth, 'Bearer stored-key')
}

// ── Block C: the settings schema refuses unserviceable sections ──
{
  // The 0.2.1 settings write path validates the plugin's full Config schema
  // (config-editor.edit → resolveConfig) before persisting, so an
  // unserviceable value must fail schema validation — not merely runtime
  // resolution — to be refused instead of stored.
  const rejectedBase = plugin.Config['~standard'].validate({ baseURL: 'not-a-url' })
  assert.ok(rejectedBase.issues !== undefined, 'a non-URL baseURL must fail schema validation')
  assert.ok(rejectedBase.issues.some(issue => issue.message.includes('baseURL must be an absolute http(s) URL')),
    `the baseURL issue must name the field: ${JSON.stringify(rejectedBase.issues)}`)

  const rejectedProxy = plugin.Config['~standard'].validate({ proxy: { enabled: true, url: 'ftp://x' } })
  assert.ok(rejectedProxy.issues?.some(issue => issue.message.includes('proxy.url must be an http(s) URL')),
    `an enabled proxy with a non-http(s) url must fail schema validation: ${JSON.stringify(rejectedProxy.issues)}`)

  const rejectedPatterns = plugin.Config['~standard'].validate({ modelExcludePatterns: [''] })
  assert.ok(rejectedPatterns.issues?.some(issue => issue.message.includes('modelExcludePatterns entries must be non-empty')),
    `an empty exclude pattern must fail schema validation: ${JSON.stringify(rejectedPatterns.issues)}`)

  // A serviceable value commits and the very next discovery uses it. The
  // Loader commits a volatile-only edit into the running references in
  // place, so this also pins the plugin reading those references per request
  // rather than snapshotting them at apply time.
  const ctx = new Context()
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(FakeCredentials, { omniroute: 'block-c-key' })
  const fiber = await mountPlugin(ctx, { baseURL: 'http://first-gw:9000/v1' })
  const first = stubModelsListing()
  try {
    await ctx.llm.discoverModels('dsh-llm-omniroute', { provider: 'omniroute' })
  } finally {
    first.restore()
  }
  assert.equal(first.asked.url, 'http://first-gw:9000/v1/models')

  const committed = plugin.Config['~standard'].validate({ baseURL: 'http://second-gw:9001/v1' })
  assert.equal(committed.issues, undefined)
  updateVolatile(fiber.config.baseURL, committed.value.baseURL)
  const second = stubModelsListing()
  try {
    await ctx.llm.discoverModels('dsh-llm-omniroute', { provider: 'omniroute' })
  } finally {
    second.restore()
  }
  assert.equal(second.asked.url, 'http://second-gw:9001/v1/models')
}

// ── Block C2: the plugin declares its own settings page (no auto-generated one) ──
{
  /** Minimal settings service: records the presentation policy registrations. */
  class FakeSettings extends Service {
    constructor(ctx) {
      super(ctx, 'settings')
      this.policies = []
    }

    configure(presentation, owner) {
      this.policies.push({ presentation, owner })
      return () => {}
    }
  }

  const ctx = new Context()
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(FakeSettings)
  await mountPlugin(ctx)
  const settings = ctx.get('settings')
  assert.equal(settings.policies.length, 1, 'exactly one presentation policy must be registered')
  assert.equal(settings.policies[0].presentation.auto, false,
    'the plugin ships its own page, so schema-generated pages must be off')
  assert.equal(settings.policies[0].owner.name, 'dsh-llm-omniroute',
    'the policy must name the plugin fiber it belongs to')
}

// ── Block D: discovery ordering, display names, and the models.dev match ──
{
  const ctx = new Context()
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(FakeCredentials, { omniroute: 'key-d' })
  await mountPlugin(ctx)

  // Discovery sorts by id and derives routed display names from the last path segment.
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({
    object: 'list',
    data: [
      { id: 'zhipu/glm-5.3' },
      { id: 'deepseek-chat' },
      { id: 'qwen/qwen-max', name: 'Qwen Max' },
    ],
  }), { status: 200, headers: { 'content-type': 'application/json' } })
  let discovered
  try {
    discovered = await ctx.llm.discoverModels('dsh-llm-omniroute', { provider: 'omniroute' })
  } finally {
    globalThis.fetch = originalFetch
  }
  // `qwen/qwen-max` folds to the native id even though its OWN NAME ends in
  // that token: a gateway suffix and a model named `…-max` are
  // indistinguishable in the listing, and the declared convention wins. The
  // fold is safe because a single advertised level becomes the row's default,
  // which the runtime materializes into the request — so the id actually sent
  // is the advertised `qwen/qwen-max` again.
  assert.deepEqual(discovered.map(m => m.id), ['deepseek-chat', 'qwen/qwen', 'zhipu/glm-5.3'])
  assert.equal(discovered.find(m => m.id === 'zhipu/glm-5.3').name, 'GLM 5.3[zhipu]')
  assert.equal(discovered.find(m => m.id === 'qwen/qwen').name, 'Qwen Max')

  // Name generation from ids: last / segment with the verbatim prefix in
  // brackets, dashes to spaces, first letters capitalized with brand
  // spellings, and a lone trailing letter reads as a size marker.
  const { modelNameFromId } = plugin
  assert.equal(modelNameFromId('deepseek-chat'), 'DeepSeek Chat')
  assert.equal(modelNameFromId('qwen3-32b'), 'Qwen3 32B')
  assert.equal(modelNameFromId('glm-4.5-air'), 'GLM 4.5 Air')
  assert.equal(modelNameFromId('zhipu/glm-4-flash'), 'GLM 4 Flash[zhipu]')
  assert.equal(modelNameFromId('llama-3.1-70b'), 'Llama 3.1 70B')
  assert.equal(modelNameFromId('deepseek-ai/deepseek-v4-flash'), 'DeepSeek V4 Flash[deepseek-ai]')
  assert.equal(modelNameFromId('openai/gpt-4o'), 'GPT 4o[openai]')

  // matchModelsDev: exact keys first; built-in family hints flag the
  // official vendor's entry (glm→zai over zhipuai, claude→anthropic,
  // kimi→moonshotai, mimo→xiaomi), and a NEAR key inside the hinted vendor
  // matches a version the catalog does not carry yet.
  const api = {
    qwen: { models: { 'qwen-max': { limit: { context: 262144, output: 32768 }, reasoning_options: [{ type: 'effort', values: ['low', 'medium', 'high', null] }] } } },
    alibaba: { models: { 'qwen-max': { name: 'Qwen Max (DashScope)', limit: { context: 131072 }, reasoning_options: [{ type: 'toggle' }] } } },
    zai: { models: { 'glm-5': { limit: { context: 200000, output: 131072 } } } },
    zhipuai: { models: { 'glm-5': { limit: { context: 200000, output: 131072 } } } },
    anthropic: { models: { 'claude-sonnet-5': { limit: { context: 200000, output: 64000 } } } },
    moonshotai: { models: { 'kimi-k3': { limit: { context: 256000, output: 65536 } } } },
    xiaomi: { models: { 'mimo-v2.5-pro': { limit: { context: 131072, output: 32768 } } } },
    digitalocean: { models: { 'mimo-v2.5-pro': { limit: { context: 131072, output: 32768 } } } },
    empty: {},
  }
  // qwen-max: the built-in qwen→alibaba hint leads with the official
  // vendor's entry; qwen's own catalog entry follows in exact-key order.
  const qwenMatches = plugin.matchModelsDev(api, 'qwen/qwen-max')
  assert.deepEqual(qwenMatches.map(m => m.provider), ['alibaba', 'qwen'])
  assert.equal(qwenMatches[0].official, true)
  assert.deepEqual(plugin.matchModelsDev(api, 'qwen-max')[1].reasoningEfforts, ['low', 'medium', 'high'])
  // glm-5.3 (not carried): only the hinted vendor's NEAR key (zai glm-5)
  // matches — near-matching stays inside the official vendor by design, so
  // zhipuai's same-id glm-5 is not dragged in as noise.
  const glm = plugin.matchModelsDev(api, 'glm-5.3')
  assert.equal(glm.length, 1)
  assert.equal(glm[0].provider, 'zai')
  assert.equal(glm[0].official, true)
  // claude-* → anthropic; kimi-* → moonshotai; mimo-* → xiaomi (flagged).
  assert.equal(plugin.matchModelsDev(api, 'claude-sonnet-5')[0].provider, 'anthropic')
  assert.equal(plugin.matchModelsDev(api, 'claude-sonnet-5')[0].official, true)
  assert.equal(plugin.matchModelsDev(api, 'kimi-k3')[0].provider, 'moonshotai')
  const mimo = plugin.matchModelsDev(api, 'mimo-v2.5-pro')
  assert.equal(mimo[0].provider, 'xiaomi')
  assert.equal(mimo[0].official, true)
  assert.equal(mimo[1].provider, 'digitalocean')
  // Deployment hints override: an exact-id hint reroutes to another vendor.
  const rerouted = plugin.matchModelsDev(api, 'glm-5.3', { models: { 'glm-5.3': 'zhipuai' } })
  assert.equal(rerouted.length, 1)
  assert.equal(rerouted[0].provider, 'zhipuai')
  assert.equal(rerouted[0].official, true)
  assert.deepEqual(plugin.matchModelsDev(api, 'unknown-model'), [])

  // A catalog row with efforts offers the selector, and an explicit effort
  // rides the wire as reasoning_effort.
  const resolveModelAdapter = new plugin.OmniRouteAdapter({
    options: () => ({
      baseURL: 'http://gw.local:3000/v1',
      apiKeyRef: 'omniroute',
      models: [{ id: 'qwen3-32b', reasoningEfforts: ['low', 'high'] }],
      modelExcludePatterns: [],
      defaultContextWindow: 128_000,
      streamIdleTimeoutMs: 300_000,
      retryPolicy: resolveRetryPolicy(undefined, 'smoke'),
      web: plugin.resolveWebOptions(undefined, 'http://gw.local:3000/v1'),
    }),
    resolveApiKey: async () => 'smoke-key',
  })
  const resolved = await resolveModelAdapter.resolveModel('omniroute', 'qwen3-32b')
  assert.deepEqual(resolved.reasoning?.efforts.map(effort => effort.id), ['low', 'high'])
  // No preset → no default effort: the request leaves reasoning_effort off
  // and the gateway applies the model's own default.
  assert.equal(resolved.reasoning?.defaultEffort, undefined)
  const presetAdapter = new plugin.OmniRouteAdapter({
    options: () => ({
      baseURL: 'http://gw.local:3000/v1',
      apiKeyRef: 'omniroute',
      models: [{ id: 'm1', reasoningEfforts: ['low', 'high'], defaultReasoningEffort: 'low' }],
      modelExcludePatterns: [],
      defaultContextWindow: 128_000,
      streamIdleTimeoutMs: 300_000,
      retryPolicy: resolveRetryPolicy(undefined, 'smoke'),
      web: plugin.resolveWebOptions(undefined, 'http://gw.local:3000/v1'),
    }),
    resolveApiKey: async () => 'smoke-key',
  })
  // A preset inside the declared list is passed through unchanged.
  assert.equal((await presetAdapter.resolveModel('omniroute', 'm1')).reasoning?.defaultEffort, 'low')
  const idBoundAdapter = new plugin.OmniRouteAdapter({
    options: () => ({
      baseURL: 'http://gw.local:3000/v1',
      apiKeyRef: 'omniroute',
      models: [{
        id: 'folded',
        reasoningEfforts: ['low', 'high'],
        effortModels: { low: 'folded-low', high: 'folded-high' },
      }],
      modelExcludePatterns: [],
      defaultContextWindow: 128_000,
      streamIdleTimeoutMs: 300_000,
      retryPolicy: resolveRetryPolicy(undefined, 'smoke'),
      web: plugin.resolveWebOptions(undefined, 'http://gw.local:3000/v1'),
    }),
    resolveApiKey: async () => 'smoke-key',
  })
  // An id-bound row has no routable "no effort" request: the resolved default
  // is the strongest advertised level, and an explicit omission fails loudly
  // before any gateway call instead of sending the bare native id.
  assert.equal((await idBoundAdapter.resolveModel('omniroute', 'folded')).reasoning?.defaultEffort, 'high')
  await assert.rejects(
    (async () => {
      for await (const _chunk of idBoundAdapter.stream({ model: 'folded', messages: [] })) {
        // The guard fires before the wire request.
      }
    })(),
    error => error.code === 'INVALID_REQUEST' && error.message.includes('encodes its thinking level'),
  )
  const wired = plugin.serializeRequest({ model: 'qwen3-32b', messages: [], system: undefined, tools: undefined, reasoningEffort: 'high' })
  assert.equal(wired.reasoning_effort, 'high')
  assert.equal('reasoning_effort' in plugin.serializeRequest({ model: 'qwen3-32b', messages: [] }), false)
}

// ── Block E: the models-dev RPC channel registers once connection starts ──
{
  const ctx = new Context()
  await ctx.plugin(LlmRuntime)
  // The plugin mounts BEFORE the connection service — exactly the ordering
  // that silently skipped the channel when it was read with an eager ctx.get.
  await mountPlugin(ctx)

  const registered = []
  await ctx.plugin(FakeWebServer)
  await ctx.plugin(FakeConnection, registered)

  // The inject scope ran as soon as both services appeared. Loopback-only
  // exposure is the connection service's own fence on the 0.2.1 line:
  // channel registration no longer carries a per-handle authority option.
  assert.equal(registered.length, 1)
  assert.equal(registered[0].channel, '/dsh-llm-omniroute')

  // Unknown endpoints answer the error envelope without any network use.
  const answer = await registered[0].handler('nope', {}, new AbortController().signal)
  assert.equal(answer.ok, false)
  assert.match(answer.error.message, /unknown endpoint nope/)

  // A failing catalog download answers the error envelope too — a thrown
  // handler would surface as an opaque HTTP 500 at the transport.
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => { throw new TypeError('fetch failed', { cause: new Error('connect ENETUNREACH') }) }
  let failure
  try {
    failure = await registered[0].handler('models-dev-params', { modelIds: ['x'] }, new AbortController().signal)
  } finally {
    globalThis.fetch = originalFetch
  }
  assert.equal(failure.ok, false)
  assert.match(failure.error.message, /models\.dev catalog fetch failed/)
  assert.match(failure.error.message, /ENETUNREACH/)
  // The host may already be routing ordinary fetch through its launch
  // environment proxy, so the remedy must not assume a direct route.
  assert.match(failure.error.message, /configure a proxy for this plugin/)
  assert.doesNotMatch(failure.error.message, /direct route/)
}

// ── Block H: registry-official matches lead when no hint applies ──
{
  const ctx = new Context()
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(FakeCredentials, { omniroute: 'key-h' })
  // A built-in-style route that officially serves gwmax-1 — a bare id under
  // no built-in family prefix, so the registry channel (not the hint list)
  // is what can flag it.
  const officialAdapter = new plugin.OmniRouteAdapter({
    options: () => ({
      baseURL: 'http://official.local/v1',
      apiKeyRef: 'omniroute',
      models: [{ id: 'gwmax-1' }],
      modelExcludePatterns: [],
      defaultContextWindow: 128_000,
      streamIdleTimeoutMs: 300_000,
      retryPolicy: resolveRetryPolicy(undefined, 'smoke'),
      web: plugin.resolveWebOptions(undefined, 'http://gw.local:3000/v1'),
    }),
    resolveApiKey: async () => 'unused',
  })
  await ctx.plugin({ inject: ['llm'], apply: (c) => { c.llm.registerAdapter(['zeta'], officialAdapter) } })
  await mountPlugin(ctx)

  const channels = []
  await ctx.plugin(FakeWebServer)
  await ctx.plugin(FakeConnection, channels)

  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({
    alpha: { models: { 'gwmax-1': { limit: { context: 131_072 } } } },
    zeta: { models: { 'gwmax-1': { limit: { context: 262_144, output: 32_768 } } } },
  }), { status: 200, headers: { 'content-type': 'application/json' } })
  let answer
  try {
    answer = await channels[0].handler('models-dev-params', { modelIds: ['gwmax-1'] }, new AbortController().signal)
  } finally {
    globalThis.fetch = originalFetch
  }
  assert.equal(answer.ok, true)
  const [first, second] = answer.value.models[0].matches
  // The registry-official route's provider leads and carries the flag;
  // catalog order (alpha first here) only orders the rest.
  assert.equal(first.provider, 'zeta')
  assert.equal(first.official, true)
  assert.equal(first.contextWindow, 262_144)
  assert.equal(second.provider, 'alpha')
  assert.equal(second.official, undefined)
}

// ── Block F: a dead proxy names the proxy, not the plugin-proxy remedy ──
{
  const adapter = new plugin.OmniRouteAdapter({
    options: () => ({
      baseURL: 'http://gw.local:3000/v1',
      apiKeyRef: 'omniroute',
      models: [],
      modelExcludePatterns: [],
      defaultContextWindow: 128_000,
      streamIdleTimeoutMs: 300_000,
      retryPolicy: resolveRetryPolicy(undefined, 'smoke'),
      web: plugin.resolveWebOptions(undefined, 'http://gw.local:3000/v1'),
    }),
    resolveApiKey: async () => 'smoke-key',
  })
  // Loopback port 1 has no listener: the ProxyAgent connect is refused
  // deterministically without any real network egress.
  await assert.rejects(
    adapter.fetchModelsDevParams(
      { modelIds: ['deepseek-chat'], proxyUrl: 'http://127.0.0.1:1' },
      new AbortController().signal,
    ),
    (error) => error.code === 'TRANSPORT'
      && error.message.includes('models.dev catalog fetch failed')
      && error.message.includes('the proxy at http://127.0.0.1:1 is unreachable')
      && !error.message.includes('configure a proxy for this plugin'),
  )
}

// ── Block G: empty-string / explicit-null tool-call id/name deltas never clobber the call (issue #1) ──
// Two non-conforming continuation shapes are known. The qcplay gateway
// (glm-5.3) repeats `id`/`function.name` as EMPTY strings instead of
// omitting the fields; a presence-only check overwrote the first delta's
// real tool name with '', so every tool call died as `unknown tool`. Some
// upstreams instead send an explicit JSON `null`, which the empty-string
// guard did not catch either: `null !== undefined` is true, so the merge
// reached `null.length` and threw a TypeError that adapter.stream()
// surfaced as TRANSPORT, killing the stream the moment a tool call began.
// Both shapes ride the stream path end to end — adapter.stream → fetch
// stub → parseSse → translate.
{
  const adapter = new plugin.OmniRouteAdapter({
    options: () => ({
      baseURL: 'http://gw.local:3000/v1',
      apiKeyRef: 'omniroute',
      models: [],
      modelExcludePatterns: [],
      defaultContextWindow: 128_000,
      streamIdleTimeoutMs: 300_000,
      retryPolicy: resolveRetryPolicy(undefined, 'smoke'),
      web: plugin.resolveWebOptions(undefined, 'http://gw.local:3000/v1'),
    }),
    resolveApiKey: async () => 'smoke-key',
  })

  // Verbatim issue shapes: real id/name only on the first delta, then empty
  // strings (one delta also repeats an empty id) AND explicit JSON nulls on
  // the continuation deltas. Argument fragments still concatenate into one
  // valid JSON object.
  const deltas = [
    { index: 0, id: 'call_5f62a3f002704343bf16a3d7', type: 'function', function: { name: 'get_time', arguments: '{"' } },
    { index: 0, type: 'function', function: { name: '', arguments: 'tz' } },
    { index: 0, id: null, type: null, function: { name: null, arguments: '":"Asia' } },
    { index: 0, id: '', type: 'function', function: { name: '', arguments: '/Shanghai"}' } },
  ]
  const sse = [
    ...deltas.map(delta => `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [delta] } }] })}\n\n`),
    `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] })}\n\n`,
    'data: [DONE]\n\n',
  ].join('')
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } })
  let chunks
  try {
    chunks = []
    for await (const chunk of adapter.stream({
      model: 'glm-5.3',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'what time is it in Shanghai?' }] }],
    })) chunks.push(chunk)
  } finally {
    globalThis.fetch = originalFetch
  }

  const ended = chunks.filter(chunk => chunk.type === 'block-end')
  assert.equal(ended.length, 1)
  const block = ended[0].block
  assert.equal(block.type, 'tool-call')
  // The first delta's real identity survives both continuation shapes.
  assert.equal(block.id, 'call_5f62a3f002704343bf16a3d7')
  assert.equal(block.name, 'get_time')
  assert.equal(block.arguments, '{"tz":"Asia/Shanghai"}')
  // No emitted delta ever carried the empty name: it would surface in the
  // composer's live tool-call rendering before the block ends.
  for (const chunk of chunks) {
    if (chunk.type === 'tool-call-delta') assert.ok(chunk.name !== '', 'delta name must not degrade to empty')
  }
  assert.equal(chunks.at(-1).reason.kind, 'tool-calls')
}

// ── Block I: the thinking-level rules decide both the catalog and the wire ──
// Three shapes the gateway advertises, all present in the live catalog:
//   * per-level variant ids (`-high`/`-low`) — the level IS the id, so the row
//     folds to the native id and the request sends the variant id back;
//   * a single declared level (`-medium`) — same fold, one selectable level;
//   * a no-thinking route (`no-think/…`) — no levels at all, pinned to `none`;
//   * and an id that encodes no level, whose declared `effort_tiers` are used
//     as-is (fabricated or not, the id offers no better evidence).
{
  const connection = {
    baseURL: 'http://gw.local:3000/v1',
    apiKeyRef: 'omniroute',
    models: [],
    modelExcludePatterns: [],
    defaultContextWindow: 128_000,
    streamIdleTimeoutMs: 300_000,
    retryPolicy: resolveRetryPolicy(undefined, 'smoke'),
    web: plugin.resolveWebOptions(undefined, 'http://gw.local:3000/v1'),
  }
  const adapter = new plugin.OmniRouteAdapter({
    options: () => connection,
    resolveApiKey: async () => 'smoke-key',
  })

  const originalFetch = globalThis.fetch
  const variantTiers = ['none', 'low', 'medium', 'high', 'xhigh', 'max']
  globalThis.fetch = async () => new Response(JSON.stringify({
    object: 'list',
    data: [
      {
        id: 'agy/gemini-3.8-flash-high',
        context_length: 1_048_576,
        max_output_tokens: 65_536,
        input_modalities: ['text', 'image'],
        capabilities: { tool_calling: true, vision: true, effort_tiers: variantTiers },
        name: 'Gemini 3.8 Flash (High)',
      },
      { id: 'agy/gemini-3.8-flash-low', capabilities: { tool_calling: true, effort_tiers: variantTiers } },
      { id: 'agy/gpt-oss-120b-medium', max_output_tokens: 32_768, capabilities: { tool_calling: true, effort_tiers: variantTiers } },
      { id: 'no-think/agy/claude-sonnet-4-6', capabilities: { tool_calling: true, effort_tiers: variantTiers } },
      {
        id: 'command-code/deepseek-v4.1-flash',
        context_length: 1_000_000,
        max_output_tokens: 943_718,
        capabilities: { tool_calling: true, reasoning: true, effort_tiers: ['low', 'medium', 'high', 'xhigh', 'max'] },
      },
      { id: 'sfc/Qwen3-Reranker-8B', type: 'rerank', supported_endpoints: ['rerank'], capabilities: { tool_calling: false } },
    ],
  }), { status: 200, headers: { 'content-type': 'application/json' } })

  let rows
  try {
    rows = (await adapter.fetchCatalog({}, new AbortController().signal)).models
  } finally {
    globalThis.fetch = originalFetch
  }

  assert.deepEqual(rows.map(row => row.id), [
    'agy/gemini-3.8-flash',
    'agy/gpt-oss-120b',
    'command-code/deepseek-v4.1-flash',
    'no-think/agy/claude-sonnet-4-6',
  ])
  const gemini = rows[0]
  // Every advertised level of one native model folds into one row, ranked
  // weakest-first, and the collapsed row is named after the native id rather
  // than after the level that happened to be listed.
  assert.deepEqual(gemini.reasoningEfforts, ['low', 'high'])
  assert.equal(gemini.defaultReasoningEffort, 'high')
  assert.deepEqual(gemini.effortModels, {
    high: 'agy/gemini-3.8-flash-high',
    low: 'agy/gemini-3.8-flash-low',
  })
  assert.equal(gemini.contextWindow, 1_048_576)
  assert.equal(gemini.vision, true)
  assert.equal(gemini.toolCalling, true)
  assert.equal(gemini.name, 'Gemini 3.8 Flash[agy]')
  // One advertised level means the gateway narrowed the route to it.
  assert.deepEqual(rows[1].reasoningEfforts, ['medium'])
  assert.equal(rows[1].defaultReasoningEffort, 'medium')
  assert.equal(rows[1].name, 'GPT Oss 120B[agy]')
  // A no-thinking route offers `none` alone, whatever tiers it also advertises.
  assert.deepEqual(rows[3].reasoningEfforts, ['none'])
  assert.equal(rows[3].defaultReasoningEffort, 'none')
  assert.equal(rows[3].effortModels, undefined)
  // An id that encodes no level keeps the declared tiers verbatim.
  assert.deepEqual(rows[2].reasoningEfforts, ['low', 'medium', 'high', 'xhigh', 'max'])
  assert.equal(rows[2].defaultReasoningEffort, 'max')

  // The adapter also serves the reduced discovery shape, folded the same way.
  globalThis.fetch = async () => new Response(JSON.stringify({
    object: 'list',
    data: [
      { id: 'agy/gemini-3.8-flash-high', capabilities: { effort_tiers: variantTiers } },
      { id: 'agy/gemini-3.8-flash-low', capabilities: { effort_tiers: variantTiers } },
    ],
  }), { status: 200, headers: { 'content-type': 'application/json' } })
  let discovered
  try {
    discovered = await adapter.discoverModels({ provider: 'omniroute' })
  } finally {
    globalThis.fetch = originalFetch
  }
  assert.deepEqual(discovered.map(model => model.id), ['agy/gemini-3.8-flash'])

  // The wire: a selected level that lives in the id replaces the model id and
  // sends no `reasoning_effort`; a level that does not sends it as-is.
  const adopted = new plugin.OmniRouteAdapter({
    options: () => ({ ...connection, models: rows }),
    resolveApiKey: async () => 'smoke-key',
  })
  const sent = []
  globalThis.fetch = async (_url, init) => {
    sent.push(JSON.parse(init.body))
    return new Response('data: [DONE]\n\n', { status: 200, headers: { 'content-type': 'text/event-stream' } })
  }
  try {
    for await (const _chunk of adopted.stream({ model: 'agy/gemini-3.8-flash', reasoningEffort: 'high', messages: [] })) { /* drain */ }
    for await (const _chunk of adopted.stream({ model: 'command-code/deepseek-v4.1-flash', reasoningEffort: 'high', messages: [] })) { /* drain */ }
    for await (const _chunk of adopted.stream({ model: 'no-think/agy/claude-sonnet-4-6', messages: [] })) { /* drain */ }
  } finally {
    globalThis.fetch = originalFetch
  }
  assert.deepEqual(sent[0], { model: 'agy/gemini-3.8-flash-high', messages: [], stream: true, stream_options: { include_usage: true } })
  assert.equal(sent[1].model, 'command-code/deepseek-v4.1-flash')
  assert.equal(sent[1].reasoning_effort, 'high')
  assert.equal(sent[2].model, 'no-think/agy/claude-sonnet-4-6')
}

// ── Block L: group display names compose into every name the route serves ──
// `groupLabels` is display-only, but the display it owns includes the model
// list the picker reads — a label that only tinted the settings page would
// leave the picker showing raw ids. Composition happens per listing, so a
// renamed group reaches the next listing without re-applying the plugin.
{
  const ctx = new Context()
  await ctx.plugin(LlmRuntime)
  const fiber = await mountPlugin(ctx, {
    models: [
      { id: 'agy/claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
      { id: 'command-code/deepseek-v4.1-flash' },
      { id: 'hermes-hindsight' },
    ],
    groupLabels: { agy: 'AGY' },
  })

  const listed = async () => (await ctx.llm.listModels('omniroute'))
    .map(model => `${model.id} → ${model.name}`)
  assert.deepEqual(await listed(), [
    'agy/claude-sonnet-4-6 → [AGY]Claude Sonnet 4.6',
    'command-code/deepseek-v4.1-flash → [command-code]deepseek-v4.1-flash',
    'hermes-hindsight → hermes-hindsight',
  ])
  // The selected model resolves to the same name, so the picker and the
  // conversation header never disagree about what a row is called.
  const resolved = await ctx.llm.resolveModelInfo('omniroute', 'agy/claude-sonnet-4-6')
  assert.equal(resolved.name, '[AGY]Claude Sonnet 4.6')
  // An id the catalog does not carry is still a group member by its own id.
  const uncatalogued = await ctx.llm.resolveModelInfo('omniroute', 'agy/claude-opus-5-5')
  assert.equal(uncatalogued.name, '[AGY]claude-opus-5-5')

  const committed = plugin.Config['~standard'].validate({
    groupLabels: { agy: 'AGY', 'command-code': 'CMD' },
  })
  assert.equal(committed.issues, undefined)
  updateVolatile(fiber.config.groupLabels, committed.value.groupLabels)
  assert.deepEqual(await listed(), [
    'agy/claude-sonnet-4-6 → [AGY]Claude Sonnet 4.6',
    'command-code/deepseek-v4.1-flash → [CMD]deepseek-v4.1-flash',
    'hermes-hindsight → hermes-hindsight',
  ])
}

// ── Block J: the web seam providers map the gateway's search and fetch ──
{
  const webOptions = plugin.resolveWebOptions({ snippetMaxChars: 20, fetchMaxChars: 10 }, 'http://gw.local:3000/v1')
  const hooks = { options: () => webOptions, resolveApiKey: async () => 'smoke-key' }
  const search = new plugin.OmniRouteSearchProvider(hooks)
  const fetcher = new plugin.OmniRouteFetchProvider(hooks)
  assert.equal(search.id, 'omniroute')
  assert.equal(search.available(), true)
  assert.equal(plugin.WEB_PROVIDER_ID, fetcher.id)

  const originalFetch = globalThis.fetch
  const requests = []
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), body: JSON.parse(init.body) })
    if (String(url).endsWith('/search')) {
      return new Response(JSON.stringify({
        provider: 'exa-search',
        results: [
          { title: 'DeepSeek Harness', url: 'https://example.com/a', snippet: 'x'.repeat(50), published_at: '2026-01-01' },
          { url: 'https://example.com/a', snippet: 'duplicate' },
          { snippet: 'no url at all' },
        ],
        answer: { text: 'a generated answer' },
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    return new Response(JSON.stringify({
      provider: 'firecrawl',
      url: 'https://example.com/redirected',
      content: 'y'.repeat(30),
      metadata: { statusCode: 404 },
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  let searchResult, fetchResult
  try {
    searchResult = await search.search({ query: 'DeepSeek Harness' })
    fetchResult = await fetcher.fetch({ url: 'https://example.com' })
  } finally {
    globalThis.fetch = originalFetch
  }

  assert.equal(requests[0].url, 'http://gw.local:3000/v1/search')
  assert.deepEqual(requests[0].body, { query: 'DeepSeek Harness', max_results: 8 })
  // Rows without a URL drop, duplicates collapse by URL, the snippet is clipped
  // to the configured budget, and the provider's answer becomes the content.
  assert.equal(searchResult.sources.length, 1)
  assert.equal(searchResult.sources[0].url, 'https://example.com/a')
  assert.equal(searchResult.sources[0].title, 'DeepSeek Harness')
  assert.equal(searchResult.sources[0].snippet, `${'x'.repeat(20)}…`)
  assert.equal(searchResult.sources[0].publishedAt, '2026-01-01')
  assert.equal(searchResult.content, 'a generated answer')

  assert.equal(requests[1].url, 'http://gw.local:3000/v1/web/fetch')
  assert.deepEqual(requests[1].body, { url: 'https://example.com', format: 'markdown', include_metadata: true })
  // The gateway answers extracted markdown, so the body is text; the page
  // status comes from the provider metadata when it reports one, and an
  // over-budget page is cut with `truncated` set.
  assert.equal(fetchResult.url, 'https://example.com/redirected')
  assert.equal(fetchResult.statusCode, 404)
  assert.deepEqual(fetchResult.body, { kind: 'text', content: 'y'.repeat(10) })
  assert.equal(fetchResult.truncated, true)

  // Each capability has its own switch, and both default to the gateway.
  assert.equal(plugin.resolveWebOptions({ searchEnabled: false }, 'http://gw.local:3000/v1').searchEnabled, false)
  assert.equal(plugin.resolveWebOptions({ searchEnabled: false }, 'http://gw.local:3000/v1').fetchEnabled, true)
  assert.equal(plugin.resolveWebOptions(undefined, 'http://gw.local:3000/v1').searchEnabled, true)
  assert.equal(plugin.resolveWebOptions(undefined, 'http://gw.local:3000/v1').fetchEnabled, true)

  // A gateway failure is a WebError-shaped throw naming the endpoint, never a
  // silent empty result.
  globalThis.fetch = async () => new Response('{"error":{"message":"no provider"}}', { status: 502 })
  let failure
  try {
    await search.search({ query: 'x' })
  } catch (error) {
    failure = error
  } finally {
    globalThis.fetch = originalFetch
  }
  assert.equal(failure?.name, 'WebError')
  assert.equal(failure?.code, 'WEB_PROVIDER_ERROR')
  assert.match(failure.message, /OmniRoute search failed \(HTTP 502\)/)
  assert.match(failure.message, /http:\/\/gw.local:3000\/v1\/search/)
}

// ── Block K: the plugin registers both web providers from its own config ──
// The web seam is optional: when the composition provides it, the plugin
// registers the gateway-backed providers under the id the bundle patch pins;
// when it does not, the chat route is untouched. Both read the connection
// snapshot the chat route resolved, so they cannot drift to another endpoint.
{
  const ctx = new Context()
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(FakeCredentials, { omniroute: 'key-k' })
  await ctx.plugin(FakeWeb)
  await mountPlugin(ctx, { baseURL: 'http://gw.local:3000/v1' })
  const web = ctx.get('web')
  assert.equal(web.searchProviders.length, 1)
  assert.equal(web.fetchProviders.length, 1)
  assert.equal(web.searchProviders[0].id, 'omniroute')
  assert.equal(web.fetchProviders[0].id, 'omniroute')
  // `available()` is the seam's cheap pre-flight, and it runs the plugin's own
  // resolution: the endpoint came from the connection snapshot, not a second
  // config read.
  assert.equal(web.searchProviders[0].available(), true)

  // Both switches off still registers both providers: the seam's configured id
  // has to keep resolving, and each capability then answers from the shipped
  // DeepSeek implementation instead of the gateway.
  const off = new Context()
  await off.plugin(LlmRuntime)
  await off.plugin(FakeCredentials, { omniroute: 'key-k' })
  await off.plugin(FakeWeb)
  await mountPlugin(off, {
    baseURL: 'http://gw.local:3000/v1',
    web: { searchEnabled: false, fetchEnabled: false },
  })
  assert.equal(off.get('web').searchProviders.length, 1)
  assert.equal(off.get('web').fetchProviders.length, 1)
  assert.equal(off.get('web').searchProviders[0].available(), true)

  // A composition with no web seam still mounts the chat route.
  const none = new Context()
  await none.plugin(LlmRuntime)
  await mountPlugin(none)
  assert.deepEqual(none.llm.listProviders().map(provider => provider.id), ['omniroute'])
}

// ── Block K2: a switch off delegates to the shipped DeepSeek providers ──
// The native path is the very implementation dsh ships for these two APIs, so
// the endpoint, the credential reference and the request body are that
// provider's own — not a second implementation this plugin maintains.
{
  const requests = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    requests.push({
      url: String(url),
      body: JSON.parse(String(init?.body ?? '{}')),
      auth: new Headers(init?.headers).get('authorization'),
    })
    return new Response(JSON.stringify({
      results: [{ title: 'Native', url: 'https://example.com/native', snippet: 'native snippet', date: null }],
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const ctx = new Context()
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(FakeCredentials, { omniroute: 'key-k', DEEPSEEK_API_KEY: 'deepseek-key' })
  await ctx.plugin(FakeWeb)
  await mountPlugin(ctx, {
    baseURL: 'http://gw.local:3000/v1',
    web: { searchEnabled: false, fetchEnabled: false },
  })
  const web = ctx.get('web')
  let native
  try {
    native = await web.searchProviders[0].search({ query: 'native query' })
  } finally {
    globalThis.fetch = originalFetch
  }

  assert.equal(requests.length, 1)
  assert.equal(requests[0].url, 'https://api.deepseek.com/v1/tools/search')
  assert.equal(requests[0].auth, 'Bearer deepseek-key')
  assert.deepEqual(requests[0].body, { query: 'native query', count: 10, need_content: false })
  assert.deepEqual(native.sources, [
    { url: 'https://example.com/native', title: 'Native', snippet: 'native snippet' },
  ])
}

// ── Block H (optional): real-catalog check against the local dev cache ──
// .cache/models-dev.api.json (npm run cache:models-dev, gitignored) carries
// the catalog's real field shapes; when present, matchModelsDev is exercised
// against it so schema drift in models.dev surfaces here first. Absent, the
// block skips — CI never has the cache.
{
  const CACHE = new URL('../.cache/models-dev.api.json', import.meta.url)
  if (!existsSync(CACHE)) {
    console.log('smoke: models.dev dev-cache absent — real-catalog check skipped (npm run cache:models-dev to enable)')
  } else {
    const api = JSON.parse(readFileSync(CACHE, 'utf8'))
    const { matchModelsDev } = plugin
    const gpt = matchModelsDev(api, 'openai/gpt-5.1')
    assert.ok(gpt.length >= 1, 'openai/gpt-5.1 matches the cached catalog')
    assert.ok(gpt.some(match => match.reasoningEfforts?.includes('low') && match.reasoningEfforts.includes('high')),
      'effort-shaped reasoning_options surface as reasoningEfforts')
    const chat = matchModelsDev(api, 'deepseek/deepseek-chat')
    assert.equal(chat[0].contextWindow, 1_000_000)
    const air = matchModelsDev(api, 'zhipuai/glm-4.5-air')
    assert.equal(air[0].maxTokens, 98_304)
    console.log('smoke: models.dev dev-cache check OK (real catalog shapes verified)')
  }
}

console.log('smoke: dsh-llm-omniroute registrations, capability mapping, thinking-level rules (no-think / level-carrying ids / declared tiers), web-provider registration, credentials-service key, settings schema validation, volatile-edit propagation, ordering, display names, group display names on every served model name, models.dev matching, deferred RPC channel, dead-proxy diagnostics, web search+fetch mapping, and empty-string tool-call delta hardening OK')
