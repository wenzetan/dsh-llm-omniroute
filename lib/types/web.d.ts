/**
 * OmniRoute-backed providers for the harness web seam (`ctx.web`).
 *
 * The gateway owns a complete retrieval stack — search provider registry,
 * fetch provider registry, keys, quotas, health-based failover, statistics —
 * behind two REST endpoints, `POST {baseURL}/search` and
 * `POST {baseURL}/web/fetch`. This module is the adapter that maps them onto
 * the seam's search and fetch vocabulary.
 *
 * Each capability has its own switch. With the switch on, the request reaches
 * the gateway. With it off, the provider delegates to the very implementation
 * dsh ships for that capability (`@deepseek-ai/dsh-web-deepseek-api`), so
 * `web_search` / `web_fetch` behave as they do in a composition without this
 * plugin — same endpoint, same parameters, same diagnostics. The delegation is
 * why both switches can be off while this plugin still owns the seam's
 * configured provider id.
 *
 * Nothing here imports `@deepseek-ai/dsh-web` at runtime: the seam service
 * arrives through `ctx.web`, whose declaration merge is type-only, and the two
 * error objects are built locally in the shape the seam's consumers read
 * (`name: 'WebError'` plus a machine-routable `code`). That keeps the plugin
 * loadable in a composition that has no web seam at all. The DeepSeek
 * implementation is loaded on first use for the same reason: a composition
 * without the native web rows must still load this plugin.
 *
 * @module dsh-llm-omniroute/web
 */
import type { WebFetchRequest, WebFetchResult, WebSearchRequest, WebSearchResult } from '@deepseek-ai/dsh-web';
import type { WireSearchResponse } from './types.js';
/** Provider id registered for both capabilities; pin it with `web.searchProvider` / `web.fetchProvider`. */
export declare const WEB_PROVIDER_ID = "omniroute";
/** Gateway search path, appended to the configured base. */
export declare const SEARCH_PATH = "/search";
/** Gateway fetch path, appended to the configured base. */
export declare const FETCH_PATH = "/web/fetch";
/** How many sources to ask OmniRoute for when the caller sets no bound. */
export declare const DEFAULT_WEB_MAX_RESULTS = 8;
/** Per-source snippet budget. Gateway snippets are whole extracted passages; unclipped they flood the context. */
export declare const DEFAULT_SNIPPET_MAX_CHARS = 600;
/** Decoded-body budget for one fetched page, mirroring `dsh-web-fetch-http`'s default. */
export declare const DEFAULT_FETCH_MAX_CHARS = 100000;
/** One-operation budget shared by both endpoints. */
export declare const DEFAULT_WEB_TIMEOUT_MS = 30000;
/** Extraction formats `POST /web/fetch` accepts. */
export type WebFetchFormat = 'markdown' | 'html' | 'links' | 'screenshot';
/**
 * Web-seam settings: the gateway's own search and fetch stack. The two
 * providers register into `ctx.web` under the id `omniroute` when a
 * composition provides that seam; a composition without it simply never
 * registers them, and the chat route is unaffected either way.
 */
export interface OmniRouteWebConfig {
    /**
     * Whether web_search runs through the gateway (default true). When false the
     * provider hands the request to the shipped DeepSeek Search API
     * implementation, so the tool behaves exactly as it does without this plugin.
     */
    searchEnabled?: boolean;
    /**
     * Whether web_fetch runs through the gateway (default true). When false the
     * provider hands the request to the shipped DeepSeek Fetch API
     * implementation.
     */
    fetchEnabled?: boolean;
    /** Pin one gateway search provider id (e.g. `exa-search`); blank lets the gateway route per query. */
    searchProvider?: string;
    /** Sources requested when the search tool sets no bound (default 8). */
    maxResults?: number;
    /** Per-source snippet character budget (default 600); clipped snippets keep one search from flooding the context. */
    snippetMaxChars?: number;
    /** Pin one gateway fetch provider id (e.g. `firecrawl`); blank lets the gateway route. */
    fetchProvider?: string;
    /** Extraction format requested from the gateway (default `markdown`). */
    fetchFormat?: WebFetchFormat;
    /** Decoded page budget in characters (default 100,000), mirroring `dsh-web-fetch-http`. */
    fetchMaxChars?: number;
    /** One-operation budget for either web endpoint (default 30 seconds). */
    timeoutMs?: number;
}
/** The resolved web-side configuration of one operation. */
export interface OmniRouteWebOptions {
    /** Gateway base, normalized (no trailing slash). Paths are appended to it. */
    baseURL: string;
    /** Whether web_search runs through the gateway; false delegates to the native DeepSeek Search API. */
    searchEnabled: boolean;
    /** Whether web_fetch runs through the gateway; false delegates to the native DeepSeek Fetch API. */
    fetchEnabled: boolean;
    /** Pin one gateway search provider id; empty lets the gateway route. */
    searchProvider: string;
    /** Sources requested when the caller sets no bound. */
    maxResults: number;
    /** Per-source snippet character budget. */
    snippetMaxChars: number;
    /** Pin one gateway fetch provider id; empty lets the gateway route. */
    fetchProvider: string;
    /** Extraction format requested from the gateway. */
    fetchFormat: WebFetchFormat;
    /** Decoded-body character budget for one fetch. */
    fetchMaxChars: number;
    /** One-operation budget for either endpoint. */
    timeoutMs: number;
}
/** The per-operation facts both providers read. */
export interface WebRuntimeHooks {
    /** Current web configuration; read once per operation. */
    options: () => OmniRouteWebOptions;
    /** Resolve the gateway bearer token for this operation. */
    resolveApiKey: () => Promise<string>;
    /**
     * Resolve the DeepSeek API key the native path authenticates with. Returns
     * `undefined` when the credential store holds none; the shipped
     * implementation then reports the missing credential itself.
     */
    resolveDeepSeekApiKey: () => Promise<string | undefined>;
    /**
     * Resolve a DeepSeek account token for one endpoint, available only while the
     * initiating session runs on the DeepSeek account route — the same condition
     * the shipped provider applies.
     */
    resolveAccountToken: (endpoint: string) => Promise<string | undefined>;
    /**
     * The user question that triggered the current turn, sent as `ori_question`
     * by the native Search API path. `undefined` when the search runs outside a
     * session or the session carries no user prompt.
     */
    originalQuestion: () => string | undefined;
}
/** Shared transport for the two gateway endpoints. */
declare abstract class OmniRouteWebProvider {
    protected readonly hooks: WebRuntimeHooks;
    readonly id = "omniroute";
    constructor(hooks: WebRuntimeHooks);
    /**
     * Cheap local usability check; makes no network call. Both capability
     * switches keep the provider selectable — a disabled one still answers, from
     * the native implementation — so only the endpoint has to be usable.
     */
    available(): boolean;
    /**
     * POST one JSON body to a gateway web endpoint and decode the answer.
     * @param path - the endpoint path appended to the configured base.
     * @param body - the request body.
     * @param signal - caller cancellation.
     * @param label - human-readable capability name for diagnostics.
     * @returns the decoded JSON body.
     */
    protected post(path: string, body: Record<string, unknown>, signal: AbortSignal | undefined, label: string): Promise<Record<string, unknown>>;
}
/**
 * Search over `POST {baseURL}/search`, or over the shipped DeepSeek Search API
 * while the gateway search switch is off.
 *
 * The endpoint answers one gateway-chosen provider per call
 * (`{ provider, query, results[], answer, errors[] }`); `results[]` maps onto
 * the seam's `sources[]` and `answer.text` (when present) onto `content`.
 */
export declare class OmniRouteSearchProvider extends OmniRouteWebProvider {
    constructor(hooks: WebRuntimeHooks);
    /**
     * Run one search through the gateway, or through the native DeepSeek Search
     * API when the switch is off.
     * @param request - the query and optional result bound.
     * @param signal - caller cancellation.
     * @returns normalized sources, snippets already clipped.
     */
    search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult>;
    /**
     * Delegate to the implementation dsh ships for the DeepSeek Search API, so
     * the native route uses that provider's own endpoint, parameters, error codes
     * and configuration diagnostics.
     * @param request - the query and optional result bound.
     * @param signal - caller cancellation.
     * @returns the native provider's result.
     */
    private nativeSearch;
}
/**
 * Retrieval over `POST {baseURL}/web/fetch`, or over the shipped DeepSeek Fetch
 * API while the gateway fetch switch is off.
 *
 * The gateway answers extracted content (markdown by default), not the origin
 * response, so the seam's `statusCode` is the extraction outcome: 200 when the
 * gateway produced content, or the page status the provider reported in its
 * metadata when it reports one. A gateway failure throws, exactly like an
 * unreachable origin.
 */
export declare class OmniRouteFetchProvider extends OmniRouteWebProvider {
    constructor(hooks: WebRuntimeHooks);
    /**
     * Retrieve one URL through the gateway, or through the native DeepSeek Fetch
     * API when the switch is off.
     * @param request - the URL to retrieve.
     * @param signal - caller cancellation.
     * @returns the extracted body plus the extraction status.
     */
    fetch(request: WebFetchRequest, signal?: AbortSignal): Promise<WebFetchResult>;
    /**
     * Delegate to the implementation dsh ships for the DeepSeek Fetch API, so the
     * native route uses that provider's own endpoint, error codes and
     * configuration diagnostics.
     * @param request - the URL to retrieve.
     * @param signal - caller cancellation.
     * @returns the native provider's result.
     */
    private nativeFetch;
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
export declare function mapSearchResponse(payload: WireSearchResponse, snippetMaxChars?: number): WebSearchResult;
export {};
