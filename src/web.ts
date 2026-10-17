/**
 * OmniRoute-backed providers for the harness web seam (`ctx.web`).
 *
 * The gateway owns a complete retrieval stack — search provider registry,
 * fetch provider registry, keys, quotas, health-based failover, statistics —
 * behind two REST endpoints, `POST {baseURL}/search` and
 * `POST {baseURL}/web/fetch`. This module is the adapter that maps them onto
 * the seam's search and fetch vocabulary, so the model-facing `web_search` and
 * `web_fetch` tools reach the gateway instead of the shipped DeepSeek provider
 * (`deepseek-official`, which speaks Anthropic Messages and needs a DeepSeek
 * credential) or the local anonymous fetcher.
 *
 * Nothing here imports `@deepseek-ai/dsh-web` at runtime: the seam service
 * arrives through `ctx.web`, whose declaration merge is type-only, and the two
 * error objects are built locally in the shape the seam's consumers read
 * (`name: 'WebError'` plus a machine-routable `code`). That keeps the plugin
 * loadable in a composition that has no web seam at all.
 *
 * @module dsh-omniroute/web
 */

import type { WebFetchBody, WebFetchRequest, WebFetchResult, WebSearchRequest, WebSearchResult, WebSearchSource } from '@deepseek-ai/dsh-web'
import type { WireFetchResponse, WireSearchResponse } from './types.ts'

/** Provider id registered for both capabilities; pin it with `web.searchProvider` / `web.fetchProvider`. */
export const WEB_PROVIDER_ID = 'omniroute'

/** Gateway search path, appended to the configured base. */
export const SEARCH_PATH = '/search'

/** Gateway fetch path, appended to the configured base. */
export const FETCH_PATH = '/web/fetch'

/** How many sources to ask OmniRoute for when the caller sets no bound. */
export const DEFAULT_WEB_MAX_RESULTS = 8

/** Per-source snippet budget. Gateway snippets are whole extracted passages; unclipped they flood the context. */
export const DEFAULT_SNIPPET_MAX_CHARS = 600

/** Decoded-body budget for one fetched page, mirroring `dsh-web-fetch-http`'s default. */
export const DEFAULT_FETCH_MAX_CHARS = 100_000

/** One-operation budget shared by both endpoints. */
export const DEFAULT_WEB_TIMEOUT_MS = 30_000

/** Extraction formats `POST /web/fetch` accepts. */
export type WebFetchFormat = 'markdown' | 'html' | 'links' | 'screenshot'

/** The resolved web-side configuration of one operation. */
export interface OmniRouteWebOptions {
  /** Gateway base, normalized (no trailing slash). Paths are appended to it. */
  baseURL: string
  /** Whether the providers register at all. */
  enabled: boolean
  /** Pin one gateway search provider id; empty lets the gateway route. */
  searchProvider: string
  /** Sources requested when the caller sets no bound. */
  maxResults: number
  /** Per-source snippet character budget. */
  snippetMaxChars: number
  /** Pin one gateway fetch provider id; empty lets the gateway route. */
  fetchProvider: string
  /** Extraction format requested from the gateway. */
  fetchFormat: WebFetchFormat
  /** Decoded-body character budget for one fetch. */
  fetchMaxChars: number
  /** One-operation budget for either endpoint. */
  timeoutMs: number
}

/**
 * Build a `WebError`-shaped failure without importing `@deepseek-ai/dsh-web`:
 * consumers read `name` and `code`, which is exactly what the seam's own error
 * class carries.
 * @param message - model-visible, actionable text.
 * @param code - an open-string seam code (`WEB_PROVIDER_ERROR`, `WEB_ABORTED`, …).
 * @param cause - the underlying failure, when there is one.
 * @returns the error to throw.
 */
function webError(message: string, code: string, cause?: unknown): Error {
  const error = new Error(message, cause === undefined ? undefined : { cause })
  error.name = 'WebError'
  ;(error as Error & { code: string }).code = code
  return error
}

/** True for a fetch/`AbortSignal` abort, surfaced as `WEB_ABORTED`. */
function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

/**
 * Whether the caller cancelled. A helper rather than an inline optional-chain
 * comparison because TypeScript narrows `signal.aborted` after the pre-flight
 * guard below, which would make every later check look like dead code.
 * @param signal - the caller's signal, when one was supplied.
 * @returns true when it has already aborted.
 */
function callerAborted(signal: AbortSignal | undefined): boolean {
  return signal !== undefined && signal.aborted
}

/** A short, sanitized detail line from a failed gateway response. */
async function errorDetail(response: Response): Promise<string> {
  try {
    const text = (await response.text()).replace(/\s+/gu, ' ').trim()
    return text.length > 0 ? `: ${text.slice(0, 300)}` : ''
  } catch {
    return ''
  }
}

/** The per-operation facts both providers read. */
export interface WebRuntimeHooks {
  /** Current web configuration; read once per operation. */
  options: () => OmniRouteWebOptions
  /** Resolve the gateway bearer token for this operation. */
  resolveApiKey: () => Promise<string>
}

/** Shared transport for the two gateway endpoints. */
abstract class OmniRouteWebProvider {
  readonly id = WEB_PROVIDER_ID

  constructor(protected readonly hooks: WebRuntimeHooks) {}

  /** Cheap local usability check; makes no network call. */
  available(): boolean {
    const options = this.hooks.options()
    return options.enabled && URL.canParse(options.baseURL) && options.timeoutMs > 0
  }

  /**
   * POST one JSON body to a gateway web endpoint and decode the answer.
   * @param path - the endpoint path appended to the configured base.
   * @param body - the request body.
   * @param signal - caller cancellation.
   * @param label - human-readable capability name for diagnostics.
   * @returns the decoded JSON body.
   */
  protected async post(
    path: string,
    body: Record<string, unknown>,
    signal: AbortSignal | undefined,
    label: string,
  ): Promise<Record<string, unknown>> {
    const options = this.hooks.options()
    const endpoint = `${options.baseURL}${path}`
    if (callerAborted(signal)) throw webError(`OmniRoute ${label} aborted`, 'WEB_ABORTED')
    const apiKey = await this.hooks.resolveApiKey()
    const timeout = AbortSignal.timeout(options.timeoutMs)
    const combined = signal === undefined ? timeout : AbortSignal.any([signal, timeout])

    let response: Response
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        redirect: 'error',
        headers: {
          'content-type': 'application/json',
          'accept': 'application/json',
          ...apiKey.length > 0 ? { 'authorization': `Bearer ${apiKey}` } : {},
        },
        body: JSON.stringify(body),
        signal: combined,
      })
    } catch (error: unknown) {
      if (callerAborted(signal) || isAbortError(error)) {
        throw webError(`OmniRoute ${label} aborted`, 'WEB_ABORTED', error)
      }
      throw webError(
        `OmniRoute ${label} request failed: ${String(error)}. The request used endpoint ${JSON.stringify(endpoint)}; check that the OmniRoute gateway is running and reachable.`,
        'WEB_PROVIDER_ERROR',
        error,
      )
    }

    if (!response.ok) {
      throw webError(
        `OmniRoute ${label} failed (HTTP ${response.status})${await errorDetail(response)}. The request used endpoint ${JSON.stringify(endpoint)}; fix the gateway side or this plugin's gateway settings (the web endpoints are separate from chat).`,
        'WEB_PROVIDER_ERROR',
      )
    }

    try {
      return await response.json() as Record<string, unknown>
    } catch (error: unknown) {
      if (callerAborted(signal) || isAbortError(error)) {
        throw webError(`OmniRoute ${label} aborted`, 'WEB_ABORTED', error)
      }
      throw webError(`OmniRoute returned an unprocessable ${label} body: ${String(error)}`, 'WEB_PROVIDER_ERROR', error)
    }
  }
}

/**
 * Search over `POST {baseURL}/search`.
 *
 * The endpoint answers one gateway-chosen provider per call
 * (`{ provider, query, results[], answer, errors[] }`); `results[]` maps onto
 * the seam's `sources[]` and `answer.text` (when present) onto `content`.
 */
export class OmniRouteSearchProvider extends OmniRouteWebProvider {
  constructor(hooks: WebRuntimeHooks) {
    super(hooks)
  }

  /**
   * Run one search through the gateway.
   * @param request - the query and optional result bound.
   * @param signal - caller cancellation.
   * @returns normalized sources, snippets already clipped.
   */
  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    const options = this.hooks.options()
    const maxResults = request.maxResults ?? options.maxResults
    const body: Record<string, unknown> = { query: request.query, max_results: maxResults }
    if (options.searchProvider.length > 0) body.provider = options.searchProvider
    const payload = await this.post(SEARCH_PATH, body, signal, 'search') as unknown as WireSearchResponse
    return mapSearchResponse(payload, options.snippetMaxChars)
  }
}

/**
 * Retrieval over `POST {baseURL}/web/fetch`.
 *
 * The gateway answers extracted content (markdown by default), not the origin
 * response, so the seam's `statusCode` is the extraction outcome: 200 when the
 * gateway produced content, or the page status the provider reported in its
 * metadata when it reports one. A gateway failure throws, exactly like an
 * unreachable origin.
 */
export class OmniRouteFetchProvider extends OmniRouteWebProvider {
  constructor(hooks: WebRuntimeHooks) {
    super(hooks)
  }

  /**
   * Retrieve one URL through the gateway.
   * @param request - the URL to retrieve.
   * @param signal - caller cancellation.
   * @returns the extracted body plus the extraction status.
   */
  async fetch(request: WebFetchRequest, signal?: AbortSignal): Promise<WebFetchResult> {
    const options = this.hooks.options()
    const body: Record<string, unknown> = { url: request.url, format: options.fetchFormat, include_metadata: true }
    if (options.fetchProvider.length > 0) body.provider = options.fetchProvider
    const payload = await this.post(FETCH_PATH, body, signal, 'web fetch') as unknown as WireFetchResponse
    const content = typeof payload.content === 'string' ? payload.content : ''
    const capped = content.length > options.fetchMaxChars
      ? content.slice(0, options.fetchMaxChars)
      : content
    const decoded: WebFetchBody = { kind: 'text', content: capped }
    return {
      url: typeof payload.url === 'string' && payload.url.length > 0 ? payload.url : request.url,
      statusCode: metadataStatus(payload.metadata) ?? 200,
      body: decoded,
      truncated: capped.length !== content.length,
    }
  }
}

/** A page status the gateway's provider reported in its metadata, when it did. */
function metadataStatus(metadata: WireFetchResponse['metadata']): number | undefined {
  if (metadata === null || metadata === undefined) return undefined
  for (const key of ['statusCode', 'status_code', 'status'] as const) {
    const value = metadata[key]
    if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 100 && value <= 599) {
      return value
    }
  }
  return undefined
}

/**
 * Map the gateway's search envelope onto the seam's result vocabulary. Unusable
 * rows (no URL) are dropped and duplicates collapse by URL, first occurrence
 * winning.
 *
 * The gateway's `snippet` is a long extracted excerpt (a single search can
 * return hundreds of KB), so each one is clipped to `snippetMaxChars`: the
 * model only needs enough to judge relevance, and the full page is one
 * `web_fetch` away.
 *
 * @param payload - the decoded `/search` body.
 * @param snippetMaxChars - per-source snippet character budget.
 * @returns the seam result.
 */
export function mapSearchResponse(
  payload: WireSearchResponse,
  snippetMaxChars: number = DEFAULT_SNIPPET_MAX_CHARS,
): WebSearchResult {
  const rows = Array.isArray(payload.results) ? payload.results : []
  const seen = new Set<string>()
  const sources: WebSearchSource[] = []
  for (const row of rows) {
    if (row === null || typeof row !== 'object') continue
    const url = typeof row.url === 'string' ? row.url : ''
    if (url.length === 0 || seen.has(url)) continue
    seen.add(url)
    const title = typeof row.title === 'string' ? row.title.trim() : ''
    const rawSnippet = typeof row.snippet === 'string' ? row.snippet.replace(/\s+/gu, ' ').trim() : ''
    const snippet = rawSnippet.length > snippetMaxChars
      ? `${rawSnippet.slice(0, snippetMaxChars)}…`
      : rawSnippet
    const publishedAt = typeof row.published_at === 'string' ? row.published_at : ''
    sources.push({
      url,
      ...title.length > 0 ? { title } : {},
      ...snippet.length > 0 ? { snippet } : {},
      ...publishedAt.length > 0 ? { publishedAt } : {},
    })
  }
  const answer = typeof payload.answer?.text === 'string' ? payload.answer.text.trim() : ''
  return {
    ...answer.length > 0 ? { content: answer } : {},
    sources,
    truncated: false,
  }
}
