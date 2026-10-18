/**
 * The `dsh-llm-omniroute` config schema and the volatile references a running
 * config holds.
 *
 * Schemastery resolves here at whatever version the profile installs, and the
 * host packages and this plugin read the same copy: the supported host line
 * depends on `~3.18.5`. A field marked volatile is parsed into a stable,
 * updatable reference instead of a plain value, which is what lets the Loader
 * commit a settings edit without re-applying the plugin. The marker lives in
 * `meta.volatile` — exactly what `Schema.prototype.volatile()` writes.
 *
 * Every generation of a config is built through this schema, and each
 * generation's fields are fresh references carrying that generation's values:
 * the Loader commits a volatile-only edit by updating the running references
 * in place from the new generation.
 *
 * The plugin is the schema's own transform (`dsh.Config`, `schema: true`):
 * the Loader validates through `~standard` (which cascades every field check
 * and bound) and calls it to build the config object. {@link Config} is that
 * call with the defaults applied, which is also how the settings write point
 * and the composition smoke build one.
 *
 * @module dsh-llm-omniroute/config
 */

import type { Volatile } from '@deepseek-ai/cordis'
import { createVolatile } from '@deepseek-ai/cosmokit'
import { resolveRetryPolicy, RetryPolicySchema } from '@deepseek-ai/dsh-llm'
import type { RetryPolicyConfig } from '@deepseek-ai/dsh-llm'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'
import z from '@deepseek-ai/schemastery'
import {
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_MODEL_EXCLUDE_PATTERNS,
  DEFAULT_PROXY_URL,
  DEFAULT_STREAM_IDLE_TIMEOUT_MS,
  normalizeBaseUrl,
  PKG,
} from './adapter.ts'
import type { OmniRouteCatalogModel } from './adapter.ts'
import type { ProviderHints } from './types.ts'
import {
  DEFAULT_FETCH_MAX_CHARS,
  DEFAULT_SNIPPET_MAX_CHARS,
  DEFAULT_WEB_MAX_RESULTS,
  DEFAULT_WEB_TIMEOUT_MS,
} from './web.ts'
import type { OmniRouteWebConfig, OmniRouteWebOptions } from './web.ts'

/**
 * Plugin config values, validated by the same-named schemastery schema and
 * doubling as the `dsh-llm-omniroute` settings-section shape. Every field is
 * optional in yml: `baseURL` falls back to $OMNIROUTE_BASE_URL from a trusted
 * environment layer, then the placeholder {@link DEFAULT_BASE_URL} — a
 * request against the placeholder fails as TRANSPORT at first use, naming the
 * endpoint to fix. The API key is not a config value at all: it lives in the
 * credentials store under the fixed reference `omniroute` (the web settings
 * page writes it), and a request without any stored key fails with
 * `MISSING_CREDENTIAL`, not at plugin load.
 *
 * This is the plain-value shape a composition entry or programmatic caller
 * writes; the running plugin reads the schema-derived {@link Config} whose
 * volatile fields are references (see {@link snapshotConfig}).
 */
export interface OmniRouteConfig {
  /** Gateway base including the `/v1` prefix; defaults to $OMNIROUTE_BASE_URL from a trusted layer, then the placeholder `https://omniroute.example.com/v1`. */
  baseURL?: string
  /** Advisory models shown by discovery consumers; defaults to none — a gateway's model set is deployment-specific. */
  models?: OmniRouteCatalogModel[]
  /**
   * Case-insensitive id substrings excluding discovered models that cannot
   * serve chat completions (embedding, rerank, ranker families). Replaces the
   * default {@link DEFAULT_MODEL_EXCLUDE_PATTERNS} list; an empty array
   * disables filtering. The hand-curated {@link models} catalog is unaffected.
   */
  modelExcludePatterns?: string[]
  /** Positive context capacity used when the selected model has no exact value (default 128,000). */
  defaultContextWindow?: number
  /** Default per-request output cap; omission sends no cap and lets each upstream default apply. */
  maxTokens?: number
  /** Maximum gateway idle time while one stream read is outstanding (default five minutes). */
  streamIdleTimeoutMs?: number
  /** Forward proxy for the models.dev catalog download performed by the「更新模型信息」action. */
  proxy?: ProxyConfig
  /**
   * Match-shaping hints for the models.dev params lookup: family prefixes
   * and exact ids name which catalog provider counts as official (leading
   * match, flagged). Built-in families (glm→zai, gpt→openai, claude→
   * anthropic, …) apply first; these entries override and extend them.
   */
  providerHints?: ProviderHints
  /**
   * Display-only labels for the model-list groups. A group is the first
   * `/`-delimited segment of a model id (a gateway route that names its own
   * upstream). Storage keeps the raw group name as the key, so renaming a
   * group never touches routing, matching, or what a request sends; the label
   * composes into every model name the route serves (`./group.ts`), which is
   * what the settings page rows and the model picker both show.
   */
  groupLabels?: Record<string, string>
  /** Provider-owned model-request retry policy; omission uses normal defaults. */
  retryPolicy?: RetryPolicyConfig
  /** Gateway-backed `web_search` / `web_fetch` providers for the `ctx.web` seam. */
  web?: OmniRouteWebConfig
}

/**
 * Forward-proxy settings for the models.dev catalog download.
 */
export interface ProxyConfig {
  /** Whether the proxy is used; defaults to false. */
  enabled?: boolean
  /** Proxy URL; presets default to `http://127.0.0.1:7890`. */
  url?: string
}

/**
 * The config a running plugin instance holds: every field is a stable
 * reference, updated in place by the Loader. Read plain values through
 * {@link snapshotConfig}.
 */
export interface Config {
  baseURL: Volatile<string>
  models: Volatile<OmniRouteCatalogModel[]>
  modelExcludePatterns: Volatile<string[]>
  defaultContextWindow: Volatile<number>
  maxTokens: Volatile<number>
  streamIdleTimeoutMs: Volatile<number>
  proxy: Volatile<ProxyConfig>
  providerHints: Volatile<ProviderHints>
  groupLabels: Volatile<Record<string, string>>
  retryPolicy: Volatile<RetryPolicyConfig>
  web: Volatile<OmniRouteWebConfig>
}

/**
 * The catalogue entry schema of `models`; the same entry checks the resolver
 * re-judges at runtime.
 */
const catalogModel = (): z<OmniRouteCatalogModel> => z.object({
  id: z.string().required(),
  name: z.string(),
  description: z.string(),
  contextWindow: z.number().step(1).min(1),
  maxTokens: z.number().step(1).min(1),
  vision: z.boolean(),
  toolCalling: z.boolean(),
  reasoningEfforts: z.array(z.string()),
  defaultReasoningEffort: z.string(),
  effortModels: z.object({}),
})

/**
 * The `dsh.config` schema transform of a plugin entry. The host advertises the
 * shape as an object with a `Config` function and marks it `schema: true`;
 * whether registered as `Config` or as the plugin's own `dsh` field, the
 * entry's transform consumes the validated values and resolves them into the
 * running references.
 */
export interface SchemaTransform {
  readonly schema: true
  readonly Config: (config: OmniRouteConfig | null | undefined) => Config
  readonly '~standard': {
    readonly version: 1
    readonly vendor: string
    validate(config: unknown): { value: Config } | { issues: { message: string; path: string[] }[] }
  }
}

/**
 * Report a resolver error as a schema issue. The settings write point
 * validates the full Config through this schema before persisting, so an
 * unserviceable value has to fail here to be refused instead of stored.
 * Schemastery calls a transform callback with the value only, so the issue
 * carries no path; every message below already names its field.
 * @param error - the resolver error, whose message already names its field.
 * @returns a ValidationError carrying that message.
 */
function asValidationError(error: unknown): Error {
  return new z.ValidationError(error instanceof Error ? error.message : String(error), { path: [] })
}

/**
 * One config field: `build` is the field schema factory, `resolve` validates
 * a caller's value and applies the resolver, and `default` is the value when
 * nothing names one. The field schema is built inside the plugin entry rather
 * than at module scope, because the schema constructor's presence is part of
 * the host surface contract.
 */
interface ConfigField {
  build: () => z
  resolve: (value: unknown) => unknown
  default: unknown
}

const fields = {
  baseURL: {
    build: () => z.string(),
    resolve: (value) => resolveBaseURL(value),
    default: undefined,
  },
  models: {
    build: () => z.array(catalogModel()),
    resolve: (value) => resolveModels(value as OmniRouteCatalogModel[] | undefined),
    default: [],
  },
  modelExcludePatterns: {
    build: () => z.array(z.string()),
    resolve: (value) => resolveExcludePatterns(value as string[] | undefined),
    default: [...DEFAULT_MODEL_EXCLUDE_PATTERNS],
  },
  defaultContextWindow: {
    build: () => z.number().step(1).min(1),
    resolve: (value) => resolveContextWindow(value),
    default: DEFAULT_CONTEXT_WINDOW,
  },
  maxTokens: {
    build: () => z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER),
    resolve: (value) => resolveMaxTokens(value),
    default: undefined,
  },
  streamIdleTimeoutMs: {
    build: () => z.number().min(Number.MIN_VALUE).max(MAX_TIMER_DELAY_MS),
    resolve: (value) => resolveStreamIdleTimeout(value),
    default: DEFAULT_STREAM_IDLE_TIMEOUT_MS,
  },
  proxy: {
    build: () => z.object({
      enabled: z.boolean().default(false),
      url: z.string().default(DEFAULT_PROXY_URL),
    }),
    resolve: (value) => resolveProxy(value as ProxyConfig | undefined),
    default: { enabled: false, url: DEFAULT_PROXY_URL },
  },
  // Arbitrary-key maps are declared as dicts, never as empty object schemas:
  // the settings plane projects a form field key by key, so `z.object({})`
  // would read every stored entry back as `{}` and a saved edit would look
  // like it never happened.
  providerHints: {
    build: () => z.object({
      defaults: z.dict(z.string()).default({}),
      models: z.dict(z.string()).default({}),
    }),
    resolve: (value) => resolveProviderHints(value as ProviderHints | undefined),
    default: { defaults: {}, models: {} },
  },
  groupLabels: {
    build: () => z.dict(z.string()).default({}),
    resolve: (value) => resolveGroupLabels(value as Record<string, string> | undefined),
    default: {},
  },
  retryPolicy: {
    build: () => RetryPolicySchema,
    resolve: (value) => resolvePolicy(value as RetryPolicyConfig | undefined),
    default: undefined,
  },
  web: {
    build: () => z.object({
      searchEnabled: z.boolean().default(true),
      fetchEnabled: z.boolean().default(true),
      searchProvider: z.string().default(''),
      maxResults: z.number().step(1).min(1).max(100).default(DEFAULT_WEB_MAX_RESULTS),
      snippetMaxChars: z.number().step(1).min(1).default(DEFAULT_SNIPPET_MAX_CHARS),
      fetchProvider: z.string().default(''),
      fetchFormat: z.union([z.const('markdown'), z.const('html'), z.const('links'), z.const('screenshot')]),
      fetchMaxChars: z.number().step(1).min(1).default(DEFAULT_FETCH_MAX_CHARS),
      timeoutMs: z.number().min(Number.MIN_VALUE).max(MAX_TIMER_DELAY_MS).default(DEFAULT_WEB_TIMEOUT_MS),
    }),
    resolve: (value) => resolveWebSettings(value as OmniRouteWebConfig | undefined),
    default: undefined,
  },
} satisfies Record<keyof Config, ConfigField>

/**
 * The settings-plane schema: every field the plugin configures, by the field
 * shape a form is projected from. The volatile marker sits on each field here,
 * matching what `Schema.prototype.volatile()` writes.
 *
 * Each field schema is rebuilt from a flat copy of what its factory returned,
 * so the marker lands on an instance this plugin owns: a factory may hand back
 * a schema the host publishes (`RetryPolicySchema`), and writing `meta` on that
 * shared instance would change what every other plugin reads.
 * @returns the schema the settings service reads the form fields from.
 */
function settingsSchema(): z {
  return z.object(Object.fromEntries(
    Object.entries(fields).map(([key, field]) => {
      const marked = z({ ...field.build() as z })
      marked.meta = { ...marked.meta, volatile: true, default: field.default }
      return [key, marked]
    }),
  ))
}

/** A blank base URL is "not configured" rather than an error; a typed value must already be usable. */
function resolveBaseURL(value: unknown): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string') throw asValidationError(new Error(`${PKG}: baseURL must be a string`))
  if (value.trim().length === 0) return undefined
  try {
    normalizeBaseUrl(value)
  } catch (error) {
    throw asValidationError(error)
  }
  return value
}

function resolveExcludePatterns(value: string[] | undefined): string[] {
  const patterns = value ?? [...DEFAULT_MODEL_EXCLUDE_PATTERNS]
  for (const pattern of patterns) {
    if (pattern.length === 0) {
      throw asValidationError(new Error(`${PKG}: modelExcludePatterns entries must be non-empty`))
    }
  }
  return [...patterns]
}

function resolveContextWindow(value: unknown): number {
  if (value === undefined) return DEFAULT_CONTEXT_WINDOW
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw asValidationError(new Error(`${PKG}: defaultContextWindow must be a positive integer`))
  }
  return value as number
}

function resolveMaxTokens(value: unknown): number | undefined {
  if (value === undefined) return undefined
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw asValidationError(new Error(`${PKG}: maxTokens must be a positive safe integer`))
  }
  return value as number
}

function resolveStreamIdleTimeout(value: unknown): number {
  if (value === undefined) return DEFAULT_STREAM_IDLE_TIMEOUT_MS
  if (!Number.isFinite(value) || (value as number) <= 0 || (value as number) > MAX_TIMER_DELAY_MS) {
    throw asValidationError(new Error(
      `${PKG}: streamIdleTimeoutMs must be a positive finite number no greater than ${MAX_TIMER_DELAY_MS}`,
    ))
  }
  return value as number
}

/**
 * The models.dev download proxy; the URL is judged only while the proxy is
 * enabled, so a stored disabled proxy with a stale URL never fails the whole
 * section.
 */
function resolveProxy(value: ProxyConfig | undefined): ProxyConfig {
  const enabled = value?.enabled === true
  const url = typeof value?.url === 'string' ? value.url : DEFAULT_PROXY_URL
  if (enabled) {
    let protocol: string | undefined
    try {
      protocol = new URL(url).protocol
    } catch {
      protocol = undefined
    }
    if (protocol === undefined) {
      throw asValidationError(new Error(`${PKG}: proxy.url must be an absolute URL (got: ${url})`))
    }
    if (!/^https?:$/.test(protocol)) {
      throw asValidationError(new Error(`${PKG}: proxy.url must be an http(s) URL (got: ${url})`))
    }
  }
  return { enabled, url }
}

function resolveProviderHints(value: ProviderHints | undefined): ProviderHints {
  return {
    defaults: { ...value?.defaults },
    models: { ...value?.models },
  }
}

function resolveGroupLabels(value: Record<string, string> | undefined): Record<string, string> {
  return { ...value }
}

/**
 * Validate one provider retry policy. The host resolver owns the rules
 * (unknown keys, non-negative integers, non-empty codes); the field keeps the
 * plain value so the adapter resolves it once more at registration.
 * @param value - the plain policy, or `undefined` for the host defaults.
 * @returns the validated plain policy.
 */
export function resolvePolicy(value: RetryPolicyConfig | undefined): RetryPolicyConfig | undefined {
  if (value === undefined) return undefined
  try {
    resolveRetryPolicy(value, `${PKG}: retryPolicy`)
  } catch (error) {
    throw asValidationError(error)
  }
  return value
}

/**
 * Resolve, validate, and detach the advisory model catalog.
 * @param models - the catalog rows a composition entry or the settings plane wrote.
 * @returns the rows with every optional field detached from the caller's objects.
 */
export function resolveModels(models: readonly OmniRouteCatalogModel[] | undefined): OmniRouteCatalogModel[] {
  const seen = new Set<string>()
  return (models ?? []).map((model) => {
    if (model.id.length === 0) throw new Error(`${PKG}: catalog model ids must be non-empty`)
    if (model.name !== undefined && model.name.length === 0) {
      throw new Error(`${PKG}: catalog model "${model.id}" has an empty name`)
    }
    if (model.contextWindow !== undefined
      && (!Number.isInteger(model.contextWindow) || model.contextWindow <= 0)) {
      throw new Error(
        `${PKG}: catalog model "${model.id}" contextWindow must be a positive integer`,
      )
    }
    if (model.maxTokens !== undefined
      && (!Number.isInteger(model.maxTokens) || model.maxTokens <= 0)) {
      throw new Error(
        `${PKG}: catalog model "${model.id}" maxTokens must be a positive integer`,
      )
    }
    if (seen.has(model.id)) throw new Error(`${PKG}: duplicate catalog model "${model.id}"`)
    seen.add(model.id)
    for (const effort of model.reasoningEfforts ?? []) {
      if (effort.length === 0) throw new Error(`${PKG}: catalog model "${model.id}" has an empty reasoning effort`)
    }
    if (model.defaultReasoningEffort !== undefined
      && !(model.reasoningEfforts ?? []).includes(model.defaultReasoningEffort)) {
      throw new Error(
        `${PKG}: catalog model "${model.id}" default reasoning effort "${model.defaultReasoningEffort}" is not among its reasoning efforts`,
      )
    }
    // The level → model-id map is only meaningful for a level the row
    // declares: an entry outside the list could never be selected, and an
    // empty model id would send a nameless request.
    for (const [effort, wireModel] of Object.entries(model.effortModels ?? {})) {
      if (wireModel.length === 0) {
        throw new Error(`${PKG}: catalog model "${model.id}" maps effort "${effort}" to an empty model id`)
      }
      if (!(model.reasoningEfforts ?? []).includes(effort)) {
        throw new Error(
          `${PKG}: catalog model "${model.id}" maps effort "${effort}" but does not declare it`,
        )
      }
    }
    return {
      id: model.id,
      ...model.name === undefined ? {} : { name: model.name },
      ...model.description === undefined ? {} : { description: model.description },
      ...model.contextWindow === undefined ? {} : { contextWindow: model.contextWindow },
      ...model.maxTokens === undefined ? {} : { maxTokens: model.maxTokens },
      ...model.vision === undefined ? {} : { vision: model.vision },
      ...model.toolCalling === undefined ? {} : { toolCalling: model.toolCalling },
      ...model.reasoningEfforts === undefined || model.reasoningEfforts.length === 0
        ? {}
        : { reasoningEfforts: [...model.reasoningEfforts] },
      ...model.defaultReasoningEffort === undefined ? {} : { defaultReasoningEffort: model.defaultReasoningEffort },
      ...model.effortModels === undefined || Object.keys(model.effortModels).length === 0
        ? {}
        : { effortModels: { ...model.effortModels } },
    }
  })
}

/**
 * Validate the web block on its own. The endpoint is not part of it: the web
 * providers send to the same gateway base the connection snapshot resolved, so
 * one configured URL can never drift between the chat and web halves.
 * @param config - the plain web block, or `undefined` for the defaults.
 * @returns the resolved web knobs, without the endpoint.
 */
export function resolveWebSettings(
  config: OmniRouteWebConfig | undefined,
): Omit<OmniRouteWebOptions, 'baseURL'> {
  const raw = config ?? {}
  const maxResults = raw.maxResults ?? DEFAULT_WEB_MAX_RESULTS
  if (!Number.isInteger(maxResults) || maxResults <= 0 || maxResults > 100) {
    throw new Error(`${PKG}: web.maxResults must be an integer between 1 and 100`)
  }
  const snippetMaxChars = raw.snippetMaxChars ?? DEFAULT_SNIPPET_MAX_CHARS
  if (!Number.isInteger(snippetMaxChars) || snippetMaxChars <= 0) {
    throw new Error(`${PKG}: web.snippetMaxChars must be a positive integer`)
  }
  const fetchMaxChars = raw.fetchMaxChars ?? DEFAULT_FETCH_MAX_CHARS
  if (!Number.isInteger(fetchMaxChars) || fetchMaxChars <= 0) {
    throw new Error(`${PKG}: web.fetchMaxChars must be a positive integer`)
  }
  const timeoutMs = raw.timeoutMs ?? DEFAULT_WEB_TIMEOUT_MS
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > MAX_TIMER_DELAY_MS) {
    throw new Error(
      `${PKG}: web.timeoutMs must be a positive finite number no greater than ${MAX_TIMER_DELAY_MS}`,
    )
  }
  const fetchFormat = raw.fetchFormat ?? 'markdown'
  if (!['markdown', 'html', 'links', 'screenshot'].includes(fetchFormat)) {
    throw new Error(`${PKG}: web.fetchFormat must be markdown, html, links or screenshot (got: ${fetchFormat})`)
  }
  return {
    searchEnabled: raw.searchEnabled !== false,
    fetchEnabled: raw.fetchEnabled !== false,
    searchProvider: (raw.searchProvider ?? '').trim(),
    maxResults,
    snippetMaxChars,
    fetchProvider: (raw.fetchProvider ?? '').trim(),
    fetchFormat,
    fetchMaxChars,
    timeoutMs,
  }
}

/**
 * The web-provider options for one operation: the validated web block over the
 * endpoint the connection snapshot resolved.
 * @param config - the plain web block.
 * @param baseURL - the resolved gateway base (no trailing slash).
 * @returns the options both web providers read.
 */
export function resolveWebOptions(config: OmniRouteWebConfig | undefined, baseURL: string): OmniRouteWebOptions {
  return { baseURL, ...resolveWebSettings(config) }
}

/**
 * Read the current plain values from the running config's volatile
 * references. The references are updated in place on a volatile-only commit,
 * so this always returns the latest committed generation without re-applying
 * the plugin.
 * @param config - the config object this plugin instance was applied with.
 * @returns the plain values the resolver consumes.
 */
export function snapshotConfig(config: Config): OmniRouteConfig {
  const fields = config as unknown as Record<string, Volatile<unknown>>
  const baseURL = read<string>(fields, 'baseURL')
  const models = read<OmniRouteCatalogModel[]>(fields, 'models')
  const modelExcludePatterns = read<string[]>(fields, 'modelExcludePatterns')
  const maxTokens = read<number>(fields, 'maxTokens')
  const providerHints = read<ProviderHints>(fields, 'providerHints')
  const groupLabels = read<Record<string, string>>(fields, 'groupLabels')
  const retryPolicy = read<RetryPolicyConfig>(fields, 'retryPolicy')
  const web = read<OmniRouteWebConfig>(fields, 'web')
  return {
    ...baseURL === undefined ? {} : { baseURL },
    models: models === undefined ? [] : [...models],
    modelExcludePatterns:
      modelExcludePatterns === undefined ? [...DEFAULT_MODEL_EXCLUDE_PATTERNS] : [...modelExcludePatterns],
    defaultContextWindow: read<number>(fields, 'defaultContextWindow') ?? DEFAULT_CONTEXT_WINDOW,
    ...maxTokens === undefined ? {} : { maxTokens },
    streamIdleTimeoutMs: read<number>(fields, 'streamIdleTimeoutMs') ?? DEFAULT_STREAM_IDLE_TIMEOUT_MS,
    proxy: read<ProxyConfig>(fields, 'proxy') ?? { enabled: false, url: DEFAULT_PROXY_URL },
    ...providerHints === undefined ? {} : { providerHints },
    ...groupLabels === undefined ? {} : { groupLabels },
    ...retryPolicy === undefined ? {} : { retryPolicy },
    ...web === undefined ? {} : { web },
  }
}

/**
 * Read one field's current value.
 * @param fields - the running config read as its references.
 * @param key - the field name.
 * @returns the plain current value, possibly absent.
 */
function read<T>(fields: Record<string, Volatile<unknown>>, key: string): T | undefined {
  const reference = fields[key]
  if (reference === undefined) return undefined
  // A parsed config holds one reference per volatile field; anything else means
  // the config passed in never went through this schema.
  if (typeof reference?.get !== 'function') {
    throw new TypeError(`${PKG}: config field "${key}" is not a volatile reference`)
  }
  return reference.get() as T | undefined
}

/**
 * The resolved value of one field, or `undefined` when nothing names one.
 * @param key - the field name.
 * @param value - the plain value a composition entry or a caller wrote.
 * @returns the resolved value.
 */
function resolveField(key: keyof Config, value: unknown): unknown {
  const field = fields[key] as ConfigField
  return field.resolve(value === undefined ? field.default : value)
}

/**
 * Validate and normalize a whole plain config through the per-field
 * resolvers, without touching the running references. This is the one
 * authority on what a config value may be: the settings schema validates
 * through it, and the adapter resolves its request facts from its output.
 * @param config - the values a composition entry, a caller, or the settings
 * plane wrote.
 * @returns the resolved plain config; an absent field stays absent.
 */
export function resolveConfigValues(config?: OmniRouteConfig | null): OmniRouteConfig {
  const raw = (config ?? {}) as Record<string, unknown>
  const result: Record<string, unknown> = {}
  for (const key of Object.keys(fields) as (keyof Config)[]) {
    const value = resolveField(key, raw[key])
    if (value !== undefined) result[key] = value
  }
  return result as OmniRouteConfig
}

/**
 * Build a running config: every field becomes its own reference, resolved and
 * detached from the caller's objects. A field that resolves to `undefined` is
 * absent from the result.
 *
 * Each call creates fresh references on purpose. The Loader commits a
 * volatile-only edit by reading the new generation through this schema and
 * updating the running references in place, which only works while a new
 * generation's references still carry the new values.
 * @param config - the values a composition entry or a caller wrote.
 * @returns the config whose fields are the running references.
 */
function buildConfig(config?: OmniRouteConfig | null): Config {
  const raw = (config ?? {}) as Record<string, unknown>
  const result: Record<string, unknown> = {}
  for (const key of Object.keys(fields) as (keyof Config)[]) {
    const value = resolveField(key, raw[key])
    if (value === undefined) continue
    result[key] = createVolatile(value)
  }
  return result as unknown as Config
}

/**
 * The plugin config schema. Every field is volatile: the Loader commits a
 * volatile-only edit into the running config references without re-applying
 * the plugin, so the next resolution sees it. Field-level checks live in the
 * same resolvers the adapter reads through, and `~standard.validate` runs them
 * over a whole config: the settings write point validates this exact schema
 * before persisting, and the proxy validates a plugin row before the Loader
 * ever builds it.
 *
 * One value carries all three faces the host reads. `~standard.validate` is the
 * validation entry — cordis resolves the config through it and hands the result
 * to `apply`, so it returns the running references, never plain values. The
 * callable function itself is the transform the Loader uses to build a config
 * from an already-validated row (`Config(raw)`). Its prototype is the per-field
 * form schema the settings plane projects a page from.
 * @param config - plain values written by a composition entry or a caller.
 * @returns the config whose fields are the running references.
 */
export const Config: SchemaTransform & ((config?: OmniRouteConfig | null) => Config) = Object.setPrototypeOf(
  Object.assign(
    (config?: OmniRouteConfig | null): Config => buildConfig(config),
    {
      schema: true as const,
      Config: (config: OmniRouteConfig | null | undefined): Config => buildConfig(config),
      '~standard': {
        version: 1 as const,
        vendor: 'schemastery',
        validate(config: unknown): { value: Config } | { issues: { message: string; path: string[] }[] } {
          try {
            if (config !== null && config !== undefined && (typeof config !== 'object' || Array.isArray(config))) {
              throw asValidationError(new Error(`${PKG}: config must be an object`))
            }
            return { value: buildConfig(config as OmniRouteConfig | undefined) }
          } catch (error) {
            if (z.ValidationError.is(error)) {
              return { issues: [{ message: (error as Error).message, path: [] }] }
            }
            throw error
          }
        },
      },
    },
  ),
  settingsSchema(),
)
