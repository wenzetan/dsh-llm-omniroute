/**
 * The Custom Provider settings section: API key (write-only), gateway base URL,
 * and the model catalog with endpoint interrogation. Pure props — no ctx, no
 * contexts, no subscription machinery; everything arrives through the inject
 * face the apply closure owns (api wire face + bound translate). Styles come
 * from the fiber-scoped `omniroute-*` stylesheet the apply closure injects; it
 * rides the shell's `--dsw-alias-*` tokens, so light and dark themes both
 * render correctly.
 *
 * The model catalog mirrors the official Models page (`ModelListEditor`): one
 * bordered entry per model with id and display name on the row, the token
 * capacities and the thinking-level selector behind the row's own disclosure,
 * K/M-suffixed capacity entry, and per-field text buffers so a count is not
 * rewritten mid-word.
 *
 * A row adopted from the gateway carries capability facts: capacities, image
 * and tool support, the thinking levels, and — when the gateway encodes a level
 * in the model id — the level → model-id map the host sends with instead.
 */
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type {
  RemoteResult,
  SettingsDescribeValue,
  SettingsNamespaceView,
  SettingsPathOpView,
  CredentialInfo,
} from '@deepseek-ai/dsh-api-remotes/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  CatalogModel,
  CatalogRequest,
  CatalogResponse,
  ModelsDevParamsRequest,
  ModelsDevParamsResponse,
} from './params-types.ts'

/**
 * One catalog entry, structurally open like the official editors: a field
 * this card does not edit survives being edited here rather than being
 * dropped by a rebuild.
 */
type ModelDraft = Record<string, unknown>

/** A row's text field, or the empty string when unset or not a string. */
function textOf(model: ModelDraft, key: string): string {
  const value = model[key]
  return typeof value === 'string' ? value : ''
}

/** A row's numeric field, or `undefined` when unset or not a number. */
function numberOf(model: ModelDraft, key: string): number | undefined {
  const value = model[key]
  return typeof value === 'number' ? value : undefined
}

/** The two token counts edited as K/M-suffixed text behind a row's disclosure. */
type CapacityField = 'contextWindow' | 'maxTokens'

/** Accepted capacity spellings: a decimal count with an optional K/M suffix. */
const CAPACITY_PATTERN = /^(\d+(?:\.\d+)?)([km])?$/i

/** Decimal suffix scales — `1M` is 1000K, matching how model capacities are quoted. */
const CAPACITY_SCALE = { k: 1_000, m: 1_000_000 } as const

/**
 * Read a typed capacity, so a user can write `256K` or `1M` instead of
 * counting zeroes. The stored value stays a plain token count.
 * @param text - raw field text.
 * @returns the count; `undefined` when blank (drop), `NaN` when unreadable.
 */
function parseCapacity(text: string): number | undefined {
  const trimmed = text.trim()
  if (trimmed.length === 0) return undefined
  const match = CAPACITY_PATTERN.exec(trimmed)
  if (match === null) return Number.NaN
  const suffix = match[2]?.toLowerCase()
  const scale = suffix === 'k' || suffix === 'm' ? CAPACITY_SCALE[suffix] : 1
  const scaled = Number(match[1]) * scale
  // A decimal multiple is exact in intent but not in binary floating point,
  // so an integral intent snaps back.
  const rounded = Math.round(scaled)
  return Math.abs(scaled - rounded) < 1e-6 ? rounded : scaled
}

/**
 * Spell a stored count back in the shortest form that survives a round trip
 * through {@link parseCapacity}; a count that is not a whole number of
 * thousands stays written out.
 * @param value - stored capacity.
 * @returns the field text.
 */
function formatCapacity(value: number): string {
  if (!Number.isInteger(value) || value <= 0) return String(value)
  if (value % CAPACITY_SCALE.m === 0) return `${String(value / CAPACITY_SCALE.m)}M`
  if (value % CAPACITY_SCALE.k === 0) return `${String(value / CAPACITY_SCALE.k)}K`
  return String(value)
}

/**
 * What an empty capacity field is worth, shown as its placeholder: the
 * adapter's route-level fallback (`defaultContextWindow` 128,000) spelled
 * the way a person would say it. A hint, not a mirror — leaving the field
 * blank keeps the adapter's default.
 */
const CAPACITY_HINT: Readonly<Record<CapacityField, string>> = {
  contextWindow: '128K',
  maxTokens: '8K',
}

/** Disclosure chevron; rotates to point down while its row is open. */
function IconChevron({ open }: { open: boolean }): ReactNode {
  return (
    <svg
      width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden
      style={{ transform: open ? 'rotate(90deg)' : undefined, transition: 'transform 120ms ease' }}
    >
      <path d="M6 3.5L10.5 8L6 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** Removal glyph for one model row. */
function IconTrash(): ReactNode {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M2.5 4h11M6.5 4V2.5h3V4M4 4l.7 9a1 1 0 001 .9h4.6a1 1 0 001-.9L12 4M6.5 6.8v4.4M9.5 6.8v4.4"
        stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  )
}

/** The settings/credentials wire face the apply closure builds over the typert Remote namespaces. */
export interface OmniRouteWire {
  /** Whole-document settings describe (redacted): writability + one view per registered namespace. */
  describeSettings(): Promise<RemoteResult<SettingsDescribeValue>>
  /** Path-op write to one namespace, fenced by the revision the draft read. */
  mutateSettings(
    ns: string,
    ops: SettingsPathOpView[],
    expectedRevision: number | undefined,
  ): Promise<RemoteResult<SettingsNamespaceView>>
  /** Credential state for the given references (values never ride the wire). */
  describeCredentials(refs: string[]): Promise<RemoteResult<Record<string, CredentialInfo>>>
  /** Store one credential literal under its reference. */
  setCredential(ref: string, value: string): Promise<RemoteResult<void>>
}

/** Registration-side inject face: the wire face, the bound translate, and the plugin's host RPC calls. */
export interface OmniRouteSectionInjected {
  api: OmniRouteWire
  /** Host-side models.dev catalog lookup (browser sends ids + proxy only). */
  fetchModelParams: (
    request: ModelsDevParamsRequest,
  ) => Promise<{ ok: true; value: ModelsDevParamsResponse } | { ok: false; error: { message: string } }>
  /**
   * Host-side gateway `/v1/models` interrogation, parsed into adoptable rows.
   * Rides the plugin's own channel rather than `remote.llm.discoverModels`
   * because the rows carry capability facts the harness's discovery shape has
   * no field for (thinking levels, the level → model-id map, vision, tools).
   */
  fetchCatalog: (
    request: CatalogRequest,
  ) => Promise<{ ok: true; value: CatalogResponse } | { ok: false; error: { message: string } }>
}

/** Full component props assembled by the settings slot renderer (locale seat + inject face). */
export type OmniRouteSectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'settings.omniroute'>
  & InjectFace<OmniRouteSectionInjected>

const NS = 'llm-omniroute'
/** Credential reference the host half resolves per request (see apply.ts). */
const KEY_REF = 'omniroute'

/** The proxy text box's default and placeholder (mirrors the host default). */
const DEFAULT_PROXY_URL = 'http://127.0.0.1:7890'

/** Convert a stored section value into editable rows without dropping fields. */
function toDrafts(source: unknown): ModelDraft[] {
  if (!Array.isArray(source)) return []
  return source.map(entry =>
    typeof entry === 'object' && entry !== null && !Array.isArray(entry)
      ? entry as ModelDraft
      : {})
}

/**
 * The highest rung in a row's declared efforts — the dropdown's value when
 * no preset has been chosen yet.
 */
const EFFORT_RUNG: Readonly<Record<string, number>> = {
  max: 7, xhigh: 6, high: 5, medium: 4, low: 3, minimal: 2, none: 1, default: 0,
}

function highestOf(efforts: readonly unknown[]): string {
  const ids = efforts.filter((effort): effort is string => typeof effort === 'string')
  return [...ids].sort((a, b) => (EFFORT_RUNG[b] ?? -1) - (EFFORT_RUNG[a] ?? -1))[0] ?? ''
}

/** A row's effort → model-id map, when it has one. */
function effortModelsOf(model: ModelDraft): Record<string, string> {
  const value = model.effortModels
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  )
}

/**
 * Whether a row's thinking levels come from its model id rather than from an
 * advertised tier list — either because the gateway routes a distinct id per
 * level, or because the id is a no-thinking route pinned to `none`. Such a row
 * is the one case where a models.dev tier list must not overwrite the levels.
 * @param model - one catalog row.
 * @returns true when the level set is id-bound.
 */
function isIdBoundRow(model: ModelDraft): boolean {
  if (Object.keys(effortModelsOf(model)).length > 0) return true
  const efforts = Array.isArray(model.reasoningEfforts) ? model.reasoningEfforts : []
  return efforts.length === 1 && efforts[0] === 'none'
}

/** The label one level shows in the selector; `none` reads as a word, not a token. */
function effortLabel(effort: string, noneLabel: string): string {
  return effort === 'none' ? noneLabel : effort
}

/** One row's capability summary, e.g. `图片输入 · 工具调用`. */
function capabilitySummary(model: ModelDraft, labels: { vision: string; tools: string; none: string }): string {
  const parts: string[] = []
  if (model.vision === true) parts.push(labels.vision)
  if (model.toolCalling === true) parts.push(labels.tools)
  return parts.length > 0 ? parts.join(' · ') : labels.none
}

/** Buffer key for one capacity field; the row half moves when rows do. */
function bufferKey(index: number, field: CapacityField): string {
  return `${String(index)}:${field}`
}

/**
 * Render the OmniRoute settings section.
 * @param props - the wire face and the bound translate.
 * @returns the section.
 */
export function OmniRouteSection(props: OmniRouteSectionProps): ReactNode {
  const { api, t, fetchModelParams, fetchCatalog } = props
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorText, setErrorText] = useState<string | undefined>(undefined)
  const [revision, setRevision] = useState<number>(0)
  const [writable, setWritable] = useState(true)
  const [keyConfigured, setKeyConfigured] = useState<boolean | undefined>(undefined)
  /** Whether the credential seam reports the key reference read-only (launch environment). */
  const [keyLocked, setKeyLocked] = useState(false)
  const [baseURL, setBaseURL] = useState('')
  const [keyDraft, setKeyDraft] = useState('')
  const [models, setModels] = useState<ModelDraft[]>([])
  // Rows carry an id and a name; capacities stay folded behind the row's own
  // disclosure rather than crowding every row with four inputs.
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set())
  // Capacities are edited as text, so a field's keystrokes are held here
  // rather than re-derived from the parsed count on every change — that
  // would rewrite `1000` to `1K` mid-word. One entry per field: a single
  // buffer would be displaced by editing any other field.
  const [editing, setEditing] = useState<ReadonlyMap<string, string>>(new Map())
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | undefined>(undefined)
  const [candidates, setCandidates] = useState<readonly CatalogModel[] | undefined>(undefined)
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set())
  /** Proxy draft for the models.dev download; persisted with the section. */
  const [proxyEnabled, setProxyEnabled] = useState(false)
  const [proxyUrl, setProxyUrl] = useState<string>(DEFAULT_PROXY_URL)
  /** models.dev lookup result the params panel resolves against. */
  const [params, setParams] = useState<ModelsDevParamsResponse | undefined>(undefined)
  /** Chosen match index per model id, for ids with several providers. */
  const [paramChoices, setParamChoices] = useState<ReadonlyMap<string, number>>(new Map())
  const [paramsBusy, setParamsBusy] = useState(false)
  /** The result panel, scrolled into view when a lookup lands. */
  const paramsRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // Feedback that the lookup finished: the panel may render below the
    // fold behind a long model list, so bring it to the user. The optional
    // call keeps non-browser test environments safe.
    paramsRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' })
  }, [params])
  /** The fetched-model panel, scrolled into view when a fetch lands. */
  const candidatesRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // Same reason as the models.dev panel: the picker renders below every
    // configured row, so without this the fetch would look like a no-op.
    candidatesRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' })
  }, [candidates])

  const load = async (): Promise<void> => {
    setStatus('loading')
    setErrorText(undefined)
    try {
      const described = await api.describeSettings()
      if (!described.ok) {
        setErrorText(described.error.message)
        setStatus('error')
        return
      }
      setWritable(described.value.writable)
      const section = described.value.namespaces.find((entry: SettingsNamespaceView) => entry.ns === NS)
      if (section === undefined) {
        setErrorText(t('nsNotRegistered'))
        setStatus('error')
        return
      }
      const value = (section.value ?? {}) as Record<string, unknown>
      setRevision(section.revision)
      setBaseURL(typeof value.baseURL === 'string' ? value.baseURL : '')
      setModels(toDrafts(value.models))
      const proxy = (value.proxy ?? {}) as { enabled?: unknown; url?: unknown }
      setProxyEnabled(proxy.enabled === true)
      if (typeof proxy.url === 'string' && proxy.url.length > 0) setProxyUrl(proxy.url)
      setExpanded(new Set())
      setEditing(new Map())
      const credential = await api.describeCredentials([KEY_REF])
      if (credential.ok) {
        const view = credential.value[KEY_REF]
        setKeyConfigured(view?.configured)
        setKeyLocked(view?.writable === false)
      }
      setStatus('ready')
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : String(error))
      setStatus('error')
    }
  }

  // The section interrogates the settings plane once on mount: the page the
  // slot renders must show the stored configuration, not an eternal ellipsis.
  useEffect(() => { void load() }, [])

  const saved = (text: string): void => {
    setNotice(text)
    void load()
  }

  /**
   * Refuse the save with a localized message when a row cannot be written:
   * an empty or duplicate id, or capacity text that does not parse. The host
   * re-judges the same constraints at the write; this names the row first.
   */
  const catalogProblem = (): string | undefined => {
    const seen = new Set<string>()
    for (const [index, model] of models.entries()) {
      const id = textOf(model, 'id').trim()
      if (id.length === 0) return `${t('modelIdRequired')} (${t('models')} ${String(index + 1)})`
      if (seen.has(id)) return `${t('modelIdDuplicate')} (${id})`
      seen.add(id)
      for (const field of ['contextWindow', 'maxTokens'] as const) {
        const buffer = editing.get(bufferKey(index, field))
        if (buffer !== undefined && Number.isNaN(parseCapacity(buffer) ?? 0)) {
          return `${t('capacityInvalid')} (${id} · ${t(field)})`
        }
      }
    }
    return undefined
  }

  const save = async (): Promise<void> => {
    const problem = catalogProblem()
    if (problem !== undefined) {
      setErrorText(problem)
      return
    }
    setBusy(true)
    setNotice(undefined)
    setErrorText(undefined)
    try {
      const trimmedBase = baseURL.trim()
      const ops: SettingsPathOpView[] = []
      if (trimmedBase.length > 0) ops.push({ op: 'set', path: ['baseURL'], value: trimmedBase })
      else ops.push({ op: 'unset', path: ['baseURL'] })
      ops.push({
        op: 'set',
        path: ['proxy'],
        value: { enabled: proxyEnabled, url: proxyUrl.trim().length > 0 ? proxyUrl.trim() : DEFAULT_PROXY_URL },
      })
      ops.push({
        op: 'set',
        path: ['models'],
        value: models.map(model => {
          const id = textOf(model, 'id').trim()
          const name = textOf(model, 'name').trim()
          const contextWindow = numberOf(model, 'contextWindow')
          const maxTokens = numberOf(model, 'maxTokens')
          const efforts = Array.isArray(model.reasoningEfforts)
            ? model.reasoningEfforts.filter((effort): effort is string => typeof effort === 'string' && effort.length > 0)
            : []
          const preset = typeof model.defaultReasoningEffort === 'string'
            && efforts.includes(model.defaultReasoningEffort)
            ? model.defaultReasoningEffort
            : undefined
          // Only levels the row declares survive the write: the host's schema
          // refuses a map entry that could never be selected.
          const effortModels = Object.fromEntries(
            Object.entries(effortModelsOf(model)).filter(([effort]) => efforts.includes(effort)),
          )
          return {
            id,
            ...name.length > 0 ? { name } : {},
            ...contextWindow !== undefined ? { contextWindow } : {},
            ...maxTokens !== undefined ? { maxTokens } : {},
            ...model.vision === true ? { vision: true } : {},
            ...typeof model.toolCalling === 'boolean' ? { toolCalling: model.toolCalling } : {},
            ...efforts.length > 0 ? { reasoningEfforts: efforts } : {},
            ...preset !== undefined ? { defaultReasoningEffort: preset } : {},
            ...Object.keys(effortModels).length > 0 ? { effortModels } : {},
          }
        }),
      })
      const mutated = await api.mutateSettings(NS, ops, revision)
      if (!mutated.ok) {
        setErrorText(mutated.error.message)
        return
      }
      setRevision(mutated.value.revision)
      const key = keyDraft.trim()
      if (key.length > 0) {
        const stored = await api.setCredential(KEY_REF, key)
        if (!stored.ok) {
          setErrorText(stored.error.message)
          return
        }
        setKeyDraft('')
      }
      saved(t('saved'))
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const fetchModels = async (): Promise<void> => {
    setBusy(true)
    setErrorText(undefined)
    setCandidates(undefined)
    try {
      const key = keyDraft.trim()
      // The plugin's own host channel, not `remote.llm.discoverModels`: the
      // rows must carry the capability facts an adoption persists (thinking
      // levels, the level → model-id map, vision, tools) that the harness's
      // discovery shape has no field for. The host does the network work, so
      // no cross-origin request happens here.
      const response = await fetchCatalog({
        ...baseURL.trim().length > 0 ? { baseURL: baseURL.trim() } : {},
        ...key.length > 0 ? { apiKey: key } : {},
      })
      if (!response.ok) {
        setErrorText(`${t('fetchFailed')}: ${response.error.message}`)
        return
      }
      // Sorted by id regardless of what the host answered, so the picker and
      // the rows it produces read the same way on every fetch.
      const found = [...response.value.models]
      found.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
      if (found.length === 0) {
        setErrorText(t('fetchEmpty'))
        return
      }
      // Everything already configured starts unchecked, so adopting a
      // selection never silently rewrites a capacity the user corrected.
      const known = new Set(models.map(model => textOf(model, 'id')))
      setCandidates(found)
      setPicked(new Set(found.filter(model => !known.has(model.id)).map(model => model.id)))
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const adopt = (): void => {
    if (candidates === undefined) return
    const existing = new Map(models.map(model => [textOf(model, 'id'), model]))
    for (const candidate of candidates) {
      if (!picked.has(candidate.id)) continue
      // A row the user already tuned wins over the gateway's own numbers.
      if (existing.has(candidate.id)) continue
      existing.set(candidate.id, {
        id: candidate.id,
        ...candidate.name === undefined ? {} : { name: candidate.name },
        ...candidate.contextWindow === undefined ? {} : { contextWindow: candidate.contextWindow },
        ...candidate.maxTokens === undefined ? {} : { maxTokens: candidate.maxTokens },
        ...candidate.vision === true ? { vision: true } : {},
        ...typeof candidate.toolCalling === 'boolean' ? { toolCalling: candidate.toolCalling } : {},
        ...candidate.reasoningEfforts === undefined || candidate.reasoningEfforts.length === 0
          ? {}
          : { reasoningEfforts: [...candidate.reasoningEfforts] },
        ...candidate.defaultReasoningEffort === undefined
          ? {}
          : { defaultReasoningEffort: candidate.defaultReasoningEffort },
        ...candidate.effortModels === undefined ? {} : { effortModels: { ...candidate.effortModels } },
      })
    }
    // The form keeps id order after an adoption: new and old rows merge
    // into one alphabetized list instead of new rows appending at the end.
    // Rows whose id is still empty are not yet models and stay at the bottom.
    setModels([...existing.values()].sort((a, b) => {
      const ai = textOf(a, 'id').trim()
      const bi = textOf(b, 'id').trim()
      if (ai.length === 0) return bi.length === 0 ? 0 : 1
      if (bi.length === 0) return -1
      return ai < bi ? -1 : ai > bi ? 1 : 0
    }))
    setCandidates(undefined)
    setPicked(new Set())
  }

  const toggle = (id: string): void => {
    setPicked(current => {
      const next = new Set(current)
      if (!next.delete(id)) next.add(id)
      return next
    })
  }

  // The picker's master box is a shortcut for clicking every row: it is fully
  // checked when the whole fetched list is picked and partial otherwise.
  // Rows that are already configured participate like any other — they stay
  // out of the initial selection, but ticking them is harmless because
  // `adopt` skips ids the form already holds.
  const allPicked = candidates !== undefined && candidates.length > 0
    && candidates.every(model => picked.has(model.id))
  const somePicked = candidates !== undefined && candidates.some(model => picked.has(model.id))

  /** Match every row to the master box: pick all when not all are picked, else clear. */
  const toggleAll = (): void => {
    if (candidates === undefined) return
    setPicked(allPicked ? new Set() : new Set(candidates.map(model => model.id)))
  }

  // `indeterminate` is a DOM property with no JSX equivalent, so it is synced
  // onto the node after each render.
  const selectAllRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (selectAllRef.current !== null) selectAllRef.current.indeterminate = somePicked && !allPicked
  }, [somePicked, allPicked])

  /** Ask the host (via the RPC face) what models.dev knows about the rows. */
  const updateParams = async (): Promise<void> => {
    const ids = models.map(model => textOf(model, 'id').trim()).filter(id => id.length > 0)
    if (ids.length === 0) {
      setErrorText(t('paramsNoModels'))
      return
    }
    setParamsBusy(true)
    setErrorText(undefined)
    setParams(undefined)
    try {
      const response = await fetchModelParams({
        modelIds: ids,
        ...proxyEnabled && proxyUrl.trim().length > 0 ? { proxyUrl: proxyUrl.trim() } : {},
      })
      if (!response.ok) {
        setErrorText(response.error.message)
        return
      }
      setParams(response.value)
      setParamChoices(new Map())
      // Completion feedback next to the action, not only in the panel the
      // user may have to hunt for: matched/unmatched counts as a status line.
      const matched = response.value.models.filter(entry => entry.matches.length > 0).length
      setNotice(
        t('paramsSummary')
          .replace('{matched}', String(matched))
          .replace('{unmatched}', String(response.value.models.length - matched)),
      )
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : String(error))
    } finally {
      setParamsBusy(false)
    }
  }

  /** The match a panel row currently shows: the user's choice, else the first. */
  const chosenMatch = (entry: { id: string; matches: ModelsDevParamsResponse['models'][number]['matches'] }) =>
    entry.matches[paramChoices.get(entry.id) ?? 0] ?? entry.matches[0]

  /**
   * Apply the panel's chosen matches to the rows: overwrite mode replaces
   * the capacities the catalog provides; blank mode only fills empty fields.
   * Ids with no match keep their stored values.
   * @param overwrite - whether existing values are replaced.
   */
  const applyParams = (overwrite: boolean): void => {
    if (params === undefined) return
    const byId = new Map(params.models.map(entry => [entry.id, entry]))
    let touched = 0
    const next = models.map(model => {
      const id = textOf(model, 'id').trim()
      const entry = byId.get(id)
      const match = entry === undefined || entry.matches.length === 0 ? undefined : chosenMatch(entry)
      if (match === undefined) return model
      const nextContext = match.contextWindow
      const nextMax = match.maxTokens
      const nextEfforts = match.reasoningEfforts
      const currentContext = numberOf(model, 'contextWindow')
      const currentMax = numberOf(model, 'maxTokens')
      const hasEfforts = Array.isArray(model.reasoningEfforts)
      // A models.dev tier list is a whole-family guess. When the gateway
      // encoded this row's levels in the model id (`-high` variants) or pinned
      // it to none (a `no-think/...` route), that evidence is stronger and the
      // panel must not overwrite it — the row would start offering levels the
      // gateway rejects.
      const idBound = isIdBoundRow(model)
      const takeContext = nextContext !== undefined && (overwrite || currentContext === undefined)
      const takeMax = nextMax !== undefined && (overwrite || currentMax === undefined)
      const takeEfforts = !idBound && nextEfforts !== undefined && nextEfforts.length > 0
        && (overwrite || !hasEfforts)
      if (!takeContext && !takeMax && !takeEfforts) return model
      touched += 1
      return {
        ...model,
        ...takeContext && nextContext !== undefined ? { contextWindow: nextContext } : {},
        ...takeMax && nextMax !== undefined ? { maxTokens: nextMax } : {},
        ...takeEfforts && nextEfforts !== undefined ? { reasoningEfforts: nextEfforts } : {},
        // A replaced tier list invalidates a preset that named the old one.
        ...takeEfforts ? { defaultReasoningEffort: highestOf(nextEfforts ?? []) } : {},
      }
    })
    setModels(next)
    setParams(undefined)
    setParamChoices(new Map())
    setNotice(`${t('paramsApplied')} (${String(touched)})`)
  }

  /** Replace one row, dropping optional fields the edit emptied. */
  const patch = (index: number, next: Record<string, string | number | undefined>): void => {
    setModels(current => current.map((model, at) => {
      if (at !== index) return model
      const cleared = new Set(
        Object.entries(next).filter(([, value]) => value === undefined || value === '').map(([key]) => key),
      )
      return Object.fromEntries(
        Object.entries({ ...model, ...next }).filter(([key]) => !cleared.has(key)),
      )
    }))
  }

  const toggleExpanded = (index: number): void => {
    setExpanded(current => {
      const next = new Set(current)
      if (!next.delete(index)) next.add(index)
      return next
    })
  }

  /** What a capacity field shows: the buffer while typing, else the stored count. */
  const capacityText = (model: ModelDraft, index: number, field: CapacityField): string =>
    editing.get(bufferKey(index, field))
      ?? (numberOf(model, field) === undefined ? '' : formatCapacity(numberOf(model, field) as number))

  const editCapacity = (index: number, field: CapacityField, text: string): void => {
    setEditing(current => new Map(current).set(bufferKey(index, field), text))
    patch(index, { [field]: parseCapacity(text) })
  }

  /** Drop one row's entries and shift the rows after it down, in one pass. */
  const reindexOnRemove = (current: ReadonlyMap<string, string>, index: number): Map<string, string> => {
    const next = new Map<string, string>()
    for (const [key, value] of current) {
      const at = Number(key.slice(0, key.indexOf(':')))
      if (at === index) continue
      // Only the row number moves; the field half of the key is untouched.
      next.set(at > index ? key.replace(/^\d+/, String(at - 1)) : key, value)
    }
    return next
  }

  const removeModel = (index: number): void => {
    setModels(current => current.filter((_model, at) => at !== index))
    // Both stores are keyed by position, so every row after this one shifts
    // down and would otherwise inherit its neighbour's state.
    setExpanded(current => {
      const next = new Set<number>()
      for (const at of current) {
        if (at < index) next.add(at)
        else if (at > index) next.add(at - 1)
      }
      return next
    })
    setEditing(current => reindexOnRemove(current, index))
  }

  if (status === 'loading') return <section className="omniroute-section" aria-label={t('nav')}><p className="omniroute-hint">…</p></section>
  if (status === 'error') {
    return (
      <section className="omniroute-section" aria-label={t('nav')}>
        <p className="omniroute-error">{`${t('loadFailed')}: ${errorText ?? ''}`}</p>
        <button type="button" className="omniroute-button omniroute-submit" onClick={() => { void load() }}>{t('retry')}</button>
      </section>
    )
  }

  return (
    <section className="omniroute-section" aria-label={t('nav')}>
      <p className="omniroute-intro">{t('intro')}</p>
      {notice === undefined ? null : <p className="omniroute-notice" role="status">{notice}</p>}
      {!writable ? <p className="omniroute-notice">{t('readOnly')}</p> : null}
      {errorText === undefined ? null : <p className="omniroute-error">{errorText}</p>}

      <div className="omniroute-field">
        <label htmlFor="omniroute-key">{t('keyInput')}</label>
        {/* The official ProviderEditor credential pattern: a read-only
            credential (launch environment) locks the input and the
            placeholder states the fact; no separate hint paragraph. */}
        <input
          id="omniroute-key" type="password" autoComplete="off" className="omniroute-input"
          disabled={keyLocked}
          placeholder={keyLocked
            ? t('keyEnvLocked')
            : keyConfigured === true ? t('keyStored') : keyConfigured === false ? t('keyMissing') : t('keyPlaceholder')}
          value={keyDraft}
          onChange={(event) => { setKeyDraft(event.target.value) }}
        />
      </div>

      <div className="omniroute-field">
        <label htmlFor="omniroute-base">{t('baseUrl')}</label>
        <input
          id="omniroute-base" type="text" className="omniroute-input" placeholder={t('baseUrlPlaceholder')}
          value={baseURL}
          onChange={(event) => { setBaseURL(event.target.value) }}
        />
      </div>

      <section className="omniroute-catalog" aria-label={t('models')}>
        <div className="omniroute-catalog-head">
          <span className="omniroute-catalog-title">{t('models')}</span>
          <div className="omniroute-catalog-actions">
            <button type="button" className="omniroute-linkbutton" disabled={busy} onClick={() => { void fetchModels() }}>
              {busy ? t('fetching') : t('fetchModels')}
            </button>
            <button type="button" className="omniroute-linkbutton" disabled={paramsBusy} onClick={() => { void updateParams() }}>
              {paramsBusy ? t('paramsFetching') : t('updateParams')}
            </button>
            {/* Same state semantics as the per-row delete glyph, applied to
                every row at once: the merged position-keyed stores reset too,
                so no stale disclosure or buffer survives into new rows. */}
            <button type="button" className="omniroute-linkbutton" disabled={busy || models.length === 0} onClick={() => {
              setModels([])
              setExpanded(new Set())
              setEditing(new Map())
              setParams(undefined)
              setParamChoices(new Map())
            }}>
              {t('clearModels')}
            </button>
          </div>
        </div>
        <div className="omniroute-proxyrow">
          <label>
            <input
              type="checkbox" checked={proxyEnabled}
              aria-label={t('proxyToggle')}
              onChange={(event) => { setProxyEnabled(event.target.checked) }}
            />
            {t('proxyToggle')}
          </label>
          {proxyEnabled
            ? (
              <input
                className="omniroute-input" type="text"
                aria-label={t('proxyUrl')} placeholder={DEFAULT_PROXY_URL}
                value={proxyUrl}
                onChange={(event) => { setProxyUrl(event.target.value) }}
              />
            )
            : null}
        </div>
        <p className="omniroute-hint">{t('proxyHint')}</p>
        {models.length === 0 ? <p className="omniroute-empty">{t('modelsEmpty')}</p> : null}
        {models.map((model, index) => (
          <div key={index} className="omniroute-entry">
            <div className="omniroute-modelrow">
              <input
                className="omniroute-input" type="text" value={textOf(model, 'id')}
                placeholder={t('modelId')} aria-label={`${t('modelId')} ${String(index + 1)}`}
                onChange={(event) => { patch(index, { id: event.target.value }) }}
              />
              <input
                className="omniroute-input" type="text" value={textOf(model, 'name')}
                placeholder={t('modelName')} aria-label={`${t('modelName')} ${String(index + 1)}`}
                onChange={(event) => { patch(index, { name: event.target.value === '' ? undefined : event.target.value }) }}
              />
              <button
                type="button" className="omniroute-iconbutton"
                aria-label={`${t('modelAdvanced')} ${String(index + 1)}`}
                aria-expanded={expanded.has(index)}
                title={t('modelAdvanced')}
                onClick={() => { toggleExpanded(index) }}
              >
                <IconChevron open={expanded.has(index)} />
              </button>
              <button
                type="button" className="omniroute-iconbutton omniroute-iconbutton--danger"
                aria-label={`${t('removeModel')} ${String(index + 1)}`}
                title={t('removeModel')}
                onClick={() => { removeModel(index) }}
              >
                <IconTrash />
              </button>
            </div>
            {expanded.has(index)
              ? (
                <div className="omniroute-modeladvanced">
                  <label className="omniroute-modelfield">
                    <span className="omniroute-modelfield-label">{t('contextWindow')}</span>
                    <input
                      className="omniroute-input" type="text" inputMode="numeric"
                      value={capacityText(model, index, 'contextWindow')}
                      placeholder={CAPACITY_HINT.contextWindow}
                      aria-label={`${t('contextWindow')} ${String(index + 1)}`}
                      onChange={(event) => { editCapacity(index, 'contextWindow', event.target.value) }}
                    />
                  </label>
                  <label className="omniroute-modelfield">
                    <span className="omniroute-modelfield-label">{t('maxTokens')}</span>
                    <input
                      className="omniroute-input" type="text" inputMode="numeric"
                      value={capacityText(model, index, 'maxTokens')}
                      placeholder={CAPACITY_HINT.maxTokens}
                      aria-label={`${t('maxTokens')} ${String(index + 1)}`}
                      onChange={(event) => { editCapacity(index, 'maxTokens', event.target.value) }}
                    />
                  </label>
                  {Array.isArray(model.reasoningEfforts) && model.reasoningEfforts.length > 0
                    ? (
                      <label className="omniroute-modelfield">
                        <span className="omniroute-modelfield-label">{t('modelReasoning')}</span>
                        <select
                          className="omniroute-select"
                          aria-label={`${t('defaultEffort')} ${String(index + 1)}`}
                          title={t('defaultEffortHint')}
                          value={typeof model.defaultReasoningEffort === 'string'
                            && model.reasoningEfforts.includes(model.defaultReasoningEffort)
                            ? model.defaultReasoningEffort
                            : highestOf(model.reasoningEfforts)}
                          onChange={(event) => {
                            patch(index, { defaultReasoningEffort: event.target.value })
                          }}
                        >
                          {model.reasoningEfforts.map((effort) => (
                            <option key={effort} value={effort}>{effortLabel(effort, t('effortNone'))}</option>
                          ))}
                        </select>
                      </label>
                    )
                    : null}
                </div>
              )
              : null}
            {expanded.has(index)
              ? (
                <div className="omniroute-modelnotes">
                  <p className="omniroute-hint">
                    {`${capabilitySummary(model, {
                      vision: t('capabilityVision'),
                      tools: t('capabilityToolCalling'),
                      none: t('capabilityNone'),
                    })}`}
                  </p>
                  {Object.keys(effortModelsOf(model)).length > 0
                    ? (
                      <p className="omniroute-hint">
                        {`${t('effortIdBound')} · ${t('effortIdBoundHint')}`}
                        <br />
                        {Object.entries(effortModelsOf(model))
                          .map(([effort, wireModel]) => t('effortMapRow')
                            .replace('{effort}', effortLabel(effort, t('effortNone')))
                            .replace('{model}', wireModel))
                          .join(' · ')}
                      </p>
                    )
                    : isIdBoundRow(model)
                      ? <p className="omniroute-hint">{t('effortIdBound')}</p>
                      : Array.isArray(model.reasoningEfforts) && model.reasoningEfforts.length > 0
                        ? <p className="omniroute-hint">{t('effortFromTiers')}</p>
                        : null}
                </div>
              )
              : null}
          </div>
        ))}
        <button
          type="button" className="omniroute-addmodel"
          disabled={busy}
          onClick={() => { setModels(current => [...current, { id: '' }]) }}
        >
          {t('addModel')}
        </button>
      </section>

      {candidates === undefined ? null : (
        <div className="omniroute-candidates" ref={candidatesRef}>
          <div className="omniroute-candidates-head">
            <strong className="omniroute-params-title">{t('fetchTitle')}</strong>
            <label>
              <input
                ref={selectAllRef} type="checkbox" checked={allPicked}
                aria-label={t('fetchSelectAll')}
                onChange={toggleAll}
              />
              {' '}
              {t('fetchSelectAll')}
            </label>
          </div>
          <ul>
            {candidates.map(model => (
              <li key={model.id}>
                <label>
                  <input
                    type="checkbox" checked={picked.has(model.id)}
                    onChange={() => { toggle(model.id) }}
                  />
                  {' '}
                  {model.id}{model.name === undefined || model.name === model.id ? '' : ` (${model.name})`}
                  {model.reasoningEfforts === undefined || model.reasoningEfforts.length === 0
                    ? ''
                    : ` · ${t('modelReasoning')}: ${model.reasoningEfforts.map(effort => effortLabel(effort, t('effortNone'))).join('/')}`}
                  {model.contextWindow === undefined ? '' : ` · ${t('contextWindow')} ${formatCapacity(model.contextWindow)}`}
                  {model.vision === true ? ` · ${t('capabilityVision')}` : ''}
                  {model.toolCalling === false ? '' : model.toolCalling === true ? ` · ${t('capabilityToolCalling')}` : ''}
                </label>
              </li>
            ))}
          </ul>
          <div className="omniroute-candidates-footer">
            <button type="button" className="omniroute-button omniroute-button--primary" disabled={picked.size === 0} onClick={adopt}>
              {t('fetchAdopt')}
            </button>
            <button type="button" className="omniroute-button" onClick={() => { setCandidates(undefined); setPicked(new Set()) }}>
              {t('fetchCancel')}
            </button>
          </div>
        </div>
      )}

      {params === undefined ? null : (
        <div className="omniroute-params" ref={paramsRef}>
          <strong className="omniroute-params-title">{t('paramsTitle')}</strong>
          <p className="omniroute-params-summary">{
            t('paramsSummary')
              .replace('{matched}', String(params.models.filter(entry => entry.matches.length > 0).length))
              .replace('{unmatched}', String(params.models.filter(entry => entry.matches.length === 0).length))
          }</p>
          {params.models.map(entry => {
            // A row whose levels the gateway encoded in its model id keeps them:
            // say so on the row, so a hit that "does nothing" reads as intent
            // rather than a silent failure.
            const row = models.find(model => textOf(model, 'id').trim() === entry.id)
            const idBoundNote = row !== undefined && isIdBoundRow(row)
              ? <span className="omniroute-params-unmatched">{t('paramsIdBoundSkipped')}</span>
              : <span />
            if (entry.matches.length === 0) {
              return (
                <div key={entry.id} className="omniroute-params-row">
                  <span className="omniroute-params-id">{entry.id}</span>
                  <span className="omniroute-params-unmatched">{t('paramsUnmatched')}</span>
                  <span />
                </div>
              )
            }
            if (entry.matches.length === 1) {
              const match = entry.matches[0]
              if (match === undefined) return null
              return (
                <div key={entry.id} className="omniroute-params-row">
                  <span className="omniroute-params-id">{entry.id}</span>
                  <span className="omniroute-params-values">
                    {`${match.official === true ? `${t('officialMark')} · ` : ''}${match.provider} · ${t('contextWindow')} ${match.contextWindow ?? '—'} / ${t('maxTokens')} ${match.maxTokens ?? '—'}${match.reasoningEfforts !== undefined && match.reasoningEfforts.length > 0 ? ` · ${t('modelReasoning')}: ${match.reasoningEfforts.join('/')}` : ''}`}
                  </span>
                  {idBoundNote}
                </div>
              )
            }
            const chosen = paramChoices.get(entry.id) ?? 0
            const match = entry.matches[chosen] ?? entry.matches[0]
            if (match === undefined) return null
            return (
              <div key={entry.id} className="omniroute-params-row">
                <span className="omniroute-params-id">{entry.id}</span>
                <select
                  className="omniroute-select" aria-label={`${t('paramsProvider')} ${entry.id}`}
                  value={String(chosen)}
                  onChange={(event) => {
                    setParamChoices(current => new Map(current).set(entry.id, Number(event.target.value)))
                  }}
                >
                  {entry.matches.map((candidate, at) => (
                    <option key={candidate.provider} value={String(at)}>
                      {`${candidate.official === true ? `${t('officialMark')} · ` : ''}${candidate.provider}: ${t('contextWindow')} ${candidate.contextWindow ?? '—'} / ${t('maxTokens')} ${candidate.maxTokens ?? '—'}${candidate.reasoningEfforts !== undefined && candidate.reasoningEfforts.length > 0 ? ` · ${t('modelReasoning')}: ${candidate.reasoningEfforts.join('/')}` : ''}`}
                    </option>
                  ))}
                </select>
                {idBoundNote}
              </div>
            )
          })}
          <div className="omniroute-params-actions">
            <button type="button" className="omniroute-button omniroute-button--primary" onClick={() => { applyParams(true) }}>
              {t('paramsOverwrite')}
            </button>
            <button type="button" className="omniroute-button" onClick={() => { applyParams(false) }}>
              {t('paramsFillBlank')}
            </button>
            <button type="button" className="omniroute-button" onClick={() => { setParams(undefined); setParamChoices(new Map()) }}>
              {t('fetchCancel')}
            </button>
          </div>
        </div>
      )}

      <p className="omniroute-hint">{t('modelHint')}</p>

      <button type="button" className="omniroute-button omniroute-button--primary omniroute-submit" disabled={busy || !writable} onClick={() => { void save() }}>
        {busy ? t('applying') : t('apply')}
      </button>
    </section>
  )
}
