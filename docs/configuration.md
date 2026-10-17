# 配置与排障

[返回 README](../README.zh-CN.md) · [实现设计](../DESIGN.md)

日常使用只需在 Web 的 **Custom Provider** 设置页填写地址、密钥和模型。本文供需要手动配置、调整
模型参数或排查问题时查阅。

## 配置保存在哪里

| 内容 | 保存方式 |
| --- | --- |
| 网关地址、模型列表、models.dev 代理、web 行为 | profile 的 Cordis patch 中 `dsh-llm-omniroute` 插件行的配置（volatile 字段） |
| API 密钥 | dsh credentials store，固定引用名 `omniroute` |
| 插件启用状态 | profile 的 `package.json` → `dsh.profile.bundles` |
| web seam 指向 | profile 自己的 Cordis patch 里的 `- id: web` 覆盖（`searchProvider` / `fetchProvider`） |

Web 设置页写入的就是上述 profile patch 的 volatile 字段：保存后 Loader 会就地更新运行中的配置
引用，后续请求使用新值；正在进行的请求继续使用启动该请求时的配置。密钥不写入 YAML，也不通过
`OMNIROUTE_API_KEY` 读取；`OMNIROUTE_BASE_URL`（受信启动层）可以作为网关地址的兜底来源。

## 手动配置示例

多数用户使用 Web 设置页即可，无需手动改文件；如果同一字段在设置页被修改过，设置页的值优先。

```yaml
- id: dsh-llm-omniroute
  name: dsh-llm-omniroute
  config:
    baseURL: http://127.0.0.1:20128/v1
    models:
      - id: agy/gemini-3.8-flash          # 原生 id（网关按等级路由，见下）
        name: Gemini 3.8 Flash[agy]
        contextWindow: 1048576
        maxTokens: 65536
        vision: true
        toolCalling: true
        reasoningEfforts: [low, high]
        defaultReasoningEffort: high
        effortModels:
          high: agy/gemini-3.8-flash-high
          low: agy/gemini-3.8-flash-low
      - id: no-think/agy/claude-sonnet-4-6 # 无等级：只给 None
        reasoningEfforts: [none]
        defaultReasoningEffort: none
    modelExcludePatterns: [embed, rerank, ranker]
    defaultContextWindow: 128000
    streamIdleTimeoutMs: 300000
    proxy:
      enabled: false
      url: http://127.0.0.1:7890
    web:
      enabled: true
      maxResults: 8
      snippetMaxChars: 600
      fetchFormat: markdown
```

## 字段速查

| 字段 | 默认值 | 用途 |
| --- | --- | --- |
| `baseURL` | 受信启动环境的 `OMNIROUTE_BASE_URL`，否则 `http://127.0.0.1:20128/v1` | 网关基础地址，包含 `/v1`；`/models`、`/chat/completions`、`/search`、`/web/fetch` 都追加在它后面 |
| `models` | `[]` | 模型选择器中的目录，可在 Web 获取或手动新增 |
| `groupLabels` | `{}` | 分组显示名，键为 id 的第一个路径段；只影响设置页与模型列表（对话里的模型选择器）的展示 |
| `modelExcludePatterns` | `['embed', 'rerank', 'ranker']` | 获取模型时按 ID 子串排除，不区分大小写；整体替换默认值，`[]` 关闭该过滤（能力字段过滤仍然生效） |
| `defaultContextWindow` | `128000` | 模型未配置上下文容量时的回退值 |
| `maxTokens` | 不设置 | 全局输出上限；模型自己的 `maxTokens` 优先，均未设置则不发送 `max_tokens` |
| `streamIdleTimeoutMs` | `300000` 毫秒 | 等待下一段流数据的超时，不是整个回答的总时限 |
| `proxy.enabled` / `proxy.url` | `false` / `http://127.0.0.1:7890` | 仅为 models.dev 参数下载显式指定 HTTP 代理 |
| `providerHints` | 内置家族匹配规则 | 调整 models.dev 参数匹配的数据来源，见下文 |
| `retryPolicy` | 宿主默认策略 | 使用对应宿主版本 `RetryPolicySchema` 定义的字段 |
| `web.enabled` | `true` | 是否注册 `omniroute` 搜索/抓取 provider |
| `web.searchProvider` | 空 | 固定某个网关侧搜索 provider（如 `exa-search`、`ollama-search`）；空则由网关按查询路由 |
| `web.maxResults` | `8` | 工具未给上限时向网关请求的结果数 |
| `web.snippetMaxChars` | `600` | 单条来源摘要上限；网关的 snippet 是整段正文抽取，不截断会灌满上下文 |
| `web.fetchProvider` | 空 | 固定某个网关侧抓取 provider（如 `firecrawl`、`jina-reader`） |
| `web.fetchFormat` | `markdown` | 向网关请求的抽取格式：`markdown` / `html` / `links` / `screenshot` |
| `web.fetchMaxChars` | `100000` | 单次抓取的正文上限，超出截断并置 `truncated` |
| `web.timeoutMs` | `30000` | 搜索或抓取单次请求的时限 |

每个模型必须有唯一且非空的 `id`，可选字段为 `name`、`description`、`contextWindow`、`maxTokens`、
`vision`、`toolCalling`、`reasoningEfforts`、`defaultReasoningEffort`、`effortModels`。容量必须为
正整数。Web 容量输入框支持 `128K`、`1M`（分别为 128000、1000000），YAML 使用整数。

设置页按 id 的第一个路径段给模型分组，候选列表可以整组折叠，全选按钮在满选时切换为反选；
`groupLabels` 为分组设置显示名，组内模型显示为「[显示名]尾段」，设置页的行与模型选择器里的名字
是同一套拼法（分组名、尾段与显示名拼法定义在 `src/group.ts`，宿主与浏览器半共用）。分组与显示名
只影响展示，不改写模型 id 与请求内容；改完保存后，下一次列取模型即按新显示名给出名字。

`effortModels` 的键必须是 `reasoningEfforts` 中声明过的等级，值不能为空——写错会在保存时被拒绝。

## 模型列表与能力映射

「获取模型」直接解析网关 `/v1/models`：

| 网关字段 | 插件字段 |
| --- | --- |
| `context_length`，否则 `max_input_tokens` | `contextWindow` |
| `max_output_tokens`，否则 `max_tokens` | `maxTokens` |
| `capabilities.vision` 或 `input_modalities` 含 `image` | `vision`（仅展示；本路由仍声明纯文本输入） |
| `capabilities.tool_calling` | `toolCalling`（仅展示） |
| `capabilities.effort_tiers` | `reasoningEfforts`（**仅当 id 未限定等级**） |

非 chat 条目按 `type`（`embedding`、`rerank`…）与 `supported_endpoints`（不含 `chat`）剔除，再叠加
`modelExcludePatterns` 的 ID 名过滤。名称过滤无法识别所有非对话模型（例如 `bge-m3`），手动把模型
加进目录也不会让它获得 chat 能力。

## 思考等级的优先级

网关是聚合层：`capabilities.effort_tiers` 来自整家 provider 的同步，不是逐模型探测，可能列出某个
具体路由并不接受的等级（实测 `agy/gemini-3.8-flash-high` 声明 `none…max`，而只有 `high`/`low`/
`medium` 能路由）。因此规则是**先看 id，再看声明**：

| id 形态 | 结果 |
| --- | --- |
| 含 `nothink` / `no-think` / `no_thinking` / `notthinking` 等标记 | 只给 `None`（`reasoningEfforts: [none]`），发送 `reasoning_effort: none` |
| 以已知等级词结尾（`-none`、`-minimal`、`-low`、`-medium`、`-high`、`-xhigh`、`-max`） | 折叠成原生 id；同一原生 id 的所有已暴露等级合成**一行**；每个等级记录 `effortModels` 映射 |
| 以上都不是 | id 原样；等级取自 `effort_tiers`（若有），发送 `reasoning_effort` |

折叠后的行只发送网关**已经列出**的 id。名字里恰好以等级词结尾的路由（如 `qwen-max`）也会被折叠
成 `qwen` + 等级 `max`；行的默认等级即那一档，运行时会把它物化进请求，因此实际发送的仍是
`qwen-max`。不认同时可在设置页把该行 id 改回去，并清掉 `effortModels`。

采纳的行会写入一个默认等级：单档即该档，多档取最强档。设置页的默认等级选择器还提供
「不传（使用模型默认值）」；它只适用于 id 不绑定等级的行，选中后请求不带 `reasoning_effort`，由
网关应用模型自己的默认值。id 绑定等级的行必须保留一个网关列出的等级——裸原生 id 不在 live
catalog 里，适配器在收到显式「不传」时会以 `INVALID_REQUEST` 拒绝这种组合。

models.dev 面板只在行的等级**不是**由 id 决定时才会覆盖 `reasoningEfforts`；id 限定或 no-think 的
行会显示「思考等级由模型 id 决定，未覆盖」，容量仍可正常被覆盖/填空。

## 模型参数与 models.dev

「从models.dev获取模型信息」在公共目录中匹配已有 ID，补充容量与等级，作为网关未声明字段时的兜底。
操作顺序是：**获取模型 → 查询参数 → 核对来源 → 应用 → 保存**。

匹配优先使用内置家族规则（GPT → OpenAI、Claude → Anthropic、GLM → Z.ai 等）。目录没有精确版本时
可能使用同供应商的近似型号；「官方」只表示目录来源的优先级，不代表网关能力经过认证。需要调整
来源时：

```yaml
providerHints:
  defaults:
    glm: zhipuai
  models:
    tencent/Hunyuan-MT-7B: nano-gpt
```

## web_search / web_fetch

`web` 是官方核心行，bundle 不允许覆盖它，因此 seam 的指向由 **profile 自己的**
`cordis.patch.yml` 声明：

```yaml
- id: web
  config:
    searchProvider: omniroute
    fetchProvider: omniroute
```

两个 provider 分别转发到：

- 搜索 → `POST {baseURL}/search`（`{query, max_results, provider?}`），`results[]` 映射成 seam 的
  `sources[]`，`answer.text` 映射成 `content`；snippet 按 `web.snippetMaxChars` 截断。
- 抓取 → `POST {baseURL}/web/fetch`（`{url, format, include_metadata}`），返回的 markdown 作为
  `{kind: 'text'}` 正文；`statusCode` 取网关 provider 报告的状态（如 Firecrawl 的
  `metadata.statusCode`），否则为 200。

两条路径都用同一份 `baseURL` 与同一把密钥，浏览器不发起跨域请求。0.2.1 起 `web` 行的
`searchProvider` / `fetchProvider` 是 volatile 字段，网页搜索设置里的切换对下一次搜索或抓取生效，
不需要重启宿主。

不加那两行时，profile 的 `web` 行保留自己的选择：默认是 `deepseek-official` / `http`，打开网页搜索
设置里的 DeepSeek Search/Fetch API 开关后换成 `deepseek-search-api` / `deepseek-fetch-api`；本网关的
provider 仍会注册，但不会被选中。若 `web` 行把某一项留空而同时有多个可用 provider，seam 才会报
`WEB_PROVIDER_AMBIGUOUS`。

注意：`dsh-web-search-omniroute` 这个独立的搜索插件用的是**同一个** provider id `omniroute`。两个插件
同时安装时，启动会因重复注册而报 `WEB_DUPLICATE_PROVIDER: omniroute`；只保留一个，或者先执行
`dsh plugin --profile web remove dsh-web-search-omniroute`。

## 两种代理设置的区别

| 设置 | 影响范围 |
| --- | --- |
| 插件设置页中的代理 | 显式覆盖 models.dev 参数下载，不直接改动网关请求的代理配置 |
| dsh 的启动环境代理 | 宿主通过 `dsh-http-proxy` 安装全局 dispatcher 路由普通 fetch，包括网关请求及未指定插件代理的 models.dev 下载 |

因此，“关闭插件代理”不等于强制直连。设置页已把这一点写在代理开关下方；下载失败时插件提示检查到
models.dev 的网络路径，或为本插件单独配置代理。

## 常见故障

### 保存失败或配置看起来没有更新

先查看设置页的具体错误。空 ID、重复 ID、非法地址、错误容量、`effortModels` 里未声明的等级都会被
拒绝。设置修改基于读取时的 revision；如果配置同时在别处变更，重新加载后再编辑。

地址、模型等设置与密钥分两步保存，不是一个事务。如果密钥保存失败，其他设置可能已经写入；修复
密钥问题后重试即可，不要据此判断所有修改都已回滚。

### 认证失败

`MISSING_CREDENTIAL` 表示尚未保存可用密钥；`AUTH` 通常表示网关拒绝密钥或权限不足。确认密钥属于
当前地址对应的网关。输入框留空只保留原密钥，不执行删除。

### 请求失败、超时或工具调用出错

检查网关是否提供 `/chat/completions`，模型 ID 是否准确，以及该模型是否支持工具调用和所选思考
等级。若报 `Model '…' is not available in the active live catalog`，说明该行的 id 被改成了网关并不
路由的原生 id——重新获取模型，或改选行内映射的等级。HTTP 429 常与限流有关，5xx 常与网关或上游
有关；流长时间没有数据时会触发空闲超时。

### 获取模型为空的常见原因

- `modelExcludePatterns` 把该模型名过滤掉了（`embed`、`rerank`、`ranker` 默认生效）。
- 条目声明了非 chat 的 `type` 或 `supported_endpoints`。
- 网关侧该 provider 没有可用连接，`/v1/models` 本来就没列出它。

反馈问题时附上 dsh 版本、插件版本、失败操作、模型 ID 和脱敏后的错误。不要附 API 密钥或 Web 启动
链接中的认证 token。
