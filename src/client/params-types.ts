/**
 * Host RPC payload shapes for the browser half. Structurally the same as the
 * host's own types (the payload crosses the wire as plain JSON), mirrored here
 * because the browser program is built from `src/client` alone and must not
 * pull host modules into its bundle. `src/group.ts` is the one exception: it is
 * dependency-free display vocabulary both halves share, so the model names the
 * settings page renders and the names the adapter serves are composed by the
 * same code.
 */

/** Supported input kinds the harness declares; this plugin's wire is text-only today. */
export type ModelModality = 'text' | 'image'

/**
 * One catalog row: what the settings page adopts into `models[]` and what the
 * adapter serves. Mirrors the host's `OmniRouteCatalogModel`.
 */
export interface CatalogModel {
  /** Model id the harness selects. For an effort-suffixed route this is the native id, and `effortModels` maps back to the ids the gateway routes. */
  id: string
  /** Selector label. */
  name?: string
  /** Optional selector detail. */
  description?: string
  /** Combined request/response capacity. */
  contextWindow?: number
  /** Per-request output cap. */
  maxTokens?: number
  /** The gateway reports the route accepts images (this wire route is text-only). */
  vision?: boolean
  /** The gateway reports the route accepts tool declarations. */
  toolCalling?: boolean
  /** Supported thinking levels; presence offers the level selector. */
  reasoningEfforts?: string[]
  /** Preset default level; must be one of `reasoningEfforts`. */
  defaultReasoningEffort?: string
  /** Level → gateway model id, for routes that encode the level in the id. */
  effortModels?: Record<string, string>
}

/** Request payload of the `catalog` RPC endpoint. */
export interface CatalogRequest {
  /** Draft gateway base, when the form holds one that is not saved yet. */
  baseURL?: string
  /** Draft credential for this interrogation alone. */
  apiKey?: string
}

/** Response payload of the `catalog` RPC endpoint. */
export interface CatalogResponse {
  models: CatalogModel[]
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
