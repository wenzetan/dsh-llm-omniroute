/**
 * 分组词汇：一个模型 id 的归属分组、它的尾段，以及「[分组显示名]尾段」的显示名。
 * 宿主适配器与浏览器设置页共用这一份，因此模型在选择器里和设置页行里的名字完全一致。
 *
 * 网关的模型 id 用第一个 `/` 之前的那一段命名自己的路由（`agy/claude-sonnet-4-6`
 * 属于 `agy` 组），`groupLabels` 改的就是这一段的显示名。网关另外合成
 * `no-think/<provider>/<model>` 这类别名，它的首段描述的是思考等级而不是供应商，
 * 归组之前先去掉。不含 `/` 的 id 是网关自己拼装的组合模型，没有分组归属。
 *
 * @module dsh-llm-omniroute/group
 */

/**
 * 网关合成的「不思考」别名标记。前缀以 `/` 分段出现，因此首段去掉分隔符并转小写
 * 之后与标记相等即算命中，`no-think/…`、`no_thinking/…` 这类写法都认。前缀属于
 * 思考等级，权威说明见 `./catalog.ts` 的头注；那边的整串标记匹配用的也是这一份
 * 词表，两处不会各自漂移。
 */
export const NO_THINK_MARKERS: readonly string[] = [
  'nothink', 'nothinking', 'notthinking', 'nonthinking', 'noreasoning',
]

/**
 * 剥掉网关合成的「不思考」前缀，取回网关真正路由的模型 id。首段整段是标记（去掉
 * `-`、`_`、空白并转小写之后与标记相等）时才算前缀，所以 `no-think/…`、
 * `no_thinking/…` 都能剥掉，而供应商名里恰好带这些字母的 id 原样保留。前缀描述
 * 的是思考等级，跟供应商无关，归组之前要先去掉它。
 * @param id - 网关给出的模型 id。
 * @returns 去掉首段不思考标记后的 id；id 没有该前缀时原样返回。
 */
export function routeIdOf(id: string): string {
  const slash = id.indexOf('/')
  if (slash < 0) return id
  const head = id.slice(0, slash).toLowerCase().replace(/[-_\s]/g, '')
  return NO_THINK_MARKERS.includes(head) ? id.slice(slash + 1) : id
}

/**
 * 模型 id 归属的分组：剥掉不思考前缀以后，第一个 `/` 之前的那一段。带 `/` 的
 * id 是该网关路由自己暴露的模型；没有 `/` 的 id 是网关自己的组合模型，统一归入
 * 组名为空串的一组。
 * @param id - 网关给出的模型 id。
 * @returns 分组名；去掉前缀后不含 `/` 时为空串。
 */
export function groupOf(id: string): string {
  const route = routeIdOf(id)
  const slash = route.indexOf('/')
  return slash < 0 ? '' : route.slice(0, slash)
}

/**
 * 分组的展示顺序：网关自己的组合模型（组名为空串）排在最前，其余分组按组名
 * 升序。设置页的候选列表与模型编辑列表共用这一顺序。
 * @param left - 一个分组名。
 * @param right - 另一个分组名。
 * @returns 传给 `Array.prototype.sort` 的比较结果。
 */
export function compareGroups(left: string, right: string): number {
  if (left === right) return 0
  if (left.length === 0) return -1
  if (right.length === 0) return 1
  return left < right ? -1 : 1
}

/**
 * 显示名保留的尾段：最后一个 `/` 之后的部分。多个 `/` 也只截最后一段，
 * 例如 `command-code/deepseek/deepseek-v4.1-flash` 保留 `deepseek-v4.1-flash`。
 * @param id - 网关给出的模型 id。
 * @returns 最后一个路径段；id 不含 `/` 时为 id 本身。
 */
export function modelTail(id: string): string {
  const slash = id.lastIndexOf('/')
  return slash < 0 ? id : id.slice(slash + 1)
}

/**
 * 一个模型对外的显示名：分组显示名加中括号前缀，再接尾段，例如
 * `[cmd]deepseek-v4.1-flash`。尾段优先取这一行自己的显示名，显示名为空时退回 id
 * 尾段；分组未配置显示名时用组名本身。组合模型（id 不含 `/`）是网关自己的组合，
 * 没有分组归属，只显示尾段，不加中括号前缀。
 *
 * 这是纯展示层的拼接：id 本身、请求内容与匹配规则都不受它影响，所以宿主每次
 * 列取模型时都按当前的分组显示名现拼一遍。
 * @param id - 模型 id。
 * @param name - 这一行配置的显示名；空串或未配置表示没有。
 * @param labels - 分组显示名，键为分组名。
 * @returns 该模型的显示名。
 */
export function groupedModelName(
  id: string,
  name: string | undefined,
  labels: Readonly<Record<string, string>> | undefined,
): string {
  const tail = name !== undefined && name.length > 0 ? name : modelTail(id)
  const group = groupOf(id)
  if (group.length === 0) return tail
  const label = labels?.[group]
  return `[${label !== undefined && label.length > 0 ? label : group}]${tail}`
}
