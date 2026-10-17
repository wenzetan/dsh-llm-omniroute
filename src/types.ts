/**
 * OmniRoute (OpenAI-compatible gateway) chat-completions wire format. Types only.
 *
 * OmniRoute 聚合任意上游模型并统一暴露 OpenAI 协议；本文件即该协议的请求/
 * 响应/流增量形状，不含 DeepSeek 专属字段（thinking / reasoning_effort）。
 *
 * @module dsh-llm-omniroute/types
 */

/** Request body for `POST {baseURL}/chat/completions`. */
export interface WireRequest {
  model: string
  messages: WireMessage[]
  stream: true
  stream_options: { include_usage: true }
  tools?: WireTool[]
  temperature?: number
  max_tokens?: number
  /**
   * Stop sequences (OpenAI `stop`): generation halts as soon as the model
   * produces any one of these strings. Mapped from `GenerateOptions.stop`.
   */
  stop?: string[]
}

/** System-role message: a single string of instructions. */
export interface WireSystemMessage {
  role: 'system'
  content: string
}

/** User-role message: a single string of user input. */
export interface WireUserMessage {
  role: 'user'
  content: string
}

/** Tool-role message: the result of one tool call, keyed by its call id. */
export interface WireToolMessage {
  role: 'tool'
  tool_call_id: string
  content: string
}

/** One entry of the request `messages` array, discriminated on `role`. */
export type WireMessage =
  | WireSystemMessage
  | WireUserMessage
  | WireAssistantMessage
  | WireToolMessage

/**
 * Assistant-role history message. The harness always replays a string
 * `content` — `""` on tool-call-only and reasoning-only turns — because some
 * gateways reject null outright and the live API rejects null-content/
 * no-tool_calls assistant messages with a 400.
 */
export interface WireAssistantMessage {
  role: 'assistant'
  content: string
  /**
   * CoT passback for DeepSeek-family upstreams routed through the gateway:
   * REQUIRED on assistant turns that carried tool calls, ignored elsewhere
   * (omitted there to save tokens). Other OpenAI-compatible upstreams ignore
   * the unknown field.
   */
  reasoning_content?: string
  tool_calls?: WireToolCall[]
}

/** A completed tool call replayed on an assistant history message; `arguments` is the raw JSON string. */
export interface WireToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

/** One entry of the request `tools` array; `parameters` is a JSON Schema object. */
export interface WireTool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

/** One parsed SSE `data:` payload (a chat.completion.chunk). */
export interface WireChunk {
  choices?: WireChoice[]
  /** Arrives attached to the finish chunk and/or as a trailing usage-only chunk. */
  usage?: WireUsage | null
}

/** One streamed choice (requests always ask for a single one); `finish_reason` is non-null only on its terminal chunk. */
export interface WireChoice {
  delta?: WireDelta
  finish_reason?: string | null
}

/** The incremental content of one streamed choice; any subset of fields may be present per chunk. */
export interface WireDelta {
  role?: string
  /** Visible text. Null/empty on reasoning/tool-call chunks. */
  content?: string | null
  /**
   * Thinking CoT, transparently passed through by the gateway for
   * reasoning-capable upstreams (DeepSeek R1 family, etc.). The FIRST chunk
   * may carry an empty string (must not open a reasoning block); absent
   * entirely when the upstream model does not reason.
   */
  reasoning_content?: string | null
  tool_calls?: WireToolCallDelta[]
}

/** A streamed fragment of one tool call; fragments sharing an `index` concatenate into one call. */
export interface WireToolCallDelta {
  /** Disambiguates parallel tool calls; stable across a call's deltas. */
  index: number
  /**
   * Present on the first delta of each call only. Non-conforming gateways
   * repeat it on continuation deltas either as an EMPTY string or as an
   * explicit JSON `null`; the translator only accepts non-empty strings so
   * the real id from the first delta survives (issue #1).
   */
  id?: string | null
  type?: 'function' | null
  function?: {
    /**
     * Present on the first delta of each call only. Non-conforming gateways
     * repeat it on continuation deltas either as an EMPTY string or as an
     * explicit JSON `null`; only non-empty strings are accepted so the
     * tool name survives (issue #1).
     */
    name?: string | null
    /** Argument JSON fragment (concatenate across deltas); gateways occasionally send explicit null. */
    arguments?: string | null
  } | null
}

/**
 * Wire token accounting. `prompt_tokens` INCLUDES cache hits; `mapUsage`
 * subtracts them to keep the harness convention of disjoint counts.
 * `prompt_tokens_details.cached_tokens` is the OpenAI-compat spelling of the
 * hit count (the gateway normalizes upstream variants onto it).
 */
export interface WireUsage {
  prompt_tokens: number
  completion_tokens: number
  total_tokens?: number
  prompt_cache_hit_tokens?: number
  prompt_cache_miss_tokens?: number
  prompt_tokens_details?: { cached_tokens?: number }
  completion_tokens_details?: { reasoning_tokens?: number }
}

/** Non-2xx error body (OpenAI-compatible shape, passed through by the gateway). */
export interface WireError {
  error?: { message?: string; type?: string; code?: string }
}

/** `GET {baseURL}/models` response (OpenAI models.list shape as OmniRoute extends it). */
export interface WireModelList {
  object?: 'list'
  data?: WireModelEntry[]
}

/**
 * Capability object OmniRoute attaches to every advertised entry. Every field
 * is optional: the gateway fills what its provider sync learned, and an
 * unknown value stays absent rather than defaulting to a guess.
 */
export interface WireModelCapabilities {
  /** The route accepts tool declarations. */
  tool_calling?: boolean
  /** The route can reason at all (coarse flag; see `effort_tiers` for levels). */
  reasoning?: boolean
  /** The route accepts image input. */
  vision?: boolean
  /** The gateway advertises thinking control for this route. */
  thinking?: boolean
  /** Provider-sync spelling of {@link thinking}. */
  supportsThinking?: boolean
  /** The route accepts file attachments. */
  attachment?: boolean
  /** The route supports structured output. */
  structured_output?: boolean
  /** The route accepts a temperature. */
  temperature?: boolean
  /**
   * Reasoning levels the gateway advertises. Derived from a whole-provider
   * sync rather than a per-model probe, so it can list levels a specific route
   * rejects — see the catalog module's precedence rules.
   */
  effort_tiers?: string[]
}

/**
 * One advertised model entry. Beyond the OpenAI minimum (an id) OmniRoute
 * discloses capacities, modalities and capabilities, which is what lets this
 * plugin map a model list without a second catalog.
 */
export interface WireModelEntry {
  id: string
  /** Human-readable name when the gateway supplies one. */
  name?: string
  /** OpenAI `owned_by` field when present; OmniRoute uses it for the provider id. */
  owned_by?: string
  /** The id the entry was derived from (a synthesized variant carries its base here). */
  root?: string
  /** Combined request/response capacity. */
  context_length?: number
  /** Input-only capacity, when the listing discloses one separately. */
  max_input_tokens?: number
  /** Per-request output cap. */
  max_output_tokens?: number
  /** OpenAI's older spelling of {@link max_output_tokens}. */
  max_tokens?: number
  /** Accepted input kinds (`text`, `image`, `pdf`, `audio`, `video`, …). */
  input_modalities?: string[]
  /** Produced output kinds. */
  output_modalities?: string[]
  /** OmniRoute capability flags. */
  capabilities?: WireModelCapabilities
  /** Endpoints the route serves (`chat`, `embeddings`, `rerank`, …). */
  supported_endpoints?: string[]
  /** Wire protocol the route speaks. */
  api_format?: string
  /** Model family kind (`embedding`, `rerank`, …); absent for chat models. */
  type?: string
  /** Pricing facts, when the gateway has them. */
  pricing?: Record<string, unknown>
}

/** Request body of `POST {baseURL}/search`. */
export interface WireSearchRequest {
  query: string
  max_results?: number
  /** Pin one gateway search provider; omitted lets the gateway route. */
  provider?: string
}

/** One result row of `POST {baseURL}/search`. */
export interface WireSearchResult {
  title?: string
  url?: string
  snippet?: string
  published_at?: string
}

/** Response body of `POST {baseURL}/search`. */
export interface WireSearchResponse {
  provider?: string
  query?: string
  results?: WireSearchResult[]
  answer?: { text?: string } | null
  errors?: unknown
}

/** Request body of `POST {baseURL}/web/fetch`. */
export interface WireFetchRequest {
  url: string
  /** Extraction format; `markdown` is the plugin default. */
  format?: 'markdown' | 'html' | 'links' | 'screenshot'
  /** Pin one gateway fetch provider; omitted lets the gateway route. */
  provider?: string
  /** Crawl depth for providers that support one. */
  depth?: number
  /** Include provider metadata in the response. */
  include_metadata?: boolean
}

/** Response body of `POST {baseURL}/web/fetch`. */
export interface WireFetchResponse {
  provider?: string
  url?: string
  content?: string
  links?: unknown
  metadata?: Record<string, unknown> | null
  screenshot_url?: string
}

/** Root of `https://models.dev/api.json`: one entry per provider id. */
export interface ModelsDevApi {
  [provider: string]: {
    models?: Record<string, ModelsDevModel>
  }
}

/** Match-shaping hints for the models.dev params lookup. */
export interface ProviderHints {
  /** Family prefix → provider id, consulted before catalog order. */
  defaults?: Record<string, string>
  /** Exact gateway model id → provider id; wins over {@link defaults}. */
  models?: Record<string, string>
}

/** One model entry in the models.dev catalog. */
export interface ModelsDevModel {
  name?: string
  /** Capacity facts: `limit.context` and `limit.output` are token counts. */
  limit?: { context?: number; output?: number }
  /** How the model takes reasoning control; `effort` carries the levels. */
  reasoning_options?: Array<{ type: string; values?: Array<string | null> }>
}

/** One models.dev provider match for a gateway model id. */
export interface ModelsDevMatch {
  /** models.dev provider id the entry lives under (e.g. `qwen`, `alibaba`). */
  provider: string
  /** Human-readable name from the catalog entry, when present. */
  name?: string
  /** Combined request/response context capacity (`limit.context`). */
  contextWindow?: number
  /** Per-request output cap (`limit.output`). */
  maxTokens?: number
  /** Supported reasoning-effort ids (`reasoning_options` type `effort`). */
  reasoningEfforts?: string[]
  /** True when this match's provider is the model's official vendor. */
  official?: boolean
}

/** Request payload of the `models-dev-params` RPC endpoint. */
export interface ModelsDevParamsRequest {
  /** Gateway model ids to look up, verbatim. */
  modelIds: string[]
  /** Forward-proxy URL to route the api.json download through, when enabled. */
  proxyUrl?: string
}

/** Response payload of the `models-dev-params` RPC endpoint. */
export interface ModelsDevParamsResponse {
  /** Per requested id: every provider entry that matched it, in catalog order. */
  models: Array<{ id: string; matches: ModelsDevMatch[] }>
}

/**
 * Request payload of the `catalog` RPC endpoint: the settings form's draft
 * gateway endpoint and one-shot credential. Both are optional — an absent field
 * falls back to the running connection snapshot, so the page can refresh a
 * saved configuration without re-typing the key.
 */
export interface CatalogRequest {
  /** Draft gateway base, when the form holds one that is not saved yet. */
  baseURL?: string
  /** Draft credential for this interrogation alone; the harness never stores it. */
  apiKey?: string
}
