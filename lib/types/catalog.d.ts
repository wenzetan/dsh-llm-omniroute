/**
 * OmniRoute `/v1/models` capability parsing and reasoning-effort adaptation.
 *
 * OmniRoute is an aggregation gateway: it advertises one catalog entry per
 * routable model id, each carrying whatever capability facts its provider sync
 * learned (`context_length`, `max_output_tokens`, `input_modalities`,
 * `capabilities.tool_calling`, `capabilities.effort_tiers`, …). This module
 * turns that listing into the advisory catalog this plugin persists and serves,
 * and it owns the two gateway conventions that decide what a model's thinking
 * levels actually are:
 *
 * 1. **No-thinking ids.** The gateway synthesizes `no-think/<provider>/<model>`
 *    (`open-sse/utils/noThinkingAlias.ts`) and pins reasoning to none for them.
 *    Such an id carries no selectable level: the row declares `none` alone.
 *
 * 2. **Effort-suffixed ids.** The gateway also advertises — and routes —
 *    `<provider>/<model>-<level>` ids, either because its provider sync
 *    declared `effort_tiers` (`open-sse/utils/syncedEffortVariants.ts`) or
 *    because the upstream provider itself names models that way. For these the
 *    id IS the level. The catalog exposes the native id once (grouping every
 *    advertised level of the same native model into one row) and keeps
 *    `effortModels`, the reverse map the adapter uses to put the level back on
 *    the wire — the gateway rejects the bare native id (`400 … not available in
 *    the active live catalog`), so folding MUST be paired with that map.
 *
 * `capabilities.effort_tiers` is consulted only for ids that encode no level of
 * their own. The gateway derives that field from a sync of the whole provider,
 * not from a per-model probe, so it advertises levels a specific route may not
 * accept (e.g. `agy/gemini-3.8-flash-high` lists `none…max` while only `high`,
 * `low` and `medium` actually route). An id that encodes a level is the
 * stronger evidence and always wins.
 *
 * @module dsh-llm-omniroute/catalog
 */
import type { WireModelEntry } from './types.js';
/**
 * Default case-insensitive id substrings excluding non-chat models from
 * discovery. An aggregation gateway lists every model it knows about —
 * embedding (`text-embedding-*`), rerank (`*rerank*`, `*ranker*`) and other
 * non-chat families among them. Capability facts (`type`,
 * `supported_endpoints`) filter the entries that carry them; this list is the
 * fallback for the entries that do not, and `modelExcludePatterns` replaces it
 * for deployments that know better.
 */
export declare const DEFAULT_MODEL_EXCLUDE_PATTERNS: readonly string[];
/**
 * Reasoning-effort tokens OmniRoute encodes into a model-id suffix. The
 * gateway's own canonical vocabulary is `none|low|medium|high|xhigh|max`
 * (`shared/reasoning/effortStandardization.ts`); `minimal` is included because
 * upstream providers (OpenAI GPT-5 family, DeepSeek V4 ids) use it and the
 * gateway passes it through.
 */
export declare const EFFORT_TOKENS: readonly string[];
/** Effort intensity ordering, strongest first; unknown ids rank lowest. */
export declare const EFFORT_RUNG: Readonly<Record<string, number>>;
/** The effort a no-thinking route is pinned to. */
export declare const NO_THINK_EFFORT = "none";
/**
 * One optional model entry advertised by this adapter. Each field is either
 * authored by hand in the plugin config or adopted from `/v1/models` by the
 * settings page; the adapter never fetches the listing to answer a request, so
 * the persisted row is the whole truth at request time.
 */
export interface OmniRouteCatalogModel {
    /** Model id the harness selects. For an effort-suffixed route this is the native id the gateway listing does not carry — {@link effortModels} maps back to the id that does. */
    id: string;
    /** Selector label; defaults to {@link id}. */
    name?: string;
    /** Optional selector detail for deployments with similar model variants. */
    description?: string;
    /** Known combined request/response context capacity; omitted when the listing disclosed none. */
    contextWindow?: number;
    /** Per-request output cap for this model; omission falls back to the profile's `maxTokens`. */
    maxTokens?: number;
    /** The gateway reports the route accepts images (informational: this wire route is text-only, see {@link ../serialize.ts}). */
    vision?: boolean;
    /** The gateway reports the route accepts tool declarations. */
    toolCalling?: boolean;
    /** Supported reasoning-effort ids; presence offers the effort selector. */
    reasoningEfforts?: string[];
    /**
     * Preset default effort for this model; must be one of
     * {@link reasoningEfforts}. Absence defaults to the highest declared rung.
     */
    defaultReasoningEffort?: string;
    /**
     * Effort → gateway model id for routes whose level lives in the id
     * (`agy/gemini-3.8-flash` + `high` → `agy/gemini-3.8-flash-high`). An effort
     * absent from this map rides the row id itself as `reasoning_effort`.
     */
    effortModels?: Record<string, string>;
}
/** Options for {@link parseOmniRouteCatalog}. */
export interface ParseCatalogOptions {
    /**
     * Case-insensitive id substrings excluding entries; defaults to
     * {@link DEFAULT_MODEL_EXCLUDE_PATTERNS}, and an empty array disables the
     * id-name filter (capability facts still apply).
     */
    excludePatterns?: readonly string[];
}
/**
 * Whether an advertised id is a no-thinking route (`no-think/<provider>/<model>`
 * and its spelling variants). Such a route has no selectable thinking level:
 * the gateway itself pins reasoning to none for it.
 * @param id - the advertised model id.
 * @returns true when the id carries a no-thinking marker.
 */
export declare function isNoThinkModel(id: string): boolean;
/**
 * The thinking level an advertised id encodes as a `-<level>` suffix, when it
 * carries one. Only the last `-` segment is judged, and only against
 * {@link EFFORT_TOKENS}, so `agy/claude-opus-4-6-thinking` and
 * `opencode-go/step-5-preview-free` keep their ids intact.
 * @param id - the advertised model id.
 * @returns the lowercase effort token, or `undefined` when the id encodes none.
 */
export declare function effortSuffixOf(id: string): string | undefined;
/**
 * The strongest effort in a declared list. Unknown tokens rank lowest, so a
 * misspelled catalog entry never becomes the default over a real rung.
 * @param efforts - declared effort ids.
 * @returns the strongest id, or `undefined` for an empty list.
 */
export declare function highestEffort(efforts: readonly string[]): string | undefined;
/**
 * Order declared efforts weakest-first by intensity rung, keeping unknown
 * tokens last in their original order. The catalog's display and selector
 * order, so a user sees `none → … → max` regardless of how the gateway or the
 * author happened to list them.
 * @param efforts - effort ids in any order.
 * @returns the same ids, deduplicated and ranked.
 */
export declare function orderEfforts(efforts: readonly string[]): string[];
/**
 * Derive a human display name from a gateway model id when the listing
 * supplied none: take the last `/` segment (routed ids carry their vendor
 * as a path prefix), turn `-` into spaces, and capitalize each word's first
 * letter — except brand words, which keep their own spelling (`glm` → GLM,
 * `gpt` → GPT, `deepseek` → DeepSeek). A lone trailing letter reads as a
 * size marker and goes uppercase too. A routed id appends its verbatim
 * prefix in brackets: `deepseek-ai/deepseek-v4-flash` →
 * `DeepSeek V4 Flash[deepseek-ai]`.
 * @param id - the full gateway model id.
 * @returns the generated display name.
 */
export declare function modelNameFromId(id: string): string;
/**
 * Display name for one gateway model id: the name the gateway listing
 * supplied when it has one, else {@link modelNameFromId} over the id. The
 * full id always stays the wire value the gateway answers to.
 * @param id - the full gateway model id.
 * @param listed - the name the gateway listing itself supplied, if any.
 * @returns the listed name when present, else the generated name.
 */
export declare function displayModelName(id: string, listed?: string): string;
/**
 * Whether the listing's own capability facts say the route serves chat. Absent
 * facts mean "unknown", never "no": the id-name filter and the author's own
 * catalog remain the backstop.
 * @param entry - one advertised entry.
 * @returns false only when the listing positively rules chat out.
 */
export declare function servesChat(entry: WireModelEntry): boolean;
/**
 * Parse an OmniRoute `/v1/models` listing into this plugin's advisory catalog.
 *
 * One row per native model id: every advertised level of the same native model
 * is folded into a single row (see the module header for why the fold must be
 * paired with {@link OmniRouteCatalogModel.effortModels}). Rows are sorted by
 * id — a gateway listing has no meaningful order of its own, and a stable
 * alphabetical one keeps the picker and the settings form scannable across
 * fetches.
 *
 * @param entries - the decoded `data[]` array.
 * @param options - the id-name exclude filter, already resolved by the caller.
 * @returns the catalog rows, deduplicated by native id.
 */
export declare function parseOmniRouteCatalog(entries: readonly WireModelEntry[], options?: ParseCatalogOptions): OmniRouteCatalogModel[];
/** The outbound model facts for one request: the id to send and the effort to send with it. */
export interface WireModelRoute {
    /** `model` value for the gateway request. */
    model: string;
    /** `reasoning_effort` value; absent when the level already lives in {@link model}. */
    reasoningEffort?: string;
}
/**
 * Resolve the model id and effort one request must carry.
 *
 * A row whose {@link OmniRouteCatalogModel.effortModels} lists the selected
 * effort sends that concrete id and no `reasoning_effort`: the level is part of
 * the id the gateway routes. Every other row sends its own id, with the effort
 * (when one was selected) riding alongside as `reasoning_effort` — including
 * `none`, which asks the gateway for a no-thinking call rather than leaving the
 * provider's own default in place.
 *
 * @param row - the catalog row the harness selected, when it is catalogued.
 * @param model - the model id the harness asked for.
 * @param effort - the effort the harness selected, when any.
 * @returns the wire model and effort.
 */
export declare function resolveWireModel(row: OmniRouteCatalogModel | undefined, model: string, effort: string | undefined): WireModelRoute;
