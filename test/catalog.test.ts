import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MODEL_EXCLUDE_PATTERNS,
  EFFORT_TOKENS,
  effortSuffixOf,
  highestEffort,
  isNoThinkModel,
  modelNameFromId,
  orderEfforts,
  parseOmniRouteCatalog,
  resolveWireModel,
  servesChat,
} from '../src/catalog.ts'

/** A no-thinking route, as the gateway's `noThinkingAlias` synthesizes it. */
const NO_THINK = 'no-think/vendor/claude-sonnet-4-6'

describe('no-thinking markers', () => {
  it('matches every spelling the gateway and its operators use', () => {
    for (const id of [
      'no-think/vendor/claude-sonnet-4-6',
      'vendor/nothink-model',
      'vendor/no_thinking-model',
      'vendor/no-thinking-model',
      'vendor/notthinking-model',
      'vendor/nonthinking-model',
      'vendor/noReasoning-model',
    ]) {
      expect(isNoThinkModel(id), id).toBe(true)
    }
  })

  it('does not match ids that merely contain the letters', () => {
    for (const id of ['vendor/thinking-model', 'vendor/know-things', 'vendor/northink']) {
      expect(isNoThinkModel(id), id).toBe(false)
    }
  })
})

describe('effort suffixes', () => {
  it('reads only the last segment, and only a known effort token', () => {
    expect(effortSuffixOf('agy/gemini-3.8-flash-high')).toBe('high')
    expect(effortSuffixOf('agy/gpt-oss-120b-medium')).toBe('medium')
    expect(effortSuffixOf('vendor/model-XHIGH')).toBe('xhigh')
    expect(effortSuffixOf('agy/claude-opus-4-6-thinking')).toBeUndefined()
    expect(effortSuffixOf('opencode-go/step-5-preview-free')).toBeUndefined()
    expect(effortSuffixOf('model-')).toBeUndefined()
    expect(effortSuffixOf('thinking')).toBeUndefined()
  })

  it('covers the gateway vocabulary plus the upstream `minimal` tier', () => {
    expect([...EFFORT_TOKENS]).toEqual(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])
  })
})

describe('effort ordering', () => {
  it('ranks weakest-first and keeps unknown tokens last, in order', () => {
    expect(orderEfforts(['max', 'low', 'medium'])).toEqual(['low', 'medium', 'max'])
    expect(orderEfforts(['high', 'weird', 'none', 'other'])).toEqual(['none', 'high', 'weird', 'other'])
    expect(orderEfforts(['low', 'low'])).toEqual(['low'])
  })

  it('picks the strongest known rung as the default', () => {
    expect(highestEffort(['low', 'xhigh', 'medium'])).toBe('xhigh')
    expect(highestEffort(['low', 'unheard-of'])).toBe('low')
    expect(highestEffort([])).toBeUndefined()
  })
})

describe('chat capability filtering', () => {
  it('trusts the listing when it positively rules chat out', () => {
    expect(servesChat({ id: 'a/b' })).toBe(true)
    expect(servesChat({ id: 'a/b', type: 'embedding' })).toBe(false)
    expect(servesChat({ id: 'a/b', type: 'RERANK' })).toBe(false)
    expect(servesChat({ id: 'a/b', supported_endpoints: ['embeddings', 'rerank'] })).toBe(false)
    expect(servesChat({ id: 'a/b', supported_endpoints: ['chat'] })).toBe(true)
    expect(servesChat({ id: 'a/b', supported_endpoints: ['rerank', 'chat'] })).toBe(true)
    // Absent facts are unknown, never a negative.
    expect(servesChat({ id: 'a/b', supported_endpoints: [] })).toBe(true)
  })
})

describe('parseOmniRouteCatalog capability mapping', () => {
  const entry = {
    id: 'vendor/flagship',
    name: 'Vendor Flagship',
    context_length: 1_048_576,
    max_input_tokens: 1_000_000,
    max_output_tokens: 65_536,
    max_tokens: 32_768,
    input_modalities: ['text', 'image', 'pdf'],
    capabilities: { tool_calling: true, vision: true, effort_tiers: ['high', 'low'] },
  }

  it('maps capacities, modalities and flags onto one row', () => {
    const [row] = parseOmniRouteCatalog([entry])
    expect(row).toBeDefined()
    expect(row?.id).toBe('vendor/flagship')
    expect(row?.name).toBe('Vendor Flagship')
    // The combined capacity wins over the input-only one, and the newer output
    // field over OpenAI's older spelling.
    expect(row?.contextWindow).toBe(1_048_576)
    expect(row?.maxTokens).toBe(65_536)
    expect(row?.vision).toBe(true)
    expect(row?.toolCalling).toBe(true)
    expect(row?.reasoningEfforts).toEqual(['low', 'high'])
    expect(row?.defaultReasoningEffort).toBe('high')
  })

  it('falls back to the input-only capacity and the older output spelling', () => {
    const [row] = parseOmniRouteCatalog([
      { id: 'vendor/legacy', max_input_tokens: 128_000, max_tokens: 4_096 },
    ])
    expect(row?.contextWindow).toBe(128_000)
    expect(row?.maxTokens).toBe(4_096)
    expect(row?.vision).toBeUndefined()
    expect(row?.reasoningEfforts).toBeUndefined()
    expect(row?.defaultReasoningEffort).toBeUndefined()
  })

  it('drops non-chat entries by capability fact and by id name', () => {
    const rows = parseOmniRouteCatalog([
      { id: 'sfc/Qwen3-Embedding-8B', type: 'embedding' },
      { id: 'vendor/reranker-pro', capabilities: { tool_calling: false } },
      { id: 'vendor/text-embedding-3-large' },
      { id: 'vendor/chat' },
    ])
    expect(rows.map(row => row.id)).toEqual(['vendor/chat'])
  })

  it('honours a caller-supplied exclude list, including the empty one', () => {
    const entries = [{ id: 'vendor/chat' }, { id: 'vendor/embed-x' }]
    expect(parseOmniRouteCatalog(entries, { excludePatterns: ['embed'] }).map(row => row.id))
      .toEqual(['vendor/chat'])
    expect(parseOmniRouteCatalog(entries, { excludePatterns: [] }).map(row => row.id))
      .toEqual(['vendor/chat', 'vendor/embed-x'])
    expect(DEFAULT_MODEL_EXCLUDE_PATTERNS).toEqual(['embed', 'rerank', 'ranker'])
  })
})

describe('parseOmniRouteCatalog thinking levels', () => {
  it('pins a no-thinking route to `none`, whatever tiers it advertises', () => {
    const [row] = parseOmniRouteCatalog([
      { id: NO_THINK, name: 'no-think/claude-sonnet-4-6', capabilities: { effort_tiers: ['none', 'low', 'high'] } },
    ])
    expect(row?.id).toBe(NO_THINK)
    // The gateway's own label for the alias is kept: it names this exact route.
    expect(row?.name).toBe('no-think/claude-sonnet-4-6')
    expect(row?.reasoningEfforts).toEqual(['none'])
    expect(row?.defaultReasoningEffort).toBe('none')
    expect(row?.effortModels).toBeUndefined()
  })

  it('uses declared tiers when the id encodes no level', () => {
    const [row] = parseOmniRouteCatalog([
      { id: 'command-code/deepseek-v4.1-flash', capabilities: { effort_tiers: ['max', 'none', 'low'] } },
    ])
    expect(row?.id).toBe('command-code/deepseek-v4.1-flash')
    expect(row?.reasoningEfforts).toEqual(['none', 'low', 'max'])
    expect(row?.defaultReasoningEffort).toBe('max')
    expect(row?.effortModels).toBeUndefined()
  })

  it('folds every advertised level of one native model into a single row (case 3)', () => {
    const rows = parseOmniRouteCatalog([
      { id: 'agy/gemini-3.8-flash-high', name: 'Gemini 3.8 Flash (High)', capabilities: { effort_tiers: ['none', 'low', 'medium', 'high', 'xhigh', 'max'] } },
      { id: 'agy/gemini-3.8-flash-low', name: 'Gemini 3.8 Flash (Low)', capabilities: { effort_tiers: ['none', 'low', 'medium', 'high', 'xhigh', 'max'] } },
    ])
    expect(rows).toHaveLength(1)
    const row = rows[0]
    expect(row?.id).toBe('agy/gemini-3.8-flash')
    // The noun phrase comes from the native id: each listed name describes one
    // level only, so neither may label the row.
    expect(row?.name).toBe('Gemini 3.8 Flash[agy]')
    // The suffixes are the evidence; the (fabricated) tier list is ignored.
    expect(row?.reasoningEfforts).toEqual(['low', 'high'])
    expect(row?.defaultReasoningEffort).toBe('high')
    expect(row?.effortModels).toEqual({
      high: 'agy/gemini-3.8-flash-high',
      low: 'agy/gemini-3.8-flash-low',
    })
  })

  it('keeps the single advertised level and its own label (case 2)', () => {
    const [row] = parseOmniRouteCatalog([
      { id: 'agy/gpt-oss-120b-medium', name: 'GPT-OSS 120B (Medium)', capabilities: { effort_tiers: ['none', 'low', 'medium', 'high', 'xhigh', 'max'] } },
    ])
    expect(row?.id).toBe('agy/gpt-oss-120b')
    expect(row?.name).toBe('GPT-OSS 120B (Medium)')
    expect(row?.reasoningEfforts).toEqual(['medium'])
    expect(row?.defaultReasoningEffort).toBe('medium')
    expect(row?.effortModels).toEqual({ medium: 'agy/gpt-oss-120b-medium' })
  })

  it('merges a bare listing with its suffixed siblings', () => {
    const [row] = parseOmniRouteCatalog([
      { id: 'vendor/model', capabilities: { effort_tiers: ['low', 'medium', 'high'] } },
      { id: 'vendor/model-medium', capabilities: { effort_tiers: ['low', 'medium', 'high'] } },
    ])
    expect(row?.id).toBe('vendor/model')
    expect(row?.name).toBe('Model[vendor]')
    // The suffixed id carries `medium`; the bare id keeps the tiers it declares.
    expect(row?.reasoningEfforts).toEqual(['low', 'medium', 'high'])
    expect(row?.defaultReasoningEffort).toBe('high')
    expect(row?.effortModels).toEqual({ medium: 'vendor/model-medium' })
  })

  it('never folds a level into an id that already carries a no-think marker', () => {
    const [row] = parseOmniRouteCatalog([
      { id: 'no-think/vendor/model-high', capabilities: { effort_tiers: ['low', 'high'] } },
    ])
    expect(row?.id).toBe('no-think/vendor/model-high')
    expect(row?.reasoningEfforts).toEqual(['none'])
    expect(row?.effortModels).toBeUndefined()
  })

  it('sorts rows by id and deduplicates repeated advertisements', () => {
    const rows = parseOmniRouteCatalog([
      { id: 'zzz/model' },
      { id: 'aaa/model' },
      { id: 'aaa/model' },
    ])
    expect(rows.map(row => row.id)).toEqual(['aaa/model', 'zzz/model'])
  })

  it('survives malformed entries instead of failing the whole listing', () => {
    const rows = parseOmniRouteCatalog([
      { id: '' },
      { id: 'vendor/ok' },
      { id: 'vendor/bad-context', context_length: -1, max_output_tokens: 1.5 },
    ])
    expect(rows.map(row => row.id)).toEqual(['vendor/bad-context', 'vendor/ok'])
    expect(rows[0]?.contextWindow).toBeUndefined()
    expect(rows[0]?.maxTokens).toBeUndefined()
  })
})

describe('resolveWireModel', () => {
  const folded = {
    id: 'agy/gemini-3.8-flash',
    reasoningEfforts: ['low', 'high'],
    effortModels: { high: 'agy/gemini-3.8-flash-high', low: 'agy/gemini-3.8-flash-low' },
  }

  it('sends the mapped id and no reasoning_effort when the level lives in the id', () => {
    expect(resolveWireModel(folded, folded.id, 'high')).toEqual({ model: 'agy/gemini-3.8-flash-high' })
    expect(resolveWireModel(folded, folded.id, 'low')).toEqual({ model: 'agy/gemini-3.8-flash-low' })
  })

  it('sends the id with reasoning_effort for every other row', () => {
    const tiers = { id: 'command-code/deepseek-v4.1-flash', reasoningEfforts: ['none', 'high'] }
    expect(resolveWireModel(tiers, tiers.id, 'high'))
      .toEqual({ model: 'command-code/deepseek-v4.1-flash', reasoningEffort: 'high' })
    // `none` is an instruction (ask for a no-thinking call), not an omission.
    expect(resolveWireModel(tiers, tiers.id, 'none'))
      .toEqual({ model: 'command-code/deepseek-v4.1-flash', reasoningEffort: 'none' })
  })

  it('passes an uncatalogued model through untouched', () => {
    expect(resolveWireModel(undefined, 'manual/model', undefined)).toEqual({ model: 'manual/model' })
    expect(resolveWireModel(undefined, 'manual/model', 'high'))
      .toEqual({ model: 'manual/model', reasoningEffort: 'high' })
    // A row that does not map this effort falls back to `reasoning_effort`.
    expect(resolveWireModel(folded, folded.id, 'medium'))
      .toEqual({ model: 'agy/gemini-3.8-flash', reasoningEffort: 'medium' })
  })
})

describe('display names', () => {
  it('keeps the existing id-derived naming rules', () => {
    expect(modelNameFromId('deepseek-chat')).toBe('DeepSeek Chat')
    expect(modelNameFromId('zhipu/glm-4-flash')).toBe('GLM 4 Flash[zhipu]')
    expect(modelNameFromId('qwen3-32b')).toBe('Qwen3 32B')
  })
})
