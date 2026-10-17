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
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { RetryPolicyConfig } from '@deepseek-ai/dsh-llm';
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment';
import type { OmniRouteCatalogModel, OmniRouteConnectionOptions } from './adapter.js';
import type { OmniRouteWebOptions, WebFetchFormat } from './web.js';
import type { ProviderHints } from './types.js';
export { DEFAULT_CONTEXT_WINDOW, DEFAULT_MODEL_EXCLUDE_PATTERNS, DEFAULT_PROVIDER_HINTS, DEFAULT_STREAM_IDLE_TIMEOUT_MS, matchModelsDev, modelNameFromId, OmniRouteAdapter, normalizeBaseUrl, PKG, } from './adapter.js';
export { parseOmniRouteCatalog, resolveWireModel } from './catalog.js';
export { serializeRequest } from './serialize.js';
export { DEFAULT_FETCH_MAX_CHARS, DEFAULT_SNIPPET_MAX_CHARS, DEFAULT_WEB_MAX_RESULTS, DEFAULT_WEB_TIMEOUT_MS, OmniRouteFetchProvider, OmniRouteSearchProvider, WEB_PROVIDER_ID, mapSearchResponse, } from './web.js';
export type { OmniRouteWebOptions, WebFetchFormat, WebRuntimeHooks } from './web.js';
export type { OmniRouteAdapterOptions, OmniRouteCatalogModel, OmniRouteConnectionOptions } from './adapter.js';
export type * from './types.js';
export declare const name = "dsh-llm-omniroute";
export declare const inject: string[];
/** Default gateway base: OmniRoute's own default port on loopback, used when neither config nor environment names one. */
export declare const DEFAULT_BASE_URL = "http://127.0.0.1:20128/v1";
/**
 * Web-seam settings: the gateway's own search and fetch stack. The two
 * providers register into `ctx.web` under the id `omniroute` when a
 * composition provides that seam; a composition without it simply never
 * registers them, and the chat route is unaffected either way.
 */
export interface OmniRouteWebConfig {
    /** Whether the search and fetch providers register at all (default true). */
    enabled?: boolean;
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
    baseURL?: string;
    /** Advisory models shown by discovery consumers; defaults to none — a gateway's model set is deployment-specific. */
    models?: OmniRouteCatalogModel[];
    /**
     * Case-insensitive id substrings excluding discovered models that cannot
     * serve chat completions (embedding, rerank, ranker families). Replaces the
     * default {@link DEFAULT_MODEL_EXCLUDE_PATTERNS} list; an empty array
     * disables filtering. The hand-curated {@link models} catalog is unaffected.
     */
    modelExcludePatterns?: string[];
    /** Positive context capacity used when the selected model has no exact value (default 128,000). */
    defaultContextWindow?: number;
    /** Default per-request output cap; omission sends no cap and lets each upstream default apply. */
    maxTokens?: number;
    /** Maximum gateway idle time while one stream read is outstanding (default five minutes). */
    streamIdleTimeoutMs?: number;
    /** Forward proxy for the models.dev catalog download performed by the「更新模型信息」action. */
    proxy?: ProxyConfig;
    /**
     * Match-shaping hints for the models.dev params lookup: family prefixes
     * and exact ids name which catalog provider counts as official (leading
     * match, flagged). Built-in families (glm→zai, gpt→openai, claude→
     * anthropic, …) apply first; these entries override and extend them.
     */
    providerHints?: ProviderHints;
    /** Provider-owned model-request retry policy; omission uses normal defaults. */
    retryPolicy?: RetryPolicyConfig;
    /** Gateway-backed `web_search` / `web_fetch` providers for the `ctx.web` seam. */
    web?: OmniRouteWebConfig;
}
/** Forward-proxy settings for the models.dev catalog download. */
export interface ProxyConfig {
    /** Whether the proxy is used; defaults to false. */
    enabled?: boolean;
    /** Proxy URL; presets default to `http://127.0.0.1:7890`. */
    url?: string;
}
/** Default forward proxy: the conventional Clash port on loopback. */
export declare const DEFAULT_PROXY_URL = "http://127.0.0.1:7890";
declare const configSchema: z<Schemastery.ObjectS<NoInfer<{
    baseURL: z<string, string, "volatile">;
    models: z<NoInfer<OmniRouteCatalogModel[]>, NoInfer<OmniRouteCatalogModel[]>, "volatile">;
    modelExcludePatterns: z<NoInfer<string[]>, NoInfer<string[]>, "volatile">;
    defaultContextWindow: z<number, number, "volatile-defined">;
    maxTokens: z<number, number, "volatile">;
    streamIdleTimeoutMs: z<number, number, "volatile-defined">;
    proxy: z<NoInfer<{
        enabled?: boolean | null;
        url?: string | null;
    } & import("@deepseek-ai/cosmokit").Dict>, NoInfer<ProxyConfig>, "volatile">;
    providerHints: z<NoInfer<Schemastery.ObjectS<NoInfer<{
        defaults: z<Schemastery.ObjectS<{}>, Schemastery.ObjectT<{}>, "plain">;
        models: z<Schemastery.ObjectS<{}>, Schemastery.ObjectT<{}>, "plain">;
    }>>>, NoInfer<Schemastery.ObjectT<NoInfer<{
        defaults: z<Schemastery.ObjectS<{}>, Schemastery.ObjectT<{}>, "plain">;
        models: z<Schemastery.ObjectS<{}>, Schemastery.ObjectT<{}>, "plain">;
    }>>>, "volatile">;
    retryPolicy: z<NoInfer<RetryPolicyConfig>, NoInfer<RetryPolicyConfig>, "volatile">;
    web: z<NoInfer<{
        enabled?: boolean | null;
        searchProvider?: string | null;
        maxResults?: number | null;
        snippetMaxChars?: number | null;
        fetchProvider?: string | null;
        fetchFormat?: "markdown" | "html" | "links" | "screenshot" | null;
        fetchMaxChars?: number | null;
        timeoutMs?: number | null;
    } & import("@deepseek-ai/cosmokit").Dict>, NoInfer<OmniRouteWebConfig>, "volatile">;
}>>, Schemastery.ObjectT<NoInfer<{
    baseURL: z<string, string, "volatile">;
    models: z<NoInfer<OmniRouteCatalogModel[]>, NoInfer<OmniRouteCatalogModel[]>, "volatile">;
    modelExcludePatterns: z<NoInfer<string[]>, NoInfer<string[]>, "volatile">;
    defaultContextWindow: z<number, number, "volatile-defined">;
    maxTokens: z<number, number, "volatile">;
    streamIdleTimeoutMs: z<number, number, "volatile-defined">;
    proxy: z<NoInfer<{
        enabled?: boolean | null;
        url?: string | null;
    } & import("@deepseek-ai/cosmokit").Dict>, NoInfer<ProxyConfig>, "volatile">;
    providerHints: z<NoInfer<Schemastery.ObjectS<NoInfer<{
        defaults: z<Schemastery.ObjectS<{}>, Schemastery.ObjectT<{}>, "plain">;
        models: z<Schemastery.ObjectS<{}>, Schemastery.ObjectT<{}>, "plain">;
    }>>>, NoInfer<Schemastery.ObjectT<NoInfer<{
        defaults: z<Schemastery.ObjectS<{}>, Schemastery.ObjectT<{}>, "plain">;
        models: z<Schemastery.ObjectS<{}>, Schemastery.ObjectT<{}>, "plain">;
    }>>>, "volatile">;
    retryPolicy: z<NoInfer<RetryPolicyConfig>, NoInfer<RetryPolicyConfig>, "volatile">;
    web: z<NoInfer<{
        enabled?: boolean | null;
        searchProvider?: string | null;
        maxResults?: number | null;
        snippetMaxChars?: number | null;
        fetchProvider?: string | null;
        fetchFormat?: "markdown" | "html" | "links" | "screenshot" | null;
        fetchMaxChars?: number | null;
        timeoutMs?: number | null;
    } & import("@deepseek-ai/cosmokit").Dict>, NoInfer<OmniRouteWebConfig>, "volatile">;
}>>, "plain">;
/**
 * The plugin config schema. Every field is volatile: the settings form edits
 * them through the active profile patch, and the Loader commits a
 * volatile-only edit into the running config references without re-applying
 * the plugin, so the next resolution sees it. Field-level checks live here —
 * not only in the resolver — because the settings write point validates this
 * exact schema before persisting, and the resolver re-judges every bound for
 * programmatic construction.
 */
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    baseURL: z<string, string, "volatile">;
    models: z<NoInfer<OmniRouteCatalogModel[]>, NoInfer<OmniRouteCatalogModel[]>, "volatile">;
    modelExcludePatterns: z<NoInfer<string[]>, NoInfer<string[]>, "volatile">;
    defaultContextWindow: z<number, number, "volatile-defined">;
    maxTokens: z<number, number, "volatile">;
    streamIdleTimeoutMs: z<number, number, "volatile-defined">;
    proxy: z<NoInfer<{
        enabled?: boolean | null;
        url?: string | null;
    } & import("@deepseek-ai/cosmokit").Dict>, NoInfer<ProxyConfig>, "volatile">;
    providerHints: z<NoInfer<Schemastery.ObjectS<NoInfer<{
        defaults: z<Schemastery.ObjectS<{}>, Schemastery.ObjectT<{}>, "plain">;
        models: z<Schemastery.ObjectS<{}>, Schemastery.ObjectT<{}>, "plain">;
    }>>>, NoInfer<Schemastery.ObjectT<NoInfer<{
        defaults: z<Schemastery.ObjectS<{}>, Schemastery.ObjectT<{}>, "plain">;
        models: z<Schemastery.ObjectS<{}>, Schemastery.ObjectT<{}>, "plain">;
    }>>>, "volatile">;
    retryPolicy: z<NoInfer<RetryPolicyConfig>, NoInfer<RetryPolicyConfig>, "volatile">;
    web: z<NoInfer<{
        enabled?: boolean | null;
        searchProvider?: string | null;
        maxResults?: number | null;
        snippetMaxChars?: number | null;
        fetchProvider?: string | null;
        fetchFormat?: "markdown" | "html" | "links" | "screenshot" | null;
        fetchMaxChars?: number | null;
        timeoutMs?: number | null;
    } & import("@deepseek-ai/cosmokit").Dict>, NoInfer<OmniRouteWebConfig>, "volatile">;
}>>, Schemastery.ObjectT<NoInfer<{
    baseURL: z<string, string, "volatile">;
    models: z<NoInfer<OmniRouteCatalogModel[]>, NoInfer<OmniRouteCatalogModel[]>, "volatile">;
    modelExcludePatterns: z<NoInfer<string[]>, NoInfer<string[]>, "volatile">;
    defaultContextWindow: z<number, number, "volatile-defined">;
    maxTokens: z<number, number, "volatile">;
    streamIdleTimeoutMs: z<number, number, "volatile-defined">;
    proxy: z<NoInfer<{
        enabled?: boolean | null;
        url?: string | null;
    } & import("@deepseek-ai/cosmokit").Dict>, NoInfer<ProxyConfig>, "volatile">;
    providerHints: z<NoInfer<Schemastery.ObjectS<NoInfer<{
        defaults: z<Schemastery.ObjectS<{}>, Schemastery.ObjectT<{}>, "plain">;
        models: z<Schemastery.ObjectS<{}>, Schemastery.ObjectT<{}>, "plain">;
    }>>>, NoInfer<Schemastery.ObjectT<NoInfer<{
        defaults: z<Schemastery.ObjectS<{}>, Schemastery.ObjectT<{}>, "plain">;
        models: z<Schemastery.ObjectS<{}>, Schemastery.ObjectT<{}>, "plain">;
    }>>>, "volatile">;
    retryPolicy: z<NoInfer<RetryPolicyConfig>, NoInfer<RetryPolicyConfig>, "volatile">;
    web: z<NoInfer<{
        enabled?: boolean | null;
        searchProvider?: string | null;
        maxResults?: number | null;
        snippetMaxChars?: number | null;
        fetchProvider?: string | null;
        fetchFormat?: "markdown" | "html" | "links" | "screenshot" | null;
        fetchMaxChars?: number | null;
        timeoutMs?: number | null;
    } & import("@deepseek-ai/cosmokit").Dict>, NoInfer<OmniRouteWebConfig>, "volatile">;
}>>, "plain">;
/**
 * The config a running plugin instance holds: schemastery replaced every
 * volatile field with a stable reference, updated in place by the Loader.
 * Read plain values through {@link snapshotConfig}; the exported
 * {@link OmniRouteConfig} is the plain-value shape callers write.
 */
export type Config = ReturnType<typeof configSchema>;
/**
 * One resolution's complete request facts. Connection and credential facts
 * are one value on purpose: a snapshot the resolver rejects keeps the whole
 * previous generation, so a request can never pair a stale endpoint with a
 * newer key.
 */
export type ResolvedOmniRouteOptions = OmniRouteConnectionOptions;
/**
 * Validate the web block on its own. The endpoint is not part of it: the web
 * providers send to the same gateway base the connection snapshot resolved, so
 * one configured URL can never drift between the chat and web halves.
 * @param config - the plain web block, or `undefined` for the defaults.
 * @returns the resolved web knobs, without the endpoint.
 */
export declare function resolveWebSettings(config: OmniRouteWebConfig | undefined): Omit<OmniRouteWebOptions, 'baseURL'>;
/**
 * The web-provider options for one operation: the validated web block over the
 * endpoint the connection snapshot resolved.
 * @param config - the plain web block.
 * @param baseURL - the resolved gateway base (no trailing slash).
 * @returns the options both web providers read.
 */
export declare function resolveWebOptions(config: OmniRouteWebConfig | undefined, baseURL: string): OmniRouteWebOptions;
/**
 * The one explicit resolve step from raw config to validated connection
 * facts. Programmatic construction may bypass Schemastery normalization, so
 * every default and bound is re-judged here — for the composition entry at
 * load (fail loud) and for each settings snapshot at its first use.
 * @param config - plain plugin config values (a composition entry, or a
 * {@link snapshotConfig} of the running volatile references).
 * @param environment - this run's environment layers, or `undefined` outside
 * the product CLI. A trusted layer may supply the gateway endpoint.
 * @returns validated connection facts plus the credential reference.
 */
export declare function resolveAdapterOptions(config: OmniRouteConfig, environment?: ReturnType<typeof launchEnvironmentOf>): ResolvedOmniRouteOptions;
export declare function apply(ctx: Context, config: Config): void;
