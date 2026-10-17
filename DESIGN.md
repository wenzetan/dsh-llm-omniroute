# 实现设计

[中文使用指南](README.zh-CN.md) · [配置参考](docs/configuration.md) · [开发与发布](docs/development.md)

本文描述当前代码，不作为历史开发日志。当前代码、构建依赖和 CI 针对 dsh `0.2.0-rc.2`，只支持这条
宿主线（下限 `0.2.0-rc.2`）。

## 插件负责什么

插件把 dsh 的请求接到 OmniRoute 网关上，并把网关暴露的能力映射回 dsh 的词汇：

- **对话**：`ctx.llm` 上的 `omniroute` 路由（显示名 **Custom Provider**），把 dsh 的模型请求转成
  OpenAI-compatible chat-completions 请求，再把 SSE 响应还原成 dsh 的内容块。
- **模型目录**：解析 `GET /v1/models` 的容量、能力与思考等级字段，折叠等级变体，产出配置页可直接
  采纳的目录行；请求只发送网关自己列出的 id。
- **web 能力**：`ctx.web` 上的 `omniroute` 搜索/抓取 provider，分别转发到网关的
  `POST /v1/search` 与 `POST /v1/web/fetch`，取代出厂需要 DeepSeek 凭据的 `deepseek-official`
  与本地匿名抓取。

网关决定可用模型、权限与实际能力；插件不内置可直接使用的模型目录，也不修改 dsh 核心。

## 两侧如何协作

浏览器负责编辑和展示，宿主负责凭据读取、配置校验、网络请求与解析。

| 操作 | 数据流 |
| --- | --- |
| 保存网关和模型 | Custom Provider 设置页 → `remote.settings.mutate` → profile Cordis patch 的 `dsh-llm-omniroute` 行（volatile 字段） |
| 保存密钥 | 设置页 → `remote.credentials.set` → `omniroute` 凭据引用 |
| 获取模型 | 设置页 → 自有 RPC `/dsh-llm-omniroute` 的 `catalog` → 适配器 → 网关 `/v1/models` → `parseOmniRouteCatalog` → 富目录行 |
| 官方 Models 页发现 | `remote.llm.discoverModels` → 同一适配器 → 折叠后的 `LlmDiscoveredModel[]` |
| 补充模型参数 | 设置页 → 同一 RPC 的 `models-dev-params` → 宿主下载 models.dev → 返回匹配候选 |
| 对话 | dsh LlmRuntime → `OmniRouteAdapter` → 网关 `/chat/completions` → SSE → dsh StreamChunk |
| web_search | `ctx.web` → `OmniRouteSearchProvider` → 网关 `/v1/search` → seam `sources[]` |
| web_fetch | `ctx.web` → `OmniRouteFetchProvider` → 网关 `/v1/web/fetch` → seam `WebFetchResult` |

设置页通过 `settings.section` 注册，因此不需要给官方 Models 页面增加专用布局。客户端使用 dsh
Remote 命名空间读写设置与凭据；模型目录和 models.dev 查询走插件自己的 RPC 通道，因为目录行携带的
能力事实（思考等级、等级→id 映射、vision、tool calling）在 `LlmDiscoveredModel` 里没有对应字段。
设置命名空间就是 profile 里的插件行 id（本插件的 bundle patch 使用 `dsh-llm-omniroute`），设置服务只
暴露标记为 volatile 的字段，写入落回 profile patch。

## 代码导航

| 文件 | 职责 |
| --- | --- |
| [src/index.ts](src/index.ts) | 配置定义与 schema 校验、最低宿主检查、服务注册、volatile 配置读取与重试策略更新、凭据解析、自有 RPC、web provider 注册 |
| [src/catalog.ts](src/catalog.ts) | `/v1/models` 能力映射、思考等级三段规则、等级变体折叠与反向映射、展示名 |
| [src/adapter.ts](src/adapter.ts) | 传输与目录服务：列表、发现、参数匹配、请求发送、重试策略元数据与错误处理 |
| [src/serialize.ts](src/serialize.ts) | 将消息和工具定义转换为网关请求 |
| [src/sse.ts](src/sse.ts) | 将字节流拆成 SSE payload，检查结束标记 |
| [src/translate.ts](src/translate.ts) | 合并文本、思考与工具调用增量，转换用量和结束原因 |
| [src/web.ts](src/web.ts) | `ctx.web` 的搜索/抓取 provider 与结果映射 |
| [src/types.ts](src/types.ts) | 网关协议、web 端点与 RPC 载荷的数据类型 |
| [src/client/apply.ts](src/client/apply.ts) | 设置页、语言字典、样式及远程服务接线 |
| [src/client/OmniRouteSection.tsx](src/client/OmniRouteSection.tsx) | 表单、候选模型、参数确认和保存交互 |
| [src/client/locale.ts](src/client/locale.ts) | 中英文界面文案 |
| [cordis.patch.yml](cordis.patch.yml) | 插入插件行；web seam 的指向由 profile 自己的 patch 声明 |

## 思考等级：为什么以 id 为准

OmniRoute 是聚合网关，`capabilities.effort_tiers` 来自整家 provider 的同步而非逐模型探测，因此会
列出具体路由并不接受的等级（实测：`agy/gemini-3.8-flash-high` 声明 `none…max`，实际只有
`high`/`low`/`medium` 能路由）。`src/catalog.ts` 因此按证据强度排序：

1. **no-think 标记**（`nothink`/`no-think`/`no_thinking`/`notthinking`/`nonthinking`/`noreasoning`，
   比较时去掉分隔符并小写）：网关的 `noThinkingAlias` 约定，路由本身没有可选等级，行只声明 `none`。
2. **id 尾部的等级词**（`none`/`minimal`/`low`/`medium`/`high`/`xhigh`/`max`，只看最后一个 `-` 段）：
   等级就在 id 上。同一原生 id 的所有已暴露等级折叠成一行，行里记录 `effortModels`（等级 → 网关
   id）。只暴露一档时默认勾选该档；多档时默认取最强档（与无约束行一致）。
3. **id 不含等级**：才采用 `effort_tiers`，默认取最强档。

折叠必须配反向映射，这一点是实测决定的：网关**不接受**裸原生 id（
`agy/gemini-3.8-flash` → `400 … not available in the active live catalog`），只接受它自己列出的
变体 id。插件因此从不发送列表里没有的 id；`resolveWireModel` 是唯一的出口，`adapter.stream` 在
序列化前替换 `model` 并清掉已折进 id 的 `reasoning_effort`。

已知代价：名字里恰好以等级词结尾的路由（`qwen-max`）会被折叠成 `qwen` + 等级 `max`。这在列表里
无法与真实的等级后缀区分，而折叠是安全的——运行时会把该行的默认等级物化进请求，实际发送的仍是
`qwen-max`；不认同时可在设置页手工改回。

## web seam

`src/web.ts` 只做一层薄适配：provider 选择、密钥、配额、降级全部留给网关。要点：

- 运行时**不 import** `@deepseek-ai/dsh-web`：服务实例从 `ctx.web` 拿到（声明合并是类型层的），两个
  错误对象在本地按 seam 消费方读取的形状构造（`name: 'WebError'` + 机器可路由的 `code`）。这样在
  没有 web seam 的组合里插件照样能加载。
- 注册走 `ctx.inject(['web'], …)` + `cctx.effect(...)`：没有 seam 时不注册；seam 稍后就绪时照常注册。
- 搜索把 `results[]` 映射成 `sources[]`、`answer.text` 映射成 `content`，并按 `snippetMaxChars`
  截断（网关的 snippet 是整段正文抽取，单次可达上百 KB）。
- 抓取把抽取出的 markdown 作为 `{kind: 'text'}` 返回；`statusCode` 优先取网关 provider 在
  `metadata` 里报告的状态（如 Firecrawl 的 `statusCode`），否则为 200；超过 `fetchMaxChars` 时截断
  并置 `truncated`。
- seam 的指向（`web.searchProvider` / `web.fetchProvider`）由 profile 自己的 patch 声明。`web` 是官方
  核心行，bundle 覆盖核心行会破坏同一 profile 里其他组合；插件只注册 provider，不假定自己被选中。

## 配置与凭据的生命周期

插件加载时注册供应商、适配器和模型发现处理器。settings 或 connection 服务稍后就绪时，通过
`ctx.inject` 声明自带设置页（`settings.configure({ auto: false })`）并安装 RPC，避免因加载顺序而
漏注册。注册和样式等资源随对应的 Cordis 作用域释放。

自有 RPC 通道的注册方式需要单独说明：`connection.rpc.handle(channel, handler)` 在这条宿主线上仍
不可用（它的 `rpc` getter 捕获服务自身的 `this.ctx`，该作用域没有注入 `webServer`，内部
`owner.webServer.register(route)` 抛错后被 effect 吞掉，通道静默缺失，浏览器只会撞上 SPA fallback
的 405）。插件改为注入 `connection` 与 `webServer`，并把自身作用域作为 owner 传给
`register(owner, channel, handler)`——那正是 `rpc.handle` 委托的方法。这一契约由 CI 的真实启动检查
守护，单元测试的替身无法复现该守卫。

配置以 schemastery schema 声明，所有字段标记为 volatile：Loader 在 profile patch 只改动 volatile
字段时就地更新运行中的配置引用，不重新加载插件。每次请求读取一次引用快照（`snapshotConfig`）并
据此解析密钥，配置热更新不会改变正在进行的请求。写入前由 `dsh-config-editor` 用完整 schema 校验
（拒绝非法 URL、空过滤项、`effortModels` 中未声明的等级等）。重试策略是在注册时读取的，所以
`options()` 检测到变化时通过 `registration.replace` 更新，避免短暂移除模型路由。

密钥使用固定引用 `omniroute`，不将 `OMNIROUTE_API_KEY` 作为回退来源。缺少密钥时插件仍能加载设置
页，实际请求会报 `MISSING_CREDENTIAL`。浏览器不读取明文密钥。web provider 与对话路由共用同一份
连接快照，因此搜索/抓取与对话永远指向同一个地址与同一把密钥。

## 网关协议的关键选择

| 选择 | 原因与行为 |
| --- | --- |
| 默认模型目录为空 | 网关的模型集合是部署相关的；由发现或用户配置补充 |
| 不设置统一输出上限 | 模型与全局配置均未指定时，省略 `max_tokens`，使用上游默认值 |
| 声明文本输入 | 序列化器还不发送图片；网关的 `vision` 标记只作为能力事实保留与展示，谎报会让宿主接受注定失败的请求 |
| 逐模型提供思考等级 | 行声明的等级决定选择器；选中的值要么折进 id，要么作为 `reasoning_effort` 发送，不额外发送 `thinking` |
| `none` 也显式发送 | `reasoning_effort: none` 是「不要思考」的指令；省略只会退回上游默认 |
| 保留空 assistant 文本为 `""` | 避免部分网关拒绝纯工具调用轮次中的 `null` 内容 |
| 工具调用轮次回传 `reasoning_content` | 保留部分 DeepSeek 系上游需要的推理上下文 |
| 只接受非空工具 ID / 名称增量 | 防止后续空字符串或显式 `null` 覆盖首段正确值 |
| 要求 SSE `[DONE]` | 区分正常完成与连接意外中断；结束前统一发出最终块、用量和 finish |
| 区分输入与缓存用量 | 从 prompt 总量中减去缓存命中，符合 dsh 的不相交计数约定 |
| 补充聚合总用量 | `totalTokens` 取 `prompt_tokens + completion_tokens` 的原始聚合值；网关给出总量时要求与聚合值一致，否则省略 |

请求保留 `attributionHeaders()` 提供的 User-Agent，并发送必要的认证与内容类型头，不附加插件自行
生成的用户或会话遥测标识。

能力映射与 models.dev 匹配都只是建议：`effort_tiers` 可能不准确，名称过滤无法验证模型是否真的支持
文本或工具。

## 构建与运行时依赖

宿主产物是 ESM，宿主包（`@deepseek-ai/*`）作为外部依赖，普通运行依赖包括 `undici` 与
`eventsource-parser`。浏览器产物由 esbuild 生成模块工厂，通过 `window.__ModuleLoader__.load` 登记；
当前浏览器运行时导入为 React 及 JSX runtime，dsh 类型导入在构建时擦除。

`@deepseek-ai/dsh-web` 只出现在 devDependencies（类型检查）与 `peerDependenciesMeta.optional`：运行
时不 import 它，没有 web seam 的组合也能加载。类型声明由 TypeScript 生成，构建脚本会修正声明中的
相对扩展名。JS、source map 和类型声明都提交至 `lib/`。

当前依赖配置保留了四项 overrides，把 `dsh-type-meta`、`dsh-compact`、`dsh-paths`、
`dsh-user-interaction` 别名到 `dsh-brand@0.2.0-rc.2`。这四个名字在上游 0.2.0 线仍返回 E404，但当前
解析树并没有请求它们，因此是**防御性配置而非必需项**。

## 版本兼容的边界

入口读取宿主 `dsh-llm/package.json` 并拒绝低于 `0.2.0-rc.2` 的版本。这只能实现最低版本诊断，不能
保证所有更高版本都兼容。ESM 具名导出还可能在入口求值之前失败，因此另有宿主导出与链接测试。

兼容性以**宿主线**为单位，而不是单个补丁号。`test/fixtures/dsh-llm-0.2.0-rc.2.exports.json` 记录
0.2.0 线的具名导出面；`test/fixtures/dsh-llm-0.1.7-rc.1.exports.json` 保留为「上一个被拒绝宿主线」
的对照面。宿主包在构建时是 external，不参与打包。

插件自身的版本号跟随宿主：`<dsh 版本>-v<本插件序号>`，Git 标签是 `v<插件版本>`。

## 当前未提供的能力

- 图片输入与统一的多模态网关序列化（网关的 `vision` 已解析并展示，但本路由仍声明纯文本）。
- 多个独立 OmniRoute 网关配置。
- 逐模型的 `systemPromptUpdate: 'in-history'` 能力声明。
- 网关管理面能力（配额、连接、定价）的 UI 封装。
