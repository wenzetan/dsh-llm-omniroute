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
 * @module dsh-omniroute/catalog
 */

import type { ModelModality } from '@deepseek-ai/dsh-llm'
import type { WireModelEntry } from './types.ts'

/**
 * Default case-insensitive id substrings excluding non-chat models from
 * discovery. An aggregation gateway lists every model it knows about —
 * embedding (`text-embedding-*`), rerank (`*rerank*`, `*ranker*`) and other
 * non-chat families among them. Capability facts (`type`,
 * `supported_endpoints`) filter the entries that carry them; this list is the
 * fallback for the entries that do not, and `modelExcludePatterns` replaces it
 * for deployments that know better.
 */
export const DEFAULT_MODEL_EXCLUDE_PATTERNS: readonly string[] = ['embed', 'rerank', 'ranker']

/**
 * Reasoning-effort tokens OmniRoute encodes into a model-id suffix. The
 * gateway's own canonical vocabulary is `none|low|medium|high|xhigh|max`
 * (`shared/reasoning/effortStandardization.ts`); `minimal` is included because
 * upstream providers (OpenAI GPT-5 family, DeepSeek V4 ids) use it and the
 * gateway passes it through.
 */
export const EFFORT_TOKENS: readonly string[] = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']

/** Effort intensity ordering, strongest first; unknown ids rank lowest. */
export const EFFORT_RUNG: Readonly<Record<string, number>> = {
  max: 7, xhigh: 6, high: 5, medium: 4, low: 3, minimal: 2, none: 1, default: 0,
}

/** The effort a no-thinking route is pinned to. */
export const NO_THINK_EFFORT = 'none'

/**
 * No-thinking markers, matched against the separator-stripped lowercase id so
 * `no-think/…`, `no_thinking-…`, `nothink…` and `notthinking…` all hit. Kept to
 * unambiguous spellings: a false positive would hide a model's real levels.
 */
const NO_THINK_MARKERS: readonly string[] = [
  'nothink', 'nothinking', 'notthinking', 'nonthinking', 'noreasoning',
]

/** Model `type` values that cannot serve chat completions. */
const NON_CHAT_TYPES = new Set([
  'embedding', 'embeddings', 'rerank', 'ranker', 'image', 'images',
  'audio', 'speech', 'transcription', 'tts', 'video', 'moderation',
])

/** Brand words that keep their own casing instead of first-letter capital. */
const BRAND_SPELLING: Readonly<Record<string, string>> = {
  glm: 'GLM',
  gpt: 'GPT',
  deepseek: 'DeepSeek',
}

/**
 * One optional model entry advertised by this adapter. Each field is either
 * authored by hand in the plugin config or adopted from `/v1/models` by the
 * settings page; the adapter never fetches the listing to answer a request, so
 * the persisted row is the whole truth at request time.
 */
export interface OmniRouteCatalogModel {
  /** Model id the harness selects. For an effort-suffixed route this is the native id the gateway listing does not carry — {@link effortModels} maps back to the id that does. */
  id: string
  /** Selector label; defaults to {@link id}. */
  name?: string
  /** Optional selector detail for deployments with similar model variants. */
  description?: string
  /** Known combined request/response context capacity; omitted when the listing disclosed none. */
  contextWindow?: number
  /** Per-request output cap for this model; omission falls back to the profile's `maxTokens`. */
  maxTokens?: number
  /** The gateway reports the route accepts images (informational: this wire route is text-only, see {@link ../serialize.ts}). */
  vision?: boolean
  /** The gateway reports the route accepts tool declarations. */
  toolCalling?: boolean
  /** Supported reasoning-effort ids; presence offers the effort selector. */
  reasoningEfforts?: string[]
  /**
   * Preset default effort for this model; must be one of
   * {@link reasoningEfforts}. Absence defaults to the highest declared rung.
   */
  defaultReasoningEffort?: string
  /**
   * Effort → gateway model id for routes whose level lives in the id
   * (`agy/gemini-3.8-flash` + `high` → `agy/gemini-3.8-flash-high`). An effort
   * absent from this map rides the row id itself as `reasoning_effort`.
   */
  effortModels?: Record<string, string>
}

/** Options for {@link parseOmniRouteCatalog}. */
export interface ParseCatalogOptions {
  /**
   * Case-insensitive id substrings excluding entries; defaults to
   * {@link DEFAULT_MODEL_EXCLUDE_PATTERNS}, and an empty array disables the
   * id-name filter (capability facts still apply).
   */
  excludePatterns?: readonly string[]
}

/** One advertised entry with the grouping facts derived from its id. */
interface Candidate {
  entry: WireModelEntry
  /** Grouping key: the advertised id with its effort suffix stripped. */
  base: string
  /** The effort the advertised id encodes, when it carries one. */
  effort?: string
  /** Whether the advertised id is a no-thinking route. */
  noThink: boolean
}

/** Drop separators and case so marker matching survives id punctuation. */
function flattenId(id: string): string {
  return id.toLowerCase().replace(/[^a-z0-9]+/gu, '')
}

/**
 * Whether an advertised id is a no-thinking route (`no-think/<provider>/<model>`
 * and its spelling variants). Such a route has no selectable thinking level:
 * the gateway itself pins reasoning to none for it.
 * @param id - the advertised model id.
 * @returns true when the id carries a no-thinking marker.
 */
export function isNoThinkModel(id: string): boolean {
  const flat = flattenId(id)
  if (flat.length === 0) return false
  return NO_THINK_MARKERS.some(marker => flat.includes(marker))
}

/**
 * The thinking level an advertised id encodes as a `-<level>` suffix, when it
 * carries one. Only the last `-` segment is judged, and only against
 * {@link EFFORT_TOKENS}, so `agy/claude-opus-4-6-thinking` and
 * `opencode-go/step-5-preview-free` keep their ids intact.
 * @param id - the advertised model id.
 * @returns the lowercase effort token, or `undefined` when the id encodes none.
 */
export function effortSuffixOf(id: string): string | undefined {
  const at = id.lastIndexOf('-')
  if (at <= 0 || at === id.length - 1) return undefined
  const token = id.slice(at + 1).toLowerCase()
  return EFFORT_TOKENS.includes(token) ? token : undefined
}

/**
 * The strongest effort in a declared list. Unknown tokens rank lowest, so a
 * misspelled catalog entry never becomes the default over a real rung.
 * @param efforts - declared effort ids.
 * @returns the strongest id, or `undefined` for an empty list.
 */
export function highestEffort(efforts: readonly string[]): string | undefined {
  return [...efforts].sort((a, b) => (EFFORT_RUNG[b] ?? -1) - (EFFORT_RUNG[a] ?? -1))[0]
}

/**
 * Order declared efforts weakest-first by intensity rung, keeping unknown
 * tokens last in their original order. The catalog's display and selector
 * order, so a user sees `none → … → max` regardless of how the gateway or the
 * author happened to list them.
 * @param efforts - effort ids in any order.
 * @returns the same ids, deduplicated and ranked.
 */
export function orderEfforts(efforts: readonly string[]): string[] {
  const seen = new Set<string>()
  const unique: string[] = []
  for (const effort of efforts) {
    if (effort.length === 0 || seen.has(effort)) continue
    seen.add(effort)
    unique.push(effort)
  }
  return unique
    .map((effort, at) => ({ effort, at }))
    .sort((a, b) => {
      const left = EFFORT_RUNG[a.effort]
      const right = EFFORT_RUNG[b.effort]
      if (left === undefined && right === undefined) return a.at - b.at
      if (left === undefined) return 1
      if (right === undefined) return -1
      return left - right
    })
    .map(entry => entry.effort)
}

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
export function modelNameFromId(id: string): string {
  const slash = id.lastIndexOf('/')
  const prefix = slash === -1 ? undefined : id.slice(0, slash)
  const words = id.slice(slash + 1).split('-').filter(word => word.length > 0)
  const spelled = words.map((word, at) => {
    // A lone-letter segment anywhere ("...-b") is a marker, not a word.
    if (word.length === 1) return word.toUpperCase()
    const brand = BRAND_SPELLING[word]
    if (brand !== undefined) return brand
    let result = word.charAt(0).toUpperCase() + word.slice(1)
    if (at === words.length - 1) {
      // A size letter (b/k/m) trailing digits/dots in the LAST word ("32b",
      // "4.5b") is a suffix: capitalize it even though the word starts with a
      // digit and the first-letter rule above never reaches it. Version
      // letters stay as-is — `gpt-4o` keeps its lowercase o.
      result = result.replace(/([0-9.])([bkm])$/, (_match: string, head: string, tail: string) =>
        head + tail.toUpperCase())
    }
    return result
  }).join(' ')
  return prefix === undefined ? spelled : `${spelled}[${prefix}]`
}

/**
 * Display name for one gateway model id: the name the gateway listing
 * supplied when it has one, else {@link modelNameFromId} over the id. The
 * full id always stays the wire value the gateway answers to.
 * @param id - the full gateway model id.
 * @param listed - the name the gateway listing itself supplied, if any.
 * @returns the listed name when present, else the generated name.
 */
export function displayModelName(id: string, listed?: string): string {
  if (listed !== undefined && listed.length > 0) return listed
  return modelNameFromId(id)
}

/** A positive integer from a wire field, or `undefined`. */
function positiveInt(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined
}

/** Whether the listing says the route accepts images. */
function entryVision(entry: WireModelEntry): boolean {
  if (entry.capabilities?.vision === true) return true
  return (entry.input_modalities ?? []).some(
    modality => typeof modality === 'string' && modality.trim().toLowerCase() === 'image',
  )
}

/**
 * Whether the listing's own capability facts say the route serves chat. Absent
 * facts mean "unknown", never "no": the id-name filter and the author's own
 * catalog remain the backstop.
 * @param entry - one advertised entry.
 * @returns false only when the listing positively rules chat out.
 */
export function servesChat(entry: WireModelEntry): boolean {
  const type = typeof entry.type === 'string' ? entry.type.trim().toLowerCase() : ''
  if (type.length > 0 && NON_CHAT_TYPES.has(type)) return false
  const endpoints = entry.supported_endpoints
  if (Array.isArray(endpoints) && endpoints.length > 0) {
    return endpoints.some(
      endpoint => typeof endpoint === 'string' && endpoint.trim().toLowerCase() === 'chat',
    )
  }
  return true
}

/** The declared effort tiers of one entry, deduplicated and non-empty. */
function entryEfforts(entry: WireModelEntry): string[] {
  const tiers = entry.capabilities?.effort_tiers
  if (!Array.isArray(tiers)) return []
  return orderEfforts(
    tiers.filter((tier): tier is string => typeof tier === 'string')
      .map(tier => tier.trim())
      .filter(tier => tier.length > 0),
  )
}

/**
 * The capability facts one entry contributes to its catalog row: capacities
 * prefer the combined `context_length` over the input-only `max_input_tokens`
 * and `max_output_tokens` over OpenAI's older `max_tokens`, and the vision /
 * tool-calling flags mirror the capability object verbatim.
 * @param entry - the entry the row takes its facts from.
 * @returns capacity and capability fields, omitting everything undisclosed.
 */
function entryFacts(entry: WireModelEntry): Omit<OmniRouteCatalogModel, 'id' | 'name'> {
  const contextWindow = positiveInt(entry.context_length) ?? positiveInt(entry.max_input_tokens)
  const maxTokens = positiveInt(entry.max_output_tokens) ?? positiveInt(entry.max_tokens)
  return {
    ...contextWindow === undefined ? {} : { contextWindow },
    ...maxTokens === undefined ? {} : { maxTokens },
    ...entryVision(entry) ? { vision: true } : {},
    ...typeof entry.capabilities?.tool_calling === 'boolean'
      ? { toolCalling: entry.capabilities.tool_calling }
      : {},
  }
}

/** The listing's own label for an entry, trimmed, when it disclosed one. */
function entryName(entry: WireModelEntry): string | undefined {
  const name = typeof entry.name === 'string' ? entry.name.trim() : ''
  return name.length > 0 ? name : undefined
}

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
export function parseOmniRouteCatalog(
  entries: readonly WireModelEntry[],
  options: ParseCatalogOptions = {},
): OmniRouteCatalogModel[] {
  const excludes = (options.excludePatterns ?? DEFAULT_MODEL_EXCLUDE_PATTERNS)
    .map(pattern => pattern.toLowerCase())
  const groups = new Map<string, Candidate[]>()
  for (const entry of entries) {
    const id = typeof entry?.id === 'string' ? entry.id : ''
    if (id.length === 0) continue
    if (!servesChat(entry)) continue
    const lower = id.toLowerCase()
    if (excludes.some(pattern => pattern.length > 0 && lower.includes(pattern))) continue
    const noThink = isNoThinkModel(id)
    const effort = noThink ? undefined : effortSuffixOf(id)
    const base = effort === undefined ? id : id.slice(0, id.length - effort.length - 1)
    const members = groups.get(base) ?? []
    members.push({ entry, base, noThink, ...effort === undefined ? {} : { effort } })
    groups.set(base, members)
  }

  const rows: OmniRouteCatalogModel[] = []
  for (const members of groups.values()) {
    const first = members[0]
    if (first === undefined) continue
    const bare = members.find(member => member.effort === undefined && !member.noThink)
    const restricted = members.filter(member => member.effort !== undefined)
    // The bare listing describes the whole native model; a suffixed sibling's
    // facts (and, worse, its name) describe only one level.
    const factsSource = (bare ?? first).entry
    const facts = entryFacts(factsSource)
    // Naming: a bare listing describes the whole native model, a single
    // advertised level describes this exact route (`GPT-OSS 120B (Medium)`),
    // and a no-thinking route is one route too (`no-think/<model>`) — every one
    // of those labels is worth keeping. Several advertised levels are not: each
    // label names only its own level, so the collapsed row is named after the
    // native id it now stands for.
    const listedName = bare !== undefined || restricted.length === 1 || first.noThink
      ? entryName(factsSource)
      : undefined
    const name = displayModelName(first.base, listedName)

    let efforts: string[] = []
    let effortModels: Record<string, string> | undefined
    if (first.noThink) {
      // The gateway's own no-thinking alias: no selectable level at all.
      efforts = [NO_THINK_EFFORT]
    } else if (restricted.length > 0) {
      const map: Record<string, string> = {}
      for (const member of restricted) {
        const effort = member.effort
        if (effort === undefined || map[effort] !== undefined) continue
        map[effort] = member.entry.id
      }
      // A bare listing next to suffixed siblings keeps the levels it declares;
      // those ride the bare id itself as `reasoning_effort`.
      const bareTiers = bare === undefined ? [] : entryEfforts(bare.entry)
      efforts = orderEfforts([...Object.keys(map), ...bareTiers.filter(tier => map[tier] === undefined)])
      effortModels = map
    } else {
      efforts = entryEfforts(factsSource)
    }

    // One advertised level means the gateway narrowed the route to it: that
    // level is the default. A wider set defaults to the strongest rung.
    const onlyLevel = restricted.length === 1 && bare === undefined ? restricted[0]?.effort : undefined
    const defaultEffort = onlyLevel ?? highestEffort(efforts)
    rows.push({
      id: first.base,
      name,
      ...facts,
      ...efforts.length === 0 ? {} : { reasoningEfforts: efforts },
      ...defaultEffort === undefined ? {} : { defaultReasoningEffort: defaultEffort },
      ...effortModels === undefined ? {} : { effortModels },
    })
  }
  rows.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  return rows
}

/** The outbound model facts for one request: the id to send and the effort to send with it. */
export interface WireModelRoute {
  /** `model` value for the gateway request. */
  model: string
  /** `reasoning_effort` value; absent when the level already lives in {@link model}. */
  reasoningEffort?: string
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
export function resolveWireModel(
  row: OmniRouteCatalogModel | undefined,
  model: string,
  effort: string | undefined,
): WireModelRoute {
  if (effort === undefined) return { model }
  const mapped = row?.effortModels?.[effort]
  if (mapped !== undefined && mapped.length > 0) return { model: mapped }
  return { model, reasoningEffort: effort }
}
