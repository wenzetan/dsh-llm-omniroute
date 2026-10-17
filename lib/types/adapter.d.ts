/**
 * `OmniRouteAdapter`: fetch + SSE against an OmniRoute (OpenAI-compatible
 * aggregation gateway), emitting harness StreamChunks. The adapter is
 * transport-only: connection facts arrive through a thunk resolved once per
 * operation and the bearer token through a per-request resolver, so the
 * registering plugin owns validation, layering, and credential policy. The
 * selected reasoning effort travels either as `reasoning_effort` or folded
 * into the wire model id, decided by {@link resolveWireModel} over the
 * persisted catalog. No harness telemetry headers are sent: the mandatory
 * attribution `User-Agent` is the only product identity on the wire.
 *
 * @module dsh-llm-omniroute/adapter
 */
import { LlmAdapter } from '@deepseek-ai/dsh-llm';
import type { GenerateOptions, LlmDiscoveredModel, LlmModelDiscoveryRequest, LlmModelInfo, LlmProviderInfo, LlmResolvedModelInfo, ResolvedRetryPolicy, StreamChunk } from '@deepseek-ai/dsh-llm';
import type { CredentialRef } from '@deepseek-ai/dsh-credentials';
import type { OmniRouteCatalogModel } from './catalog.js';
import type { OmniRouteWebOptions } from './web.js';
import type { ModelsDevApi, ModelsDevMatch, ModelsDevParamsRequest, ModelsDevParamsResponse, ProviderHints, WireError } from './types.js';
/** Prefix for adapter-raised diagnostics. */
export declare const PKG = "dsh-llm-omniroute";
export { DEFAULT_MODEL_EXCLUDE_PATTERNS, displayModelName, modelNameFromId, parseOmniRouteCatalog } from './catalog.js';
export type { OmniRouteCatalogModel, ParseCatalogOptions } from './catalog.js';
/**
 * Validated connection facts for one operation. The plugin's
 * `resolveAdapterOptions` is the one explicit resolve step producing this
 * shape; the adapter trusts it and re-reads it per operation, which is what
 * makes a configuration change reach the next request without re-registration.
 */
export interface OmniRouteConnectionOptions {
    /** Gateway base including the `/v1` prefix; `/chat/completions` and `/models` are appended. */
    baseURL: string;
    /**
     * Credential reference of this same resolution, resolved per request.
     * Travelling with the endpoint is the point: a request can never pair one
     * generation's URL with another generation's secret. The reference is the
     * fixed id `omniroute` — the web settings page owns the value, and a literal
     * key is not a configuration value.
     */
    apiKeyRef: CredentialRef;
    /** Advisory models exposed to discovery consumers; requests remain unrestricted. */
    models: readonly OmniRouteCatalogModel[];
    /**
     * Case-insensitive id substrings excluding discovered models that cannot
     * serve chat completions; the hand-curated {@link models} catalog is never
     * filtered. Defaults to {@link DEFAULT_MODEL_EXCLUDE_PATTERNS}; an empty
     * array means no filtering.
     */
    modelExcludePatterns: readonly string[];
    /** Positive context capacity used when the selected model has no exact value. */
    defaultContextWindow: number;
    /** Default per-request output cap; when absent, no cap is materialized or sent. */
    maxTokens?: number;
    /** Maximum provider idle time while one stream read is outstanding. */
    streamIdleTimeoutMs: number;
    /**
     * Forward proxy for the models.dev catalog download; present only while
     * the proxy setting is enabled, so its absence means a direct fetch.
     */
    proxyUrl?: string;
    /** Match-shaping hints for the models.dev params lookup. */
    providerHints: ProviderHints;
    /**
     * Display-only labels for the id groups (`./group.ts`): every model name this
     * route serves is composed as `[label]tail` from them, so the settings page
     * and the model picker read identically. Keys are raw group names, which is
     * why a renamed group never touches what a request sends.
     */
    groupLabels: Record<string, string>;
    /** Provider-owned model-request retry policy, already resolved. */
    retryPolicy: ResolvedRetryPolicy;
    /**
     * The web seam's facts for the same generation: gateway endpoint plus the
     * search/fetch knobs. Resolved with the connection so the two can never drift
     * apart, and so both inherit the same last-good fallback.
     */
    web: OmniRouteWebOptions;
}
/** Constructor options for {@link OmniRouteAdapter}: the operation-local resolution hooks the plugin owns. */
export interface OmniRouteAdapterOptions {
    /** Current validated connection facts; called once per operation. */
    options: () => OmniRouteConnectionOptions;
    /**
     * Resolve the bearer token for the connection facts of one request. The
     * snapshot is passed in — never re-read — so the key can only ever come
     * from the same resolution as the endpoint it is sent to. Throws `LlmError`
     * `MISSING_CREDENTIAL` when the credentials store holds no value.
     */
    resolveApiKey: (connection: OmniRouteConnectionOptions) => Promise<string>;
    /**
     * Name the provider route that officially serves a model id, so a
     * multi-provider catalog match can put the vendor's own facts first.
     * Sourced from the routes registered on `ctx.llm` (the built-in
     * catalogs); absent when no route claims the id.
     */
    officialProviderOf?: (modelId: string) => Promise<string | undefined>;
}
/** Default maximum idle interval while an adapter stream read is outstanding. */
export declare const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 300000;
/** Default context capacity when neither the catalog nor config names one. */
export declare const DEFAULT_CONTEXT_WINDOW = 128000;
/** The public, provider-agnostic model catalog this feature reads. */
export declare const MODELS_DEV_API_URL = "https://models.dev/api.json";
/**
 * Built-in family-prefix hints: which catalog provider a model family's
 * official facts live under. GLM deliberately maps to `zai` (Z.ai, the
 * international official) rather than `zhipuai` — both carry identical ids.
 * Deployments override or extend via the `providerHints` config.
 */
export declare const DEFAULT_PROVIDER_HINTS: Readonly<ProviderHints>;
/**
 * Find every catalog entry one gateway model id can mean, official first.
 * Matching keys are the id and, for routed ids (`z-ai/glm-4.7`), its last
 * path segment — catalog keys carry no vendor prefix. Within the hinted
 * provider a NEAR key (catalog key contains the id or vice versa) also
 * matches, so a catalog not yet carrying the exact version still yields
 * the family's facts. Order: hinted provider's match first (flagged), then
 * exact-key matches in catalog order, then the rest.
 * @param api - the parsed models.dev catalog.
 * @param id - a gateway model id.
 * @param hints - deployment hints; `undefined` uses only the built-ins.
 * @returns matches, deduplicated by provider, hinted one leading.
 */
export declare function matchModelsDev(api: ModelsDevApi, id: string, hints?: ProviderHints): ModelsDevMatch[];
/**
 * Normalize a user-supplied gateway base: trim, drop trailing slashes, and
 * require an absolute http(s) URL. Failing here — at the explicit resolve
 * step — names the setting to fix instead of surfacing later as an opaque
 * fetch failure.
 * @param raw - the configured or drafted base URL.
 * @returns the normalized base with no trailing slash.
 */
export declare function normalizeBaseUrl(raw: string): string;
/**
 * Map an HTTP status to a stable LlmError code.
 * @param status - status of a non-2xx gateway response.
 * @param error - parsed gateway error body, when available.
 * @returns the normalized harness error code.
 */
export declare function httpErrorCode(status: number, error?: WireError['error']): string;
/**
 * The OmniRoute gateway adapter. One instance serves every model name it was
 * registered under (the harness model name IS the wire model name).
 *
 * One stable signal reaches both initial fetch and body reads. Caller aborts
 * map to `ABORTED`; the configured per-read idle watchdog maps to `TIMEOUT`.
 */
export declare class OmniRouteAdapter extends LlmAdapter {
    private readonly config;
    constructor(config: OmniRouteAdapterOptions);
    providerInfo(provider: string): LlmProviderInfo;
    providerRetryPolicy(_provider: string): ResolvedRetryPolicy;
    listModels(provider: string): Promise<readonly LlmModelInfo[]>;
    resolveModel(provider: string, model: string, _signal?: AbortSignal): Promise<LlmResolvedModelInfo>;
    /**
     * Fetch and parse one gateway `/models` listing into catalog rows. The one
     * place that knows the endpoint, the credential choice, and the error
     * vocabulary; discovery, the settings-page catalog fetch, and any future
     * consumer share it.
     * @param request - the draft endpoint/credential, when a settings form is editing one.
     * @param signal - caller cancellation.
     * @returns the parsed rows, sorted by id.
     */
    private catalogRows;
    /**
     * Interrogate one gateway endpoint for the models it advertises, serving
     * the settings-namespace discovery the plugin registered. A draft being
     * edited supplies its own base and one-shot credential; otherwise both
     * come from the current connection snapshot.
     *
     * The rows are the collapsed ones (`./catalog.ts`): one entry per native
     * model id, with the level-carrying variants folded away. Context, output
     * cap and vision come from the listing's own capability facts, so an
     * adoption no longer needs a second catalog to be useful.
     * @param request - the discovery draft (endpoint, protocol, credential).
     * @param signal - caller cancellation, supplied separately by the runtime.
     * @returns the advertised models, deduplicated by the runtime.
     */
    discoverModels(request: LlmModelDiscoveryRequest, signal?: AbortSignal): Promise<readonly LlmDiscoveredModel[]>;
    /**
     * Serve the settings page's rich catalog fetch over the plugin's own RPC
     * channel: the same `/models` interrogation as {@link discoverModels}, but
     * with the facts an adoption persists (thinking levels, the level → model-id
     * map, vision and tool capability, capacities) instead of the reduced
     * discovery shape the harness declares.
     * @param request - the draft endpoint/credential from the settings form.
     * @param signal - caller cancellation.
     * @returns the rows the form adopts verbatim.
     */
    fetchCatalog(request: {
        baseURL?: string;
        apiKey?: string;
    }, signal: AbortSignal): Promise<{
        models: OmniRouteCatalogModel[];
    }>;
    /**
     * Download the models.dev catalog (optionally through the configured
     * forward proxy) and match every requested gateway id against it, serving
     * the `models-dev-params` RPC endpoint. Runs host-side on purpose: the
     * browser only names the ids and the proxy, so no cross-origin download
     * happens and the proxy is a plain HTTP forward proxy Node can use.
     * @param request - gateway model ids and an optional proxy URL.
     * @param signal - caller cancellation.
     * @returns per id: every provider entry that matched it (possibly several —
     *   the user resolves which provider's facts to adopt), possibly none.
     */
    fetchModelsDevParams(request: ModelsDevParamsRequest, signal: AbortSignal): Promise<ModelsDevParamsResponse>;
    /**
     * Registry-based official priority, complementing the hint-driven one
     * inside {@link matchModelsDev}: when the hints did NOT flag a match
     * official yet, a route registered on ctx.llm that officially serves the
     * id (bare, or the last segment of a routed id) still leads. Runs only
     * when nothing is flagged, so the two mechanisms never fight.
     * @param id - the gateway model id.
     * @param matches - every catalog match, hinted order already applied.
     * @returns matches with the registry-official one first, flagged.
     */
    private prioritizeOfficial;
    stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
    private request;
}
