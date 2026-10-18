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
import type { Volatile } from '@deepseek-ai/cordis';
import type { RetryPolicyConfig } from '@deepseek-ai/dsh-llm';
import type { OmniRouteCatalogModel } from './adapter.js';
import type { ProviderHints } from './types.js';
import type { OmniRouteWebConfig, OmniRouteWebOptions } from './web.js';
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
    /**
     * Display-only labels for the model-list groups. A group is the first
     * `/`-delimited segment of a model id (a gateway route that names its own
     * upstream). Storage keeps the raw group name as the key, so renaming a
     * group never touches routing, matching, or what a request sends; the label
     * composes into every model name the route serves (`./group.ts`), which is
     * what the settings page rows and the model picker both show.
     */
    groupLabels?: Record<string, string>;
    /** Provider-owned model-request retry policy; omission uses normal defaults. */
    retryPolicy?: RetryPolicyConfig;
    /** Gateway-backed `web_search` / `web_fetch` providers for the `ctx.web` seam. */
    web?: OmniRouteWebConfig;
}
/**
 * Forward-proxy settings for the models.dev catalog download.
 */
export interface ProxyConfig {
    /** Whether the proxy is used; defaults to false. */
    enabled?: boolean;
    /** Proxy URL; presets default to `http://127.0.0.1:7890`. */
    url?: string;
}
/**
 * The config a running plugin instance holds: every field is a stable
 * reference, updated in place by the Loader. Read plain values through
 * {@link snapshotConfig}.
 */
export interface Config {
    baseURL: Volatile<string>;
    models: Volatile<OmniRouteCatalogModel[]>;
    modelExcludePatterns: Volatile<string[]>;
    defaultContextWindow: Volatile<number>;
    maxTokens: Volatile<number>;
    streamIdleTimeoutMs: Volatile<number>;
    proxy: Volatile<ProxyConfig>;
    providerHints: Volatile<ProviderHints>;
    groupLabels: Volatile<Record<string, string>>;
    retryPolicy: Volatile<RetryPolicyConfig>;
    web: Volatile<OmniRouteWebConfig>;
}
/**
 * The `dsh.config` schema transform of a plugin entry. The host advertises the
 * shape as an object with a `Config` function and marks it `schema: true`;
 * whether registered as `Config` or as the plugin's own `dsh` field, the
 * entry's transform consumes the validated values and resolves them into the
 * running references.
 */
export interface SchemaTransform {
    readonly schema: true;
    readonly Config: (config: OmniRouteConfig | null | undefined) => Config;
    readonly '~standard': {
        readonly version: 1;
        readonly vendor: string;
        validate(config: unknown): {
            value: Config;
        } | {
            issues: {
                message: string;
                path: string[];
            }[];
        };
    };
}
/**
 * Validate one provider retry policy. The host resolver owns the rules
 * (unknown keys, non-negative integers, non-empty codes); the field keeps the
 * plain value so the adapter resolves it once more at registration.
 * @param value - the plain policy, or `undefined` for the host defaults.
 * @returns the validated plain policy.
 */
export declare function resolvePolicy(value: RetryPolicyConfig | undefined): RetryPolicyConfig | undefined;
/**
 * Resolve, validate, and detach the advisory model catalog.
 * @param models - the catalog rows a composition entry or the settings plane wrote.
 * @returns the rows with every optional field detached from the caller's objects.
 */
export declare function resolveModels(models: readonly OmniRouteCatalogModel[] | undefined): OmniRouteCatalogModel[];
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
 * Read the current plain values from the running config's volatile
 * references. The references are updated in place on a volatile-only commit,
 * so this always returns the latest committed generation without re-applying
 * the plugin.
 * @param config - the config object this plugin instance was applied with.
 * @returns the plain values the resolver consumes.
 */
export declare function snapshotConfig(config: Config): OmniRouteConfig;
/**
 * Validate and normalize a whole plain config through the per-field
 * resolvers, without touching the running references. This is the one
 * authority on what a config value may be: the settings schema validates
 * through it, and the adapter resolves its request facts from its output.
 * @param config - the values a composition entry, a caller, or the settings
 * plane wrote.
 * @returns the resolved plain config; an absent field stays absent.
 */
export declare function resolveConfigValues(config?: OmniRouteConfig | null): OmniRouteConfig;
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
export declare const Config: SchemaTransform & ((config?: OmniRouteConfig | null) => Config);
