/**
 * 分组词汇：分组名、尾段与「[分组显示名]尾段」的拼法。宿主适配器与设置页共用这几个
 * 函数，所以这里锁住的是两边共同遵守的规则。
 */
import { describe, expect, it } from 'vitest'
import { compareGroups, groupOf, groupedModelName, modelTail, routeIdOf } from '../src/group.ts'

describe('group vocabulary', () => {
  it('takes the first path segment as the group', () => {
    expect(groupOf('agy/claude-sonnet-4-6')).toBe('agy')
    // 多个 `/` 也只按第一段归组。
    expect(groupOf('command-code/deepseek/deepseek-v4.1-flash')).toBe('command-code')
    // 不含 `/` 的 id 是网关自己拼装的组合模型，没有分组归属。
    expect(groupOf('hermes-hindsight')).toBe('')
  })

  it('strips a gateway no-thinking prefix before grouping', () => {
    // 前缀按 `/` 分段给出，首段即标记时剥掉，拼写变体同样认。
    expect(routeIdOf('no-think/agy/claude-sonnet-4-6')).toBe('agy/claude-sonnet-4-6')
    expect(routeIdOf('no_thinking/claude-sonnet-4-6')).toBe('claude-sonnet-4-6')
    expect(groupOf('no-think/agy/claude-sonnet-4-6')).toBe('agy')
    // 标记要占满首段：名字里恰好带这些字母的供应商原样保留。
    expect(routeIdOf('agy/no-think-model')).toBe('agy/no-think-model')
    expect(routeIdOf('no_thinking-agy/claude-sonnet-4-6')).toBe('no_thinking-agy/claude-sonnet-4-6')
    expect(groupOf('agy/no-think-model')).toBe('agy')
  })

  it('keeps the last path segment as the tail', () => {
    expect(modelTail('agy/claude-sonnet-4-6')).toBe('claude-sonnet-4-6')
    expect(modelTail('command-code/deepseek/deepseek-v4.1-flash')).toBe('deepseek-v4.1-flash')
    expect(modelTail('hermes-hindsight')).toBe('hermes-hindsight')
  })

  it('composes the display name from the group label, the row name and the tail', () => {
    const labels = { agy: 'AGY' }
    // 行自己的显示名优先当尾段。
    expect(groupedModelName('agy/claude-sonnet-4-6', 'Claude Sonnet 4.6', labels))
      .toBe('[AGY]Claude Sonnet 4.6')
    // 没有显示名时用 id 尾段。
    expect(groupedModelName('agy/claude-sonnet-4-6', undefined, labels)).toBe('[AGY]claude-sonnet-4-6')
    expect(groupedModelName('agy/claude-sonnet-4-6', '', labels)).toBe('[AGY]claude-sonnet-4-6')
    // 未配置显示名的分组用组名本身。
    expect(groupedModelName('command-code/deepseek-v4.1-flash', undefined, labels))
      .toBe('[command-code]deepseek-v4.1-flash')
    expect(groupedModelName('agy/claude-sonnet-4-6', undefined, {})).toBe('[agy]claude-sonnet-4-6')
    // 组合模型没有分组归属，不加中括号前缀。
    expect(groupedModelName('hermes-hindsight', undefined, labels)).toBe('hermes-hindsight')
    expect(groupedModelName('hermes-hindsight', 'Hindsight', labels)).toBe('Hindsight')
    // 空显示名等同于未配置，不能拼出空中括号。
    expect(groupedModelName('agy/claude-sonnet-4-6', undefined, { agy: '' }))
      .toBe('[agy]claude-sonnet-4-6')
  })

  it('sorts the combo group ahead of every named group', () => {
    // 组合组（空组名）永远排最前，其余分组按组名升序。
    expect([...['command-code', 'agy', '', 'zeta']].sort(compareGroups))
      .toEqual(['', 'agy', 'command-code', 'zeta'])
    expect(compareGroups('', '')).toBe(0)
    expect(compareGroups('agy', 'agy')).toBe(0)
  })
})
