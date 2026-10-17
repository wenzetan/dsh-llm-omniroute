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
/** The resolved web-side configuration of one operation. */
export interface OmniRouteWebOptions {
    /** Gateway base, normalized (no trailing slash). Paths are appended to it. */
    baseURL: string;
    /** Whether the providers register at all. */
    enabled: boolean;
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
}
/** Shared transport for the two gateway endpoints. */
declare abstract class OmniRouteWebProvider {
    protected readonly hooks: WebRuntimeHooks;
    readonly id = "omniroute";
    constructor(hooks: WebRuntimeHooks);
    /** Cheap local usability check; makes no network call. */
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
 * Search over `POST {baseURL}/search`.
 *
 * The endpoint answers one gateway-chosen provider per call
 * (`{ provider, query, results[], answer, errors[] }`); `results[]` maps onto
 * the seam's `sources[]` and `answer.text` (when present) onto `content`.
 */
export declare class OmniRouteSearchProvider extends OmniRouteWebProvider {
    constructor(hooks: WebRuntimeHooks);
    /**
     * Run one search through the gateway.
     * @param request - the query and optional result bound.
     * @param signal - caller cancellation.
     * @returns normalized sources, snippets already clipped.
     */
    search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult>;
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
export declare class OmniRouteFetchProvider extends OmniRouteWebProvider {
    constructor(hooks: WebRuntimeHooks);
    /**
     * Retrieve one URL through the gateway.
     * @param request - the URL to retrieve.
     * @param signal - caller cancellation.
     * @returns the extracted body plus the extraction status.
     */
    fetch(request: WebFetchRequest, signal?: AbortSignal): Promise<WebFetchResult>;
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
