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
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment';
import type { OmniRouteConnectionOptions } from './adapter.js';
import type { Config, OmniRouteConfig } from './config.js';
export { DEFAULT_CONTEXT_WINDOW, DEFAULT_MODEL_EXCLUDE_PATTERNS, DEFAULT_PROVIDER_HINTS, DEFAULT_STREAM_IDLE_TIMEOUT_MS, matchModelsDev, modelNameFromId, OmniRouteAdapter, normalizeBaseUrl, PKG, } from './adapter.js';
export { parseOmniRouteCatalog, resolveWireModel } from './catalog.js';
export { serializeRequest } from './serialize.js';
export { DEFAULT_FETCH_MAX_CHARS, DEFAULT_SNIPPET_MAX_CHARS, DEFAULT_WEB_MAX_RESULTS, DEFAULT_WEB_TIMEOUT_MS, OmniRouteFetchProvider, OmniRouteSearchProvider, WEB_PROVIDER_ID, mapSearchResponse, } from './web.js';
export type { OmniRouteWebOptions, WebFetchFormat, WebRuntimeHooks, OmniRouteWebConfig } from './web.js';
export type { OmniRouteAdapterOptions, OmniRouteCatalogModel, OmniRouteConnectionOptions } from './adapter.js';
export type { OmniRouteConfig, ProxyConfig } from './config.js';
export type * from './types.js';
export declare const name = "dsh-llm-omniroute";
export declare const inject: string[];
/** Default gateway base: OmniRoute's own default port on loopback, used when neither config nor environment names one. */
export declare const DEFAULT_BASE_URL = "http://127.0.0.1:20128/v1";
export { Config, resolveWebOptions, resolveWebSettings } from './config.js';
/**
 * One resolution's complete request facts. Connection and credential facts
 * are one value on purpose: a snapshot the resolver rejects keeps the whole
 * previous generation, so a request can never pair a stale endpoint with a
 * newer key.
 */
export type ResolvedOmniRouteOptions = OmniRouteConnectionOptions;
export declare function apply(ctx: Context, config: Config): void;
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
export declare function resolveAdapterOptions(config: OmniRouteConfig, environment?: ReturnType<typeof launchEnvironmentOf>): ResolvedOmniRouteOptions;
