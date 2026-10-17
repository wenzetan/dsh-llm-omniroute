# dsh-omniroute

[English](README.md) | **中文**

在 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（dsh）中使用你的
[OmniRoute](https://github.com/diegosouzapw/OmniRoute) 网关。

插件把网关注册为 **`omniroute`** 供应商路由（dsh Web 中显示名 **Custom Provider**），并把网关
真正暴露出来的能力接进 dsh：

- **对话**：走 `/v1/chat/completions`，流式还原文本、思考内容与工具调用。
- **模型列表由 `/v1/models` 映射**：上下文窗口、输出上限、图片与工具调用能力、思考等级，一次
  获取即可用，不需要第二份目录。
- **思考等级按网关的命名规则处理**：`no-think/…` 这类路由只给 `None`；id 里带等级的
  （`…-high`、`…-low`）折叠回原生 id，发送时按所选等级换成对应 id；只有 id 本身不含等级时才
  采用网关声明的 `effort_tiers`。
- **`web_search` / `web_fetch` 走网关自己的检索栈**（`POST /v1/search`、
  `POST /v1/web/fetch`），不再落到出厂的 `deepseek-official`（它需要 DeepSeek 凭据）。

不需要改 dsh。API 密钥存在 dsh 凭据库的固定引用 `omniroute` 下，在设置页填写、不回显。

## 安装

需要 Node.js 与 pnpm。宿主用 npm 安装，插件装进跑 Web 界面的 profile（通常是 `web`）：

```sh
npm install -g @deepseek-ai/dsh@0.2.0-rc.2
npm install -g pnpm

# 从本地检出安装（本仓库当前的用法）
dsh plugin --profile web add file:/path/to/dsh-omniroute

# 或直接从仓库 tag 安装
dsh plugin --profile web add "github:<owner>/dsh-omniroute#v0.2.0-rc.2-v0.1"
```

`dsh plugin add` 会写 profile 依赖、把 `dsh-omniroute` 追加进 `dsh.profile.bundles`，并把包装进
profile。老宿主上若 bundle 条目缺失，按下面的片段核对并补齐（**不要**整份替换文件）：

```json
{
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "dsh-omniroute"
      ]
    }
  }
}
```

bundle patch（`cordis.patch.yml`）会插入插件行，并把 web seam 指向本网关；两个条目在缺少目标行
的组合里会被安全跳过。装完重启 dsh Web。

## 首次使用

1. 打开 dsh Web 设置里的 **Custom Provider**。
2. 填网关地址（**含 `/v1`**，本机 OmniRoute 是 `http://127.0.0.1:20128/v1`）与 API 密钥。
3. 点 **获取模型**。插件询问网关 `/v1/models`，把每条声明的事实摆出来：容量、能力开关、思考
   等级；不能服务 chat 的条目（embedding、rerank）会被过滤。
4. 勾选需要的模型并添加。采纳的行保留网关自己的事实，包括「等级 → 模型 id」映射。
5. 点 **保存**，然后在对话的模型选择器里选 `omniroute` 供应商下的模型。

`web_search` / `web_fetch` 无需额外步骤：被 pin 的 `omniroute` web provider 会用同一个网关地址
和同一把密钥。只有在你想固定某个网关侧搜索/抓取 provider 时，才需要动
`web.searchProvider` / `web.fetchProvider`。

## 思考等级

网关是聚合层，它的 `capabilities.effort_tiers` 来自整家 provider 的同步而不是逐模型探测，可能
列出某个具体路由并不接受的等级。模型 id 是更强的证据，因此优先：

| 网关暴露的 id | 插件给出的模型行 | 请求实际发送 |
| --- | --- | --- |
| `no-think/<provider>/<model>` | id 原样，等级只有 `None` | 同一 id；`reasoning_effort: none` |
| `<provider>/<model>-<等级>`（只有一档） | 原生 id `<provider>/<model>`，默认勾选该等级 | 该等级对应的网关 id |
| `<provider>/<model>-<等级>`（多档） | 每个原生 id **只有一行**，包含所有已暴露等级 | 所选等级对应的网关 id |
| id 不含等级 | id 原样，等级取自 `effort_tiers` | id 原样 + `reasoning_effort` |

折叠永远配着反向映射（行里的 `effortModels`），而且插件只会发送网关自己列出的 id——绝不发送列表
里不存在的原生 id。名字里恰好以等级词结尾的路由（`qwen-max`）同样会折叠；行内的等级映射会把
网关 id 发回去，不认同也可以手工改行。

## 能力与边界

| 能力 | 行为 |
| --- | --- |
| 文本 / 思考内容 / 工具调用 | 流式；所选等级要么作为 `reasoning_effort`，要么折进模型 id |
| 模型发现 | `GET /v1/models`；非 chat 条目按能力字段（`type`、`supported_endpoints`）与可配置的 id 名过滤剔除 |
| 容量映射 | `context_length`/`max_input_tokens` → 上下文窗口，`max_output_tokens`/`max_tokens` → 输出上限 |
| 图片输入 | 网关的 `vision` 标记会被保留并展示，但本路由声明为纯文本输入：序列化器目前还不能发送图片，谎报会让宿主接受注定失败的请求 |
| 工具调用 | 网关的 `tool_calling` 标记会被保留并展示；dsh 没有对应的逐模型声明字段 |
| models.dev | 可选的兜底来源；对 id 已限定等级的行不会覆盖等级 |
| API 密钥 | 设置页保存、不回显；留空保持已存密钥 |
| 多网关 | 目前一条 `omniroute` 路由、一份网关配置 |

## 排障

| 现象 | 先查什么 |
| --- | --- |
| 设置里没有 **Custom Provider** | `web` profile、bundle 条目、宿主版本、是否重启了 Web |
| 提示缺少密钥 | 在设置页填写并保存；插件不读 `OMNIROUTE_API_KEY` 环境变量 |
| 获取模型失败 | `/v1` 地址、密钥、网关是否支持 `/v1/models` |
| 模型列表为空 | id 名过滤（`modelExcludePatterns`），以及条目是否声明了非 chat 的 `type` |
| 请求报 `Model '…' is not available in the active live catalog` | 该行的 id 可能被手工改成了网关并不路由的原生 id；重新获取模型，或改选行内映射的等级 |
| `web_search` 报 `WEB_PROVIDER_AMBIGUOUS` | 把 `web.searchProvider` pin 到 `omniroute`（bundle patch 已经这么做） |
| 启动报 `WEB_DUPLICATE_PROVIDER: omniroute` | 另一个已装插件占用了同一个 web provider id，已知的是 `dsh-web-search-omniroute`；两者只留一个 |
| models.dev 下载失败 | 网络与代理设置；插件代理只作用于这次下载，宿主自身也可能套用自己的环境代理 |
| 安装时提示 missing peer | 宿主运行时自带这些包；装完能正常启动就不必再装一份 |

## 文档

- [配置与排障](docs/configuration.md)：全部字段、思考等级规则、models.dev 面板、代理与保存失败。
- [开发与 RC 发布](docs/development.md)：构建、测试、产物。
- [实现设计](DESIGN.md)：代码地图、数据流与实现取舍。

## 版本号规则

插件版本跟随宿主：`<dsh 版本>-v<插件序号>`（如 `0.2.0-rc.2-v0.1`），Git tag 带 `v` 前缀。当前
支持 dsh `0.2.0-rc.2` 宿主线，更旧的宿主会被明确拒绝；兼容性以宿主**线**为单位，
`npm run test:host` 会把实际导出面与仓库内快照比对，而不是假设兼容。
