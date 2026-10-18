/**
 * Register a {@link OmniRouteAdapter} for the `omniroute` provider route on
 * `ctx.llm`, with connection facts resolved per request instead of frozen at
 * load: the plugin reads its own volatile config references (the profile
 * patch and the web settings page write them through the settings service)
 * and resolves the API key through the optional credential seam
 * (`ctx.credentials`), so a changed base URL, catalog, or key reaches the
 * very next request without re-applying the plugin, while an in-flight stream
 * keeps the facts it started with. The one registration-captured fact — the
 * retry policy — re-registers the route in place when it changes. The plugin
 * also serves model discovery for the `dsh-llm-omniroute` settings namespace by
 * interrogating `GET {baseURL}/models`, and — once a composition provides the
 * web seam — registers the gateway's own retrieval stack as the `omniroute`
 * search and fetch providers.
 * @module dsh-llm-omniroute
 */

import type { Context } from '@deepseek-ai/cordis'
import { assertUsableApiKey, LlmError, resolveRetryPolicy } from '@deepseek-ai/dsh-llm'
import type { AdapterRegistrationHandle } from '@deepseek-ai/dsh-llm'
import llmManifest from '@deepseek-ai/dsh-llm/package.json' with { type: 'json' }
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
// Type-only: pulls the cordis Context merge that adds the `settings`
// service (ctx.settings.configure) into this program.
import type {} from '@deepseek-ai/dsh-settings'
// Type-only: pulls the cordis Context merge that adds the `web` service
// (ctx.web.registerSearchProvider / registerFetchProvider).
import type {} from '@deepseek-ai/dsh-web'
import {
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_MODEL_EXCLUDE_PATTERNS,
  DEFAULT_PROXY_URL,
  DEFAULT_STREAM_IDLE_TIMEOUT_MS,
  OmniRouteAdapter,
  normalizeBaseUrl,
  PKG,
} from './adapter.ts'
import type { OmniRouteCatalogModel, OmniRouteConnectionOptions } from './adapter.ts'
import { resolveConfigValues, resolvePolicy, resolveWebOptions, snapshotConfig } from './config.ts'
import type { Config, OmniRouteConfig, ProxyConfig } from './config.ts'
import {
  DEFAULT_FETCH_MAX_CHARS,
  DEFAULT_SNIPPET_MAX_CHARS,
  DEFAULT_WEB_MAX_RESULTS,
  DEFAULT_WEB_TIMEOUT_MS,
  OmniRouteFetchProvider,
  OmniRouteSearchProvider,
} from './web.ts'
import type { OmniRouteWebConfig, OmniRouteWebOptions, WebFetchFormat } from './web.ts'
import type { CatalogRequest, ModelsDevParamsRequest, ProviderHints } from './types.ts'
import type { HostConnectionHandle } from '@deepseek-ai/dsh-client-connection'

export {
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_MODEL_EXCLUDE_PATTERNS,
  DEFAULT_PROVIDER_HINTS,
  DEFAULT_STREAM_IDLE_TIMEOUT_MS,
  matchModelsDev,
  modelNameFromId,
  OmniRouteAdapter,
  normalizeBaseUrl,
  PKG,
} from './adapter.ts'
export { parseOmniRouteCatalog, resolveWireModel } from './catalog.ts'
export { serializeRequest } from './serialize.ts'
export {
  DEFAULT_FETCH_MAX_CHARS,
  DEFAULT_SNIPPET_MAX_CHARS,
  DEFAULT_WEB_MAX_RESULTS,
  DEFAULT_WEB_TIMEOUT_MS,
  OmniRouteFetchProvider,
  OmniRouteSearchProvider,
  WEB_PROVIDER_ID,
  mapSearchResponse,
} from './web.ts'
export type { OmniRouteWebOptions, WebFetchFormat, WebRuntimeHooks, OmniRouteWebConfig } from './web.ts'
export type { OmniRouteAdapterOptions, OmniRouteCatalogModel, OmniRouteConnectionOptions } from './adapter.ts'
export type { OmniRouteConfig, ProxyConfig } from './config.ts'
export type * from './types.ts'

const MINIMUM_DSH_VERSION = '0.2.1-rc.2'

type SemverIdentifier = number | string
interface ParsedSemver {
  core: [number, number, number]
  prerelease?: SemverIdentifier[]
}

function parseSemver(version: string): ParsedSemver | undefined {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u.exec(version)
  if (match === null) return undefined
  const major = Number(match[1])
  const minor = Number(match[2])
  const patch = Number(match[3])
  const prerelease = match[4]?.split('.').map(part => /^\d+$/u.test(part) ? Number(part) : part)
  return prerelease === undefined ? { core: [major, minor, patch] } : { core: [major, minor, patch], prerelease }
}

function compareSemver(left: ParsedSemver, right: ParsedSemver): number {
  const [leftMajor, leftMinor, leftPatch] = left.core
  const [rightMajor, rightMinor, rightPatch] = right.core
  for (const difference of [leftMajor - rightMajor, leftMinor - rightMinor, leftPatch - rightPatch]) {
    if (difference !== 0) return difference
  }
  if (left.prerelease === undefined) return right.prerelease === undefined ? 0 : 1
  if (right.prerelease === undefined) return -1
  const length = Math.max(left.prerelease.length, right.prerelease.length)
  for (let index = 0; index < length; index += 1) {
    const leftPart = left.prerelease[index]
    const rightPart = right.prerelease[index]
    if (leftPart === undefined) return rightPart === undefined ? 0 : -1
    if (rightPart === undefined) return 1
    if (leftPart === rightPart) continue
    if (typeof leftPart === 'number' && typeof rightPart === 'number') return leftPart - rightPart
    if (typeof leftPart === 'number') return -1
    if (typeof rightPart === 'number') return 1
    return leftPart < rightPart ? -1 : 1
  }
  return 0
}

function isSupportedHostVersion(version: string): boolean {
  const actual = parseSemver(version)
  const minimum = parseSemver(MINIMUM_DSH_VERSION)
  return actual !== undefined && minimum !== undefined && compareSemver(actual, minimum) >= 0
}

const hostLlmVersion = typeof llmManifest.version === 'string' ? llmManifest.version : 'unknown'
if (!isSupportedHostVersion(hostLlmVersion)) {
  throw new Error(
    `dsh-llm-omniroute requires dsh >= ${MINIMUM_DSH_VERSION} ` +
    `(host ships @deepseek-ai/dsh-llm ${hostLlmVersion}); ` +
    `upgrade the host: npm install -g @deepseek-ai/dsh@${MINIMUM_DSH_VERSION}`,
  )
}

/** Compare JSON-compatible values structurally without requiring a new host package. */
function deepEqualJson(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (typeof left !== 'object' || typeof right !== 'object' || left === null || right === null) return false
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false
    return left.every((entry, index) => deepEqualJson(entry, right[index]))
  }
  const leftRecord = left as Record<string, unknown>
  const rightRecord = right as Record<string, unknown>
  const keys = Object.keys(leftRecord)
  if (keys.length !== Object.keys(rightRecord).length) return false
  return keys.every(key => key in rightRecord && deepEqualJson(leftRecord[key], rightRecord[key]))
}

export const name = 'dsh-llm-omniroute'
export const inject = ['llm']

const NS = 'dsh-llm-omniroute'
/**
 * Fixed credential reference for the gateway API key. Deliberately not an
 * environment-variable-style name: the inherited process environment is the
 * credentials service's read-only top layer, so an `OMNIROUTE_API_KEY`-style
 * ref would let a stray exported variable shadow the web-stored key and lock
 * the settings input read-only. `omniroute` names the route, and the web
 * settings page is the one configuration surface for the value.
 */
const API_KEY_REF = 'omniroute'
/**
 * Credential reference the native DeepSeek web path resolves, and the provider
 * route whose sessions may authenticate with an account token instead — both
 * are the shipped defaults of `@deepseek-ai/dsh-web-deepseek-api`.
 */
const DEEPSEEK_API_KEY_REF = credentialRef('DEEPSEEK_API_KEY')
const DEEPSEEK_ACCOUNT_PROVIDER = 'deepseek-account'
/** Environment variable naming this provider's endpoint, honored only from trusted layers. */
const BASE_URL_ENV = 'OMNIROUTE_BASE_URL'
/** Default gateway base: OmniRoute's own default port on loopback, used when neither config nor environment names one. */
export const DEFAULT_BASE_URL = 'http://127.0.0.1:20128/v1'
/** The single provider route this plugin owns. */
const PROVIDER = 'omniroute'

/**
 * The session facts the native DeepSeek web path reads: which route the session
 * runs on, and the prompts it derived. Structural on purpose — `ctx.get('agents')`
 * is untyped here, and the plugin must not depend on the session package.
 */
interface WebSession {
  deriveMessages(): ReadonlyArray<{
    role: string
    source: { kind: string }
    content: ReadonlyArray<{ type: string; text?: string | undefined }>
  }>
  requestContext(): { provider?: string | undefined } | undefined
}

/**
 * The question that triggered the current turn, in the shape the shipped
 * DeepSeek Search API path sends as `ori_question`: the last user-sourced
 * prompt, its text blocks joined by newlines.
 * @param session - the initiating session, when the search runs inside one.
 * @returns the prompt text, or `undefined` when there is no user prompt.
 */
function latestUserQuestion(session: WebSession | undefined): string | undefined {
  const prompt = session?.deriveMessages()
    .findLast(message => message.role === 'user' && message.source.kind === 'user')
  if (prompt === undefined) return undefined
  return prompt.content
    .flatMap(block => block.type === 'text' && typeof block.text === 'string' ? [block.text] : [])
    .join('\n')
}

export { Config, resolveWebOptions, resolveWebSettings } from './config.ts'

/**
 * One resolution's complete request facts. Connection and credential facts
 * are one value on purpose: a snapshot the resolver rejects keeps the whole
 * previous generation, so a request can never pair a stale endpoint with a
 * newer key.
 */
export type ResolvedOmniRouteOptions = OmniRouteConnectionOptions

export function apply(ctx: Context, config: Config): void {
  let lastRaw: OmniRouteConfig | undefined
  let lastGood: ResolvedOmniRouteOptions | undefined
  let registration: AdapterRegistrationHandle | undefined
  let registeredPolicy: ResolvedOmniRouteOptions['retryPolicy'] | undefined
  const options = (): ResolvedOmniRouteOptions => {
    // Volatile references are updated in place, so every read re-snapshots;
    // the deep compare keeps one resolution per unchanged generation.
    const raw = snapshotConfig(config)
    if (lastGood !== undefined && deepEqualJson(raw, lastRaw)) return lastGood
    try {
      const next = resolveAdapterOptions(raw, launchEnvironmentOf(ctx))
      lastRaw = raw
      lastGood = next
      // The registry captures the retry policy at registration, so it is the
      // one fact per-request resolution cannot refresh. `replace` re-reads it
      // in one synchronous registry section: disposing and re-registering
      // instead would publish an empty route set between the two, and an
      // observer that reacted to it would see this provider disappear and
      // come back.
      if (registration !== undefined && !deepEqualJson(next.retryPolicy, registeredPolicy)) {
        registration.replace([PROVIDER])
        registeredPolicy = next.retryPolicy
      }
      return next
    } catch (error) {
      // The schema refuses unserviceable values at the write point, so this
      // branch only sees a generation that bypassed it (programmatic config,
      // an invalid environment-supplied baseURL): keep serving the last good
      // facts and say so once per bad generation.
      if (lastGood === undefined) throw error
      lastRaw = raw
      ctx.logger.error(`${PKG}: keeping the last good configuration after an invalid configuration generation`)
      ctx.logger.error(error)
      return lastGood
    }
  }
  options()

  const resolveApiKey = async (connection: ResolvedOmniRouteOptions): Promise<string> => {
    // Every credential fact comes from the caller's snapshot, so a rejected
    // settings generation cannot leak its key onto the previous endpoint.
    // The credentials store is the only source: the web settings page owns
    // the value, and this plugin deliberately reads no environment variable
    // for it (a stray export must not shadow a web-configured key).
    const ref = connection.apiKeyRef
    const credentials = ctx.get('credentials')
    if (credentials !== undefined) {
      const hit = await credentials.resolve(ref)
      if (hit !== undefined) return assertUsableApiKey(hit.value, PKG, ref)
    }
    throw new LlmError(
      `${PKG}: no API key for provider route "${PROVIDER}"; configure it on the Custom Provider`
        + ` settings page in dsh web (credentials reference "${ref}")`,
      'MISSING_CREDENTIAL',
    )
  }

  /**
   * The web providers read the same snapshot the chat route does, so a
   * configuration change reaches the next search, fetch, or chat alike, and a
   * generation that fails validation keeps serving the last good generation.
   *
   * `options()` caches the generation it resolved, and the key is taken from
   * that very snapshot — a search can no more pair one generation's endpoint
   * with another generation's secret than a chat request can.
   */
  let webSnapshot: ResolvedOmniRouteOptions | undefined
  const webHooks = {
    options: () => {
      webSnapshot = options()
      return webSnapshot.web
    },
    resolveApiKey: () => resolveApiKey(webSnapshot ?? options()),
    // The native path's credential: an absent one is not raised here, because
    // the shipped implementation names the missing credential and its settings
    // page itself. Only the resolved value travels.
    resolveDeepSeekApiKey: async (): Promise<string | undefined> => {
      const credentials = ctx.get('credentials')
      if (credentials === undefined) return undefined
      const hit = await credentials.resolve(DEEPSEEK_API_KEY_REF)
      return hit === undefined ? undefined : hit.value
    },
    // Account authentication applies exactly where the shipped provider applies
    // it: the session that triggered the operation runs on the DeepSeek account
    // route, and the account service can mint a token for that endpoint.
    resolveAccountToken: async (endpoint: string): Promise<string | undefined> => {
      const session = (ctx.get('agents') as { currentInitiator?: () => { session?: WebSession } | undefined } | undefined)
        ?.currentInitiator?.()?.session
      if (session?.requestContext()?.provider !== DEEPSEEK_ACCOUNT_PROVIDER) return undefined
      const account = ctx.get('deepseekAccount') as { resolveToken(endpoint: string): Promise<string | undefined> } | undefined
      return account === undefined ? undefined : account.resolveToken(endpoint)
    },
    originalQuestion: (): string | undefined => {
      const session = (ctx.get('agents') as { currentInitiator?: () => { session?: WebSession } | undefined } | undefined)
        ?.currentInitiator?.()?.session
      return latestUserQuestion(session)
    },
  }

  // Official-vendor index for the models.dev params panel: model id → the
  // provider route that serves it officially, read from every OTHER route
  // registered on ctx.llm (the built-in catalogs are the authority — e.g.
  // deepseek-v4-flash under the deepseek route). Rebuilt when the set of
  // routes changes; a route that fails to list models is no authority.
  let indexCache: { routes: string; byModel: Map<string, string> } | undefined
  const officialProviderOf = async (modelId: string): Promise<string | undefined> => {
    const routes = ctx.llm.listProviders().map(provider => provider.id).sort().join(',')
    if (indexCache === undefined || indexCache.routes !== routes) {
      const byModel = new Map<string, string>()
      for (const provider of ctx.llm.listProviders()) {
        if (provider.id === PROVIDER) continue
        try {
          for (const model of await ctx.llm.listModels(provider.id)) {
            byModel.set(model.id, provider.id)
          }
        } catch {
          // An unlistable route contributes nothing; other routes still can.
        }
      }
      indexCache = { routes, byModel }
    }
    return indexCache.byModel.get(modelId)
  }

  const adapter = new OmniRouteAdapter({ options, resolveApiKey, officialProviderOf })
  ctx.llm.registerConfigurableProviders([
    {
      provider: PROVIDER,
      displayName: 'Custom Provider',
      settingsNs: NS,
      settingsPath: [],
      // The endpoint facts this route advertises to the configurable-provider
      // directory: the same default and trusted environment variable the
      // resolver below uses. The route still declares itself configured-only,
      // because the adapter knows it only because configuration declared it.
      defaultBaseURL: DEFAULT_BASE_URL,
      baseURLEnv: [BASE_URL_ENV],
      declared: true,
    },
  ])
  // Route effects bind to this apply fiber via the stable `ctx` reference.
  registration = ctx.llm.registerAdapter([PROVIDER], adapter)
  registeredPolicy = options().retryPolicy
  // Model discovery for the settings namespace this plugin owns: the Models
  // page interrogates the gateway's /models with the draft's endpoint and
  // one-shot credential, or the current snapshot's facts. The runtime hands
  // caller cancellation as a separate signal.
  ctx.llm.registerModelDiscovery(NS, (request, signal) => adapter.discoverModels(request, signal))

  // Host-side endpoint for the「更新模型信息」action: the browser names
  // the gateway model ids (and optionally the proxy draft) and the host
  // downloads https://models.dev/api.json — no cross-origin fetch happens in
  // the browser, and a plain HTTP forward proxy works because Node performs
  // the request.
  //
  // The channel goes through the connection service's own `register(owner,
  // channel, handler)` rather than the `rpc.handle(channel, handler)` the
  // type advertises. On the 0.2.1 host line `handle` is still unusable: its
  // `rpc` getter captures `this.ctx`, and that captured context is the
  // connection service's own scope, which has no `webServer` injected.
  // `register` then evaluates `owner.webServer.register(route)`, cordis
  // answers `cannot get property "webServer" without inject`, and the throw is
  // swallowed by the effect — so the channel silently never appears and the
  // browser meets the SPA fallback's 405 (the boot check catches exactly
  // this). Passing our own inject-scope context as the owner fixes it, and
  // `register` is the very method `rpc.handle` delegates to. No upstream
  // plugin calls `rpc.handle`; `dsh-api-gateway` injects this same
  // `connection` + `webServer` pair for the work that does touch `webServer`.
  //
  // Both services are injected so registration waits for each to exist and
  // re-runs if either reloads.
  ctx.inject(['connection', 'webServer'], (cctx) => {
    const connection = cctx.get('connection') as HostConnectionHandle
    // The owner-taking overload is on the service prototype but not on
    // `HostConnectionHandle`, so the extra shape is declared here. The
    // fourth argument is the admitted Peer the carrier now supplies; this
    // channel answers the browser's own requests and does not branch on it.
    const registrar = connection as unknown as {
      register(
        owner: unknown,
        channel: string,
        handler: (endpoint: string, payload: unknown, signal: AbortSignal, peer: unknown) => Promise<unknown>,
      ): () => Promise<void>
    }
    cctx.effect(() => registrar.register(
      cctx,
      '/dsh-llm-omniroute',
      (endpoint: string, payload: unknown, signal: AbortSignal) => {
        // Failures answer as the error envelope, never a thrown value: the
        // transport maps a thrown handler to an opaque HTTP 500, which hides
        // the actual reason (unreachable endpoint, dead proxy) from the
        // settings page that asked.
        const answer = (promise: Promise<unknown>) => promise
          .then(value => ({ ok: true as const, value }))
          .catch((error: unknown) => ({
            ok: false as const,
            error: {
              code: 'internal' as const,
              message: error instanceof Error ? error.message : String(error),
              details: {},
            },
          }))
        if (endpoint === 'models-dev-params') {
          return answer(adapter.fetchModelsDevParams(payload as ModelsDevParamsRequest, signal))
        }
        if (endpoint === 'catalog') {
          // The settings page's model fetch: the gateway's own listing, parsed
          // into the rows an adoption persists (capacities, capabilities,
          // thinking levels and the level → model-id map).
          return answer(adapter.fetchCatalog(payload as CatalogRequest, signal))
        }
        return Promise.resolve({
          ok: false as const,
          error: { code: 'internal' as const, message: `dsh-llm-omniroute: unknown endpoint ${endpoint}`, details: {} },
        })
      },
    ), 'dsh-llm-omniroute: host RPC channel')
  })

  // The gateway's own retrieval stack, wired into the web seam under the id
  // this plugin's bundle patch pins `web.searchProvider` / `fetchProvider` to.
  // Both providers stay registered while a capability switch is off: the pinned
  // id must keep resolving, and the provider then hands that capability to the
  // shipped DeepSeek implementation, so `web_search` / `web_fetch` behave as
  // they do without this plugin. Injected, not required: a composition without
  // `ctx.web` (a headless preset, or a profile that ships no web tooling) keeps
  // the chat route and never registers these — and a composition that gains the
  // seam later still gets them, because cordis runs the scope when the service
  // appears.
  ctx.inject(['web'], (webCtx) => {
    const web = webCtx.web
    const search = new OmniRouteSearchProvider(webHooks)
    const fetch_ = new OmniRouteFetchProvider(webHooks)
    webCtx.effect(() => {
      const disposeSearch = web.registerSearchProvider(search)
      const disposeFetch = web.registerFetchProvider(fetch_)
      return () => {
        disposeSearch()
        disposeFetch()
      }
    }, 'dsh-llm-omniroute: web search and fetch providers')
  })

  // Settings presentation policy (0.2.1 seam): configuration projects from
  // this plugin's own profile entry, whose Config schema marks every field
  // volatile — the Loader commits a volatile-only edit into the running
  // references, and the write point validates the full Config before
  // persisting. This plugin ships its own Web page (the browser half registers
  // the `settings.section`), so it opts out of schema-generated pages; the
  // child names this plugin's fiber, and a late-loading or replaced Settings
  // service picks the policy up.
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.effect(() => settingsCtx.settings.configure({ auto: false }, ctx.fiber))
  })
}
/**
 * The one explicit resolve step from raw config to validated connection facts.
 *
 * Every field of the plain config is first run through its owning resolver in
 * `./config.ts` — the same resolvers the settings schema applies at the write
 * point — so a value a programmatic caller writes is judged exactly like one
 * the settings page saves (fail loud, with the message naming the field).
 * The resolver then turns that normalized block into the request-time facts.
 * @param config - plain plugin config values (a composition entry, or a
 * {@link snapshotConfig} of the running volatile references).
 * @param environment - this run's environment layers, or `undefined` outside
 * the product CLI. A trusted layer may supply the gateway endpoint.
 * @returns validated connection facts plus the credential reference.
 */
export function resolveAdapterOptions(config: OmniRouteConfig, environment?: ReturnType<typeof launchEnvironmentOf>): ResolvedOmniRouteOptions {
  const normalized = resolveConfigValues(config)
  // Absent everywhere is the placeholder, not a load failure: the plugin stays
  // mountable so configuration surfaces can offer the route, and a request
  // against the placeholder fails as TRANSPORT at first use, naming the
  // endpoint to fix. A value someone actually typed must still be a usable
  // http(s) URL, which normalizeBaseUrl enforces here.
  const named = normalized.baseURL !== undefined
    ? normalized.baseURL
    : environment?.get(BASE_URL_ENV)?.value
  const rawBase = named !== undefined && named.trim().length > 0 ? named : DEFAULT_BASE_URL
  const baseURL = normalizeBaseUrl(rawBase)
  const proxy = normalized.proxy ?? { enabled: false, url: DEFAULT_PROXY_URL }
  return {
    baseURL,
    // Resolved here, not per web call: the endpoint and the key must come from
    // ONE configuration generation, and an invalid generation must keep serving
    // the last good one exactly as the chat route does.
    web: resolveWebOptions(normalized.web, baseURL),
    apiKeyRef: credentialRef(API_KEY_REF),
    models: normalized.models ?? [],
    modelExcludePatterns: normalized.modelExcludePatterns ?? [...DEFAULT_MODEL_EXCLUDE_PATTERNS],
    defaultContextWindow: normalized.defaultContextWindow ?? DEFAULT_CONTEXT_WINDOW,
    streamIdleTimeoutMs: normalized.streamIdleTimeoutMs ?? DEFAULT_STREAM_IDLE_TIMEOUT_MS,
    ...proxy.enabled === true ? { proxyUrl: proxy.url ?? DEFAULT_PROXY_URL } : {},
    providerHints: {
      defaults: { ...normalized.providerHints?.defaults },
      models: { ...normalized.providerHints?.models },
    },
    groupLabels: { ...normalized.groupLabels },
    retryPolicy: resolveRetryPolicy(resolvePolicy(normalized.retryPolicy), `${PKG}: retryPolicy`),
    ...normalized.maxTokens === undefined ? {} : { maxTokens: normalized.maxTokens },
  }
}
