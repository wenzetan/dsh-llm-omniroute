// @vitest-environment jsdom
/**
 * OmniRouteSection behavior over a scripted wire face. These tests assert
 * user-visible outcomes (fields rendered, calls made) — never React internals.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SECTION_CSS } from '../../src/client/apply.ts'
import { OmniRouteSection } from '../../src/client/OmniRouteSection.tsx'
import { en } from '../../src/client/locale.ts'

afterEach(cleanup)

const t = (key: keyof typeof en): string => en[key]

describe('section layout contract', () => {
  it('gives every paragraph a class so the section stylesheet owns its spacing', async () => {
    const api = wireFace()
    const { container } = render(<OmniRouteSection api={api as never} t={t} />)
    await waitFor(() => { expect(screen.getByLabelText(t('baseUrl'))).toBeTruthy() })

    const section = container.querySelector('section.omniroute-section')
    expect(section).not.toBeNull()
    expect(section?.querySelector('.omniroute-intro')?.textContent).toBe(t('intro'))
    // 裸段落会带上浏览器默认外边距，让每个文本块比自己的内容更高、间距不均。
    const paragraphs = [...(section?.querySelectorAll('p') ?? [])]
    expect(paragraphs.length).toBeGreaterThan(0)
    for (const paragraph of paragraphs) {
      expect(paragraph.className, `<p> without a class: ${paragraph.textContent ?? ''}`).not.toBe('')
    }
  })

  it('keeps the layout rules the live host recipes depend on', () => {
    // 这些数值来自运行中页面上的实测：宿主自带的按钮 28px 高、8px 圆角，模型行卡片
    // 12px/14px 内边距配 20px 圆角，新增按钮 44px 高、16px 圆角。
    expect(SECTION_CSS).toContain('.omniroute-section p { margin: 0; }')
    expect(SECTION_CSS).toMatch(/\.omniroute-entry \{[\s\S]*?border-radius: 20px/)
    expect(SECTION_CSS).toMatch(/\.omniroute-addmodel \{[\s\S]*?height: 44px/)
    expect(SECTION_CSS).toMatch(/\.omniroute-linkbutton \{[\s\S]*?height: 28px;[\s\S]*?border-radius: 8px;/)
    expect(SECTION_CSS).toMatch(/\.omniroute-input \{[\s\S]*?height: 28px/)
    // 候选列表必须有界并自行滚动，否则几十个网关模型会把后续控件推到很远的下方。
    expect(SECTION_CSS).toMatch(/\.omniroute-candidates ul \{[\s\S]*?max-height: 320px; overflow-y: auto;/)
  })
})

/** A wire face answering one resolved dsh-llm-omniroute section (dsh 0.1.7-rc.1 Remote envelopes). */
function wireFace(overrides: Partial<{
  describeAnswer: unknown
  credentialsAnswer: unknown
}> = {}) {
  return {
    describeSettings: vi.fn(() => Promise.resolve({
      ok: true,
      value: overrides.describeAnswer ?? {
        writable: true,
        hasDocument: true,
        namespaces: [{
          ns: 'dsh-llm-omniroute',
          schema: {},
          value: { baseURL: 'http://gw.local:3000/v1', models: [{ id: 'deepseek-chat', contextWindow: 65536 }] },
          applies: 'live',
          secrets: [],
          revision: 7,
        }],
      },
    })),
    mutateSettings: vi.fn(() => Promise.resolve({
      ok: true,
      value: { ns: 'dsh-llm-omniroute', schema: {}, value: {}, applies: 'live', secrets: [], revision: 8 },
    })),
    describeCredentials: vi.fn(() => Promise.resolve({
      ok: true,
      value: overrides.credentialsAnswer ?? { omniroute: { configured: true, writable: true } },
    })),
    setCredential: vi.fn(() => Promise.resolve({ ok: true, value: undefined })),
  }
}

/** A host catalog face answering one scripted gateway listing. */
function catalogFace(models: ReadonlyArray<Record<string, unknown>>) {
  return vi.fn(() => Promise.resolve({ ok: true as const, value: { models: [...models] } }))
}

/** A params face answering one scripted models.dev lookup. */
function paramsFace() {
  return vi.fn(() => Promise.resolve({
    ok: true as const,
    value: {
      models: [
        { id: 'deepseek-chat', matches: [{ provider: 'deepseek', contextWindow: 128_000, maxTokens: 8_192, reasoningEfforts: ['low', 'medium', 'high'] }] },
        { id: 'qwen/qwen-max', matches: [
          { provider: 'qwen', contextWindow: 262_144, maxTokens: 32_768 },
          { provider: 'alibaba', contextWindow: 131_072 },
        ] },
        { id: 'mystery-model', matches: [] },
      ],
    },
  }))
}

describe('OmniRouteSection mount', () => {
  it('loads the section on mount and renders the configuration form', async () => {
    const api = wireFace()
    render(<OmniRouteSection api={api as never} t={t} />)

    // The form fields the user configures the provider through.
    await waitFor(() => { expect(screen.getByLabelText(t('baseUrl'))).toBeTruthy() })
    expect((screen.getByLabelText(t('baseUrl')) as HTMLInputElement).value)
      .toBe('http://gw.local:3000/v1')
    expect(screen.getByLabelText(t('keyInput'))).toBeTruthy()
    expect(screen.getByText(t('fetchModels'))).toBeTruthy()
    expect(screen.getByText(t('apply'))).toBeTruthy()

    // The mount itself interrogated the settings plane.
    expect(api.describeSettings).toHaveBeenCalledTimes(1)
  })

  it('names the missing namespace when the host has no dsh-llm-omniroute section', async () => {
    const api = wireFace({ describeAnswer: { writable: true, hasDocument: true, namespaces: [] } })
    render(<OmniRouteSection api={api as never} t={t} />)

    await waitFor(() => { expect(screen.getByText(new RegExp('not registered'))).toBeTruthy() })
    expect(screen.getByText(t('retry'))).toBeTruthy()
  })
})

describe('environment-supplied credential (read-only)', () => {
  const envCredential = {
    omniroute: { configured: true, writable: false, source: 'env' },
  }

  it('locks the key field with the launch-environment placeholder', async () => {
    const api = wireFace({ credentialsAnswer: envCredential })
    render(<OmniRouteSection api={api as never} t={t} />)

    await waitFor(() => { expect(screen.getByLabelText(t('keyInput'))).toBeTruthy() })
    // The official ProviderEditor pattern: writable === false disables the
    // input and the placeholder states the fact (launch environment, read-only).
    expect((screen.getByLabelText(t('keyInput')) as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByLabelText(t('keyInput')) as HTMLInputElement).placeholder).toBe(t('keyEnvLocked'))
  })

  it('saves the section without attempting a shadowed credential write', async () => {
    const api = wireFace({ credentialsAnswer: envCredential })
    render(<OmniRouteSection api={api as never} t={t} />)

    await waitFor(() => { expect(screen.getByLabelText(t('baseUrl'))).toBeTruthy() })
    fireEvent.change(screen.getByLabelText(t('baseUrl')), { target: { value: 'http://other:3000/v1' } })
    fireEvent.click(screen.getByText(t('apply')))

    await waitFor(() => { expect(api.mutateSettings).toHaveBeenCalledTimes(1) })
    expect(api.setCredential).not.toHaveBeenCalled()
    await waitFor(() => { expect(screen.getByText(t('saved'))).toBeTruthy() })
  })
})

describe('models.dev params update', () => {
  it('shows the summary and applies chosen provider facts overwriting existing values', async () => {
    const api = wireFace({
      describeAnswer: {
        writable: true,
        hasDocument: true,
        namespaces: [{
          ns: 'dsh-llm-omniroute',
          schema: {},
          value: {
            baseURL: 'http://gw.local:3000/v1',
            models: [{ id: 'deepseek-chat' }, { id: 'qwen/qwen-max' }, { id: 'mystery-model' }],
          },
          applies: 'live',
          secrets: [],
          revision: 7,
        }],
      },
    })
    const fetchModelParams = paramsFace()
    render(<OmniRouteSection api={api as never} t={t} fetchModelParams={fetchModelParams as never} />)

    await waitFor(() => { expect(screen.getByText(t('updateParams'))).toBeTruthy() })
    fireEvent.click(screen.getByText(t('updateParams')))
    await waitFor(() => { expect(screen.getByText(t('paramsTitle'))).toBeTruthy() })
    // Completion feedback: a status line names the matched/unmatched counts
    // right away, instead of only the panel below a possibly long list.
    expect(screen.getByRole('status').textContent).toBe(
      t('paramsSummary').replace('{matched}', '2').replace('{unmatched}', '1'),
    )
    // The counts appear twice by design: the status line and the panel summary.
    expect(screen.getAllByText((_, element) =>
      element?.textContent === t('paramsSummary').replace('{matched}', '2').replace('{unmatched}', '1'),
    )).toHaveLength(2)
    expect(screen.getByText(t('paramsUnmatched'))).toBeTruthy()
    // The ambiguous id offers a provider picker with both entries.
    const picker = screen.getByLabelText(`${t('paramsProvider')} qwen/qwen-max`) as HTMLSelectElement
    expect(picker.options.length).toBe(2)

    // Overwrite applies the first match of each id (deepseek 128K/8K, qwen 262K/32K);
    // mystery-model keeps its (empty) values.
    fireEvent.click(screen.getByText(t('paramsOverwrite')))
    await waitFor(() => { expect(screen.getByText(new RegExp(t('paramsApplied')))).toBeTruthy() })
    fireEvent.click(screen.getByText(t('apply')))
    await waitFor(() => { expect(api.mutateSettings).toHaveBeenCalledTimes(1) })
    const models = api.mutateSettings.mock.calls[0][1]
      .find((op: { path: string[] }) => op.path[0] === 'models').value
    expect(models[0]).toEqual({ id: 'deepseek-chat', contextWindow: 128_000, maxTokens: 8_192, reasoningEfforts: ['low', 'medium', 'high'], defaultReasoningEffort: 'high' })
    expect(models[1]).toEqual({ id: 'qwen/qwen-max', contextWindow: 262_144, maxTokens: 32_768 })
    expect(models[2]).toEqual({ id: 'mystery-model' })
  })

  it('fill-blank mode keeps values the rows already carry', async () => {
    const api = wireFace()
    const fetchModelParams = paramsFace()
    render(<OmniRouteSection api={api as never} t={t} fetchModelParams={fetchModelParams as never} />)

    await waitFor(() => { expect(screen.getByText(t('updateParams'))).toBeTruthy() })
    // The fixture row already has contextWindow 65536; blank mode keeps it and only fills maxTokens.
    fireEvent.click(screen.getByText(t('updateParams')))
    await waitFor(() => { expect(screen.getByText(t('paramsOverwrite'))).toBeTruthy() })
    fireEvent.click(screen.getByText(t('paramsFillBlank')))
    await waitFor(() => { expect(screen.getByText(new RegExp(t('paramsApplied')))).toBeTruthy() })
    fireEvent.click(screen.getByText(t('apply')))
    await waitFor(() => { expect(api.mutateSettings).toHaveBeenCalledTimes(1) })
    const models = api.mutateSettings.mock.calls[0][1]
      .find((op: { path: string[] }) => op.path[0] === 'models').value
    expect(models[0]).toEqual({ id: 'deepseek-chat', contextWindow: 65_536, maxTokens: 8_192, reasoningEfforts: ['low', 'medium', 'high'], defaultReasoningEffort: 'high' })
  })

  it('sends the proxy url only while the toggle is on, and persists the proxy section', async () => {
    const api = wireFace()
    const fetchModelParams = paramsFace()
    render(<OmniRouteSection api={api as never} t={t} fetchModelParams={fetchModelParams as never} />)

    await waitFor(() => { expect(screen.getByLabelText(t('proxyToggle'))).toBeTruthy() })
    fireEvent.click(screen.getByText(t('updateParams')))
    await waitFor(() => { expect(fetchModelParams).toHaveBeenCalledTimes(1) })
    expect(fetchModelParams.mock.calls[0][0].proxyUrl).toBeUndefined()

    fireEvent.click(screen.getByLabelText(t('proxyToggle')))
    fireEvent.change(screen.getByLabelText(t('proxyUrl')), { target: { value: 'http://127.0.0.1:7897' } })
    fireEvent.click(screen.getByText(t('updateParams')))
    await waitFor(() => { expect(fetchModelParams).toHaveBeenCalledTimes(2) })
    expect(fetchModelParams.mock.calls[1][0].proxyUrl).toBe('http://127.0.0.1:7897')

    fireEvent.click(screen.getByText(t('fetchCancel')))
    fireEvent.click(screen.getByText(t('apply')))
    await waitFor(() => { expect(api.mutateSettings).toHaveBeenCalledTimes(1) })
    const proxy = api.mutateSettings.mock.calls[0][1]
      .find((op: { path: string[] }) => op.path[0] === 'proxy').value
    expect(proxy).toEqual({ enabled: true, url: 'http://127.0.0.1:7897' })
  })

  it('states that the proxy setting only scopes the models.dev download', async () => {
    const api = wireFace()
    render(<OmniRouteSection api={api as never} t={t} fetchModelParams={paramsFace() as never} />)

    await waitFor(() => { expect(screen.getByLabelText(t('proxyToggle'))).toBeTruthy() })
    // The host (dsh 0.1.7) installs a global proxy dispatcher, so the plugin
    // toggle must not be presented as the only network route.
    expect(screen.getByText(t('proxyHint'))).toBeTruthy()
  })
})

describe('model catalog', () => {
  it('sorts fetched candidates by id and the adopted rows keep that order', async () => {
    const api = wireFace()
    const fetchCatalog = catalogFace([{ id: 'zhipu/glm-5.3' }, { id: 'aa-first' }, { id: 'deepseek-chat' }])
    render(<OmniRouteSection
      api={api as never} t={t}
      fetchModelParams={paramsFace() as never} fetchCatalog={fetchCatalog as never}
    />)

    await waitFor(() => { expect(screen.getByText(t('fetchModels'))).toBeTruthy() })
    fireEvent.click(screen.getByText(t('fetchModels')))
    await waitFor(() => { expect(screen.getByText(t('fetchAdopt'))).toBeTruthy() })
    // The picker lists candidates in id order even though the reply did not.
    const listed = screen.getAllByRole('listitem').map(item => item.textContent ?? '')
    expect(listed[0]).toContain('aa-first')
    expect(listed[1]).toContain('deepseek-chat')
    expect(listed[2]).toContain('zhipu/glm-5.3')

    fireEvent.click(screen.getByText(t('fetchAdopt')))
    // The form keeps the sorted order: existing row and adopted rows merge
    // alphabetically instead of appending the new ones at the end.
    await waitFor(() => { expect((screen.getByLabelText(`${t('modelId')} 1`) as HTMLInputElement).value).toBe('aa-first') })
    expect((screen.getByLabelText(`${t('modelId')} 2`) as HTMLInputElement).value).toBe('deepseek-chat')
    expect((screen.getByLabelText(`${t('modelId')} 3`) as HTMLInputElement).value).toBe('zhipu/glm-5.3')
  })

  /** The models op of the first mutate call. */
  function savedModels(api: ReturnType<typeof wireFace>): Array<Record<string, unknown>> {
    return api.mutateSettings.mock.calls[0][1]
      .find((op: { path: string[] }) => op.path[0] === 'models').value
  }

  it('keeps the fetched-model picker in one bounded panel with its actions in a footer', async () => {
    const api = wireFace()
    const fetchCatalog = catalogFace([{ id: 'alpha' }, { id: 'beta' }])
    const { container } = render(<OmniRouteSection
      api={api as never} t={t}
      fetchModelParams={paramsFace() as never} fetchCatalog={fetchCatalog as never}
    />)

    await waitFor(() => { expect(screen.getByText(t('fetchModels'))).toBeTruthy() })
    fireEvent.click(screen.getByText(t('fetchModels')))
    await waitFor(() => { expect(screen.getByText(t('fetchAdopt'))).toBeTruthy() })

    const panel = container.querySelector('.omniroute-candidates')
    expect(panel).not.toBeNull()
    // 列表与操作按钮都在同一个面板内：面板本身是滚动区域里的一个整体，
    // 按钮不再作为裸兄弟节点排在列表之后。
    expect(panel?.querySelector('ul')).not.toBeNull()
    const footer = panel?.querySelector('.omniroute-candidates-footer')
    expect(footer).not.toBeNull()
    expect(footer?.querySelectorAll('button').length).toBe(2)
  })

  it('folds capacities behind the row disclosure and adopts K/M entry', async () => {
    const api = wireFace()
    render(<OmniRouteSection api={api as never} t={t} />)

    await waitFor(() => { expect(screen.getByLabelText(t('baseUrl'))).toBeTruthy() })
    // Capacities are not on the row until its disclosure opens.
    expect(screen.queryByLabelText(`${t('contextWindow')} 1`)).toBeNull()
    fireEvent.click(screen.getByLabelText(`${t('modelAdvanced')} 1`))
    const context = await waitFor(() => screen.getByLabelText(`${t('contextWindow')} 1`))
    // 65536 is not a whole multiple of 1000, so it stays written out.
    expect((context as HTMLInputElement).value).toBe('65536')

    fireEvent.change(context, { target: { value: '256K' } })
    fireEvent.click(screen.getByText(t('apply')))
    await waitFor(() => { expect(api.mutateSettings).toHaveBeenCalledTimes(1) })
    expect(savedModels(api)[0].contextWindow).toBe(256_000)
  })

  it('adopts the gateway capabilities and preselects None for a no-thinking route', async () => {
    const api = wireFace({ describeAnswer: {
      writable: true,
      hasDocument: true,
      namespaces: [{
        ns: 'dsh-llm-omniroute',
        schema: {},
        value: { baseURL: 'http://gw.local:3000/v1', models: [] },
        applies: 'live',
        secrets: [],
        revision: 7,
      }],
    } })
    const fetchCatalog = catalogFace([
      {
        id: 'no-think/agy/claude-sonnet-4-6',
        name: 'no-think/claude-sonnet-4-6',
        contextWindow: 1_000_000,
        maxTokens: 64_000,
        vision: true,
        toolCalling: true,
        reasoningEfforts: ['none'],
        defaultReasoningEffort: 'none',
      },
      {
        id: 'agy/gemini-3.8-flash',
        name: 'Gemini 3.8 Flash[agy]',
        contextWindow: 1_048_576,
        maxTokens: 65_536,
        reasoningEfforts: ['low', 'high'],
        defaultReasoningEffort: 'high',
        effortModels: { high: 'agy/gemini-3.8-flash-high', low: 'agy/gemini-3.8-flash-low' },
      },
    ])
    render(<OmniRouteSection
      api={api as never} t={t}
      fetchModelParams={paramsFace() as never} fetchCatalog={fetchCatalog as never}
    />)

    await waitFor(() => { expect(screen.getByText(t('fetchModels'))).toBeTruthy() })
    fireEvent.click(screen.getByText(t('fetchModels')))
    await waitFor(() => { expect(screen.getByText(t('fetchAdopt'))).toBeTruthy() })
    // The candidate list previews what the gateway declared.
    expect(screen.getByText(new RegExp('no-think/agy/claude-sonnet-4-6'))).toBeTruthy()
    fireEvent.click(screen.getByText(t('fetchAdopt')))
    await waitFor(() => { expect(screen.getByLabelText(`${t('modelId')} 1`)).toBeTruthy() })

    // Adoption orders rows by id, so the two adopted rows are
    // (1) the folded `agy/…` route and (2) the no-thinking one.
    fireEvent.click(screen.getByLabelText(`${t('modelAdvanced')} 1`))
    const levelSelect = await waitFor(() => screen.getByLabelText(`${t('defaultEffort')} 1`) as HTMLSelectElement)
    expect([...levelSelect.options].map(option => option.value)).toEqual(['low', 'high'])
    expect(levelSelect.value).toBe('high')
    expect(screen.getByText(new RegExp('agy/gemini-3.8-flash-high'))).toBeTruthy()

    // A no-thinking route shows None as its single, preselected level.
    fireEvent.click(screen.getByLabelText(`${t('modelAdvanced')} 2`))
    const noneSelect = await waitFor(() => screen.getByLabelText(`${t('defaultEffort')} 2`) as HTMLSelectElement)
    expect(noneSelect.value).toBe('none')
    expect(noneSelect.options[0]?.textContent).toBe(t('effortNone'))
    // Both disclosures are open, and both routes are id-bound: the folded one
    // shows its level → id map, the no-thinking one the plain notice.
    expect(screen.getAllByText(new RegExp(t('effortIdBound')))).toHaveLength(2)

    fireEvent.click(screen.getByText(t('apply')))
    await waitFor(() => { expect(api.mutateSettings).toHaveBeenCalledTimes(1) })
    const saved = savedModels(api)
    expect(saved[0]).toEqual({
      id: 'agy/gemini-3.8-flash',
      name: 'Gemini 3.8 Flash[agy]',
      contextWindow: 1_048_576,
      maxTokens: 65_536,
      reasoningEfforts: ['low', 'high'],
      defaultReasoningEffort: 'high',
      effortModels: { high: 'agy/gemini-3.8-flash-high', low: 'agy/gemini-3.8-flash-low' },
    })
    expect(saved[1]).toEqual({
      id: 'no-think/agy/claude-sonnet-4-6',
      name: 'no-think/claude-sonnet-4-6',
      contextWindow: 1_000_000,
      maxTokens: 64_000,
      vision: true,
      toolCalling: true,
      reasoningEfforts: ['none'],
      defaultReasoningEffort: 'none',
    })
  })

  it('never lets the models.dev panel overwrite id-bound levels', async () => {
    const api = wireFace({ describeAnswer: {
      writable: true,
      hasDocument: true,
      namespaces: [{
        ns: 'dsh-llm-omniroute',
        schema: {},
        value: {
          baseURL: 'http://gw.local:3000/v1',
          models: [{
            id: 'agy/gemini-3.8-flash',
            reasoningEfforts: ['low', 'high'],
            defaultReasoningEffort: 'high',
            effortModels: { high: 'agy/gemini-3.8-flash-high' },
          }],
        },
        applies: 'live',
        secrets: [],
        revision: 7,
      }],
    } })
    const fetchModelParams = vi.fn(() => Promise.resolve({
      ok: true as const,
      value: { models: [{ id: 'agy/gemini-3.8-flash', matches: [{ provider: 'google', contextWindow: 1_048_576, maxTokens: 65_536, reasoningEfforts: ['minimal', 'low', 'medium', 'high'] }] }] },
    }))
    render(<OmniRouteSection api={api as never} t={t} fetchModelParams={fetchModelParams as never} />)

    await waitFor(() => { expect(screen.getByText(t('updateParams'))).toBeTruthy() })
    fireEvent.click(screen.getByText(t('updateParams')))
    await waitFor(() => { expect(screen.getByText(t('paramsOverwrite'))).toBeTruthy() })
    // The panel says why: the levels come from the gateway's own id scheme.
    expect(screen.getByText(t('paramsIdBoundSkipped'))).toBeTruthy()
    fireEvent.click(screen.getByText(t('paramsOverwrite')))
    await waitFor(() => { expect(screen.getByText(new RegExp(t('paramsApplied')))).toBeTruthy() })
    fireEvent.click(screen.getByText(t('apply')))
    await waitFor(() => { expect(api.mutateSettings).toHaveBeenCalledTimes(1) })
    const saved = savedModels(api)
    // Capacities were still adopted; the level set and its map survived.
    expect(saved[0]).toMatchObject({
      id: 'agy/gemini-3.8-flash',
      contextWindow: 1_048_576,
      maxTokens: 65_536,
      reasoningEfforts: ['low', 'high'],
      defaultReasoningEffort: 'high',
      effortModels: { high: 'agy/gemini-3.8-flash-high' },
    })
  })

  it('drops an emptied name instead of storing an empty string', async () => {
    const api = wireFace()
    render(<OmniRouteSection api={api as never} t={t} />)

    const name = await waitFor(() => screen.getByLabelText(`${t('modelName')} 1`))
    fireEvent.change(name, { target: { value: 'Renamed' } })
    fireEvent.change(name, { target: { value: '' } })
    fireEvent.click(screen.getByText(t('apply')))
    await waitFor(() => { expect(api.mutateSettings).toHaveBeenCalledTimes(1) })
    expect(savedModels(api)[0].name).toBeUndefined()
  })

  it('clears every row through the clear action and saves an empty catalog', async () => {
    const api = wireFace()
    render(<OmniRouteSection api={api as never} t={t} fetchModelParams={paramsFace() as never} />)

    // The fixture carries one model row; clear removes it and the empty
    // hint appears in its place.
    await waitFor(() => { expect(screen.getByText(t('clearModels'))).toBeTruthy() })
    fireEvent.click(screen.getByText(t('clearModels')))
    await waitFor(() => { expect(screen.getByText(t('modelsEmpty'))).toBeTruthy() })
    expect(screen.queryByLabelText(`${t('modelId')} 1`)).toBeNull()
    // An empty catalog disables the action until a row exists again.
    expect((screen.getByText(t('clearModels')) as HTMLButtonElement).disabled).toBe(true)

    // Saving writes the emptied array (the static describe stub still
    // answers the old fixture after reload — irrelevant to the written ops).
    fireEvent.click(screen.getByText(t('apply')))
    await waitFor(() => { expect(api.mutateSettings).toHaveBeenCalledTimes(1) })
    const models = api.mutateSettings.mock.calls[0][1]
      .find((op: { path: string[] }) => op.path[0] === 'models').value
    expect(models).toEqual([])
  })

  it('adds a row through the add-model action and refuses a save with an empty id', async () => {
    const api = wireFace()
    render(<OmniRouteSection api={api as never} t={t} />)

    await waitFor(() => { expect(screen.getByText(t('addModel'))).toBeTruthy() })
    fireEvent.click(screen.getByText(t('addModel')))
    expect(screen.getByLabelText(`${t('modelId')} 2`)).toBeTruthy()

    fireEvent.click(screen.getByText(t('apply')))
    await waitFor(() => { expect(screen.getByText(new RegExp(t('modelIdRequired')))).toBeTruthy() })
    expect(api.mutateSettings).not.toHaveBeenCalled()
  })
})

describe('select-all in the fetched-model picker', () => {
  /** Open the picker over a fixed candidate list and hand back the wire face. */
  async function openPicker(ids: readonly string[]) {
    const api = wireFace()
    const fetchCatalog = catalogFace(ids.map(id => ({ id })))
    render(<OmniRouteSection
      api={api as never} t={t}
      fetchModelParams={paramsFace() as never} fetchCatalog={fetchCatalog as never}
    />)
    await waitFor(() => { expect(screen.getByText(t('fetchModels'))).toBeTruthy() })
    fireEvent.click(screen.getByText(t('fetchModels')))
    await waitFor(() => { expect(screen.getByText(t('fetchAdopt'))).toBeTruthy() })
    return api
  }

  const master = () => screen.getByLabelText(t('fetchSelectAll')) as HTMLInputElement
  const row = (id: string) => screen.getByLabelText(id) as HTMLInputElement

  it('clears every candidate and restores them on the next toggle', async () => {
    await openPicker(['alpha', 'beta', 'gamma'])

    // Nothing is configured yet, so every fetched candidate starts picked.
    expect(master().checked).toBe(true)
    expect(row('alpha').checked).toBe(true)

    fireEvent.click(master())
    for (const id of ['alpha', 'beta', 'gamma']) expect(row(id).checked).toBe(false)
    expect(master().checked).toBe(false)

    fireEvent.click(master())
    for (const id of ['alpha', 'beta', 'gamma']) expect(row(id).checked).toBe(true)
    expect(master().checked).toBe(true)
  })

  it('reports the partial state while only some candidates are picked', async () => {
    await openPicker(['alpha', 'beta', 'gamma'])

    fireEvent.click(row('beta'))
    expect(master().checked).toBe(false)
    expect(master().indeterminate).toBe(true)

    fireEvent.click(row('beta'))
    expect(master().checked).toBe(true)
    expect(master().indeterminate).toBe(false)
  })

  it('selects the candidates that are already configured without rewriting them', async () => {
    // The fixture already holds deepseek-chat with a hand-tuned capacity, so
    // that candidate starts unpicked and is the one a plain select-all used to
    // miss.
    const api = await openPicker(['deepseek-chat', 'alpha'])
    expect(row('deepseek-chat').checked).toBe(false)
    expect(row('alpha').checked).toBe(true)

    fireEvent.click(master())
    expect(row('deepseek-chat').checked).toBe(true)
    expect(master().checked).toBe(true)

    fireEvent.click(screen.getByText(t('fetchAdopt')))
    // Adopt only edits the form; the write happens on save.
    fireEvent.click(screen.getByText(t('apply')))
    await waitFor(() => { expect(api.mutateSettings).toHaveBeenCalledTimes(1) })
    const saved = api.mutateSettings.mock.calls[0][1]
      .find((op: { path: string[] }) => op.path[0] === 'models').value as Array<Record<string, unknown>>
    // Selecting an existing row is still a no-op at adopt time: the row is not
    // duplicated and the tuned capacity survives.
    expect(saved.filter(model => model.id === 'deepseek-chat')).toHaveLength(1)
    expect(saved.find(model => model.id === 'deepseek-chat')?.contextWindow).toBe(65536)
    expect(saved.map(model => model.id)).toContain('alpha')
  })
})
