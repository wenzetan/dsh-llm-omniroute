# 开发与发布

[返回 README](../README.zh-CN.md) · [配置指南](configuration.md) · [实现设计](../DESIGN.md)

本文面向维护者。当前包版本为 `0.2.1-rc.2-v0.1`，适配 dsh `0.2.1-rc.2` 单宿主线。

## 版本号规则

插件版本号跟随宿主，格式为 `<dsh 版本>-v<本插件序号>`，Git 标签在包版本前加 `v`：

- dsh `0.2.1-rc.2` → 包版本 `0.2.1-rc.2-v0.1`，标签 `v0.2.1-rc.2-v0.1`；
- 同一宿主线上的后续改动只递增最后一段：`0.2.1-rc.2-v0.2`、`0.2.1-rc.2-v0.3`……；
- 宿主换线（例如 `0.2.2-rc.1`）时，前面的段跟随新宿主版本，序号重新从 `v0.1` 起；
- 包版本的 `version` 字段不能带前导 `v`，标签才能带。

CI 用 `LATEST_LINE`（release job 的环境变量）指定当前主推宿主线，当前为 `v0.2.1`：rc 标签走 GitHub
Pre-release，宿主段没有 `-rc.N` 的正式标签走正式 Release。切换主推线时改 `LATEST_LINE` 一行即可。
`promote` workflow 手动触发，把一个已通过 CI 的 rc 标签派生为只改版本号的正式提交与标签。

开发依赖与 CI 固定宿主都是 **`0.2.1-rc.2`**，peer 下限与运行时最低版本同样是 **`0.2.1-rc.2`**。
固定值表示构建与验证所针对的版本，下限表示插件仍愿意接受的最低版本。上游若以不同的补丁号重切
RC，`test/fixtures/dsh-llm-0.2.1-rc.2.exports.json` 里的 `surfaceSharedBy` 决定它是否被接受；门禁
失败时按「适配新宿主时的顺序」处理，不要直接抬低下限。

## 本地构建

使用 Node.js 24，与 CI 保持一致。在仓库根目录执行：

```sh
npm ci
npm run typecheck
npm run build
npm test
```

`npm ci` 复现锁文件依赖。调整依赖时改用 `npm install` 更新锁文件，宿主相关包始终写精确版本。

构建生成 `lib/index.js`、`lib/client.js` 与类型声明。**源码改动后需要提交对应的 `lib/` 产物**，从
Git 安装的用户直接使用这些文件；CI 会重新构建并检查产物与提交是否一致。

## 本地加载插件

先完成构建，再把仓库链接到开发用的 web profile，使用真实绝对路径：

```sh
dsh plugin --profile web add "link:/path/to/dsh-llm-omniroute"
```

确认 `dsh.profile.bundles` 已登记本包后重启 dsh Web。需要检查实际分发包时执行 `npm pack`
（`prepack` 会先构建），再用输出的 `.tgz` 绝对路径执行 `dsh plugin add`，并使用隔离的 `DSH_HOME`
避免与日常设置和会话混用。

浏览器产物由宿主按内容寻址提供：改完 `src/client` 重新构建后刷新页面即可加载新版本，无需重启宿主；
宿主侧的改动仍然需要重启。

## 每项测试能证明什么

| 命令或检查 | 能验证什么 |
| --- | --- |
| `npm run typecheck` | 宿主与客户端类型是否匹配开发依赖 |
| `npm run build` | 宿主、浏览器 JS 和类型声明能否生成 |
| `npm run test:client` | Custom Provider 设置组件的交互、远程调用、状态处理与布局约定（`test/client/omniroute-section.test.tsx`） |
| `vitest run test/catalog.test.ts` | `/v1/models` 能力映射、思考等级三段规则、折叠与 wire id 反查（纯函数，无网络） |
| `npm run test:host` | 真实 workspace 的 LLM 导出、入库快照、离线链接与 0.2.0 宿主线拒绝诊断 |
| `node test/smoke.mjs` | 真实 Cordis 组合下的注册、能力映射、思考等级、web provider 注册与映射、设置与网关替身行为 |
| CI `plugin-check` | 插件清单、补丁与包结构的静态检查；hub 目录收录警告由外部仓库同步，不阻断 |
| CI `boot` | 在隔离环境安装 tarball，启动真实 Web，检查认证流程、客户端加载清单和自有 RPC 响应 |

`npm test` 依次执行客户端测试、宿主兼容检查和组合测试，不会操作真实浏览器，也不会请求真实网关。
启动页的客户端加载清单里出现插件，只说明插件已被发现，不能证明设置页在浏览器中正常工作。

对真实网关的连通性（`/v1/models`、`/v1/search`、`/v1/web/fetch`）不在 `npm test` 范围内：它需要
一把真实密钥。验收时用一次性脚本把 `lib/index.js` 的 `parseOmniRouteCatalog`、`resolveWireModel`、
两个 web provider 与 `OmniRouteAdapter.stream` 接到真实网关上跑一轮（包含一次真实对话与一次折叠 id
的 wire 替换），这类脚本不进仓库。

设置页的间距与控件尺寸以运行中宿主的实测配方为准：本地开发用无头 Chrome 打开真实设置面板，读取
元素的几何与计算样式，再据此调整 `src/client/apply.ts` 的样式表。测试里用两条约定固定结果——每个
段落都必须带类名（分节样式表统一清除浏览器默认外边距），以及样式表保留关键尺寸规则。

`npm run cache:models-dev` 可刷新开发用的公共目录缓存。缓存缺失时，对真实目录的可选检查会跳过，
不影响普通 smoke。

## 适配新宿主时的顺序

1. 核对上游固定标签的源码与实际 npm 包，确定哪些插件调用受影响。
2. 更新开发依赖和锁文件，审查 peer 范围及旧的 dependency overrides。
3. 更新宿主导出快照与 CI 的固定宿主版本。
4. 运行类型、构建、测试和打包检查，提交生成产物。
5. 用同一 tarball 验证真实宿主启动、设置页加载、凭据与配置保存、模型发现、文本与工具调用，以及
   `web_search` / `web_fetch`。0.2.1 起还要检查网页搜索设置里的 DeepSeek Search/Fetch API 开关，以及
   `web` 行的 `searchProvider` / `fetchProvider` 是 volatile 字段、改动对下一次操作生效。
6. 更新双语 README 的版本状态、安装命令与已知限制。

注意 npm 的 prerelease 范围：`>=0.2.1-rc.1` 这类范围不会自动接受 `0.2.1-rc.2`，因此 peer 范围写作
`>=0.2.1-rc.2 <0.2.2`，明确锁定这一条宿主线。最低版本 guard、peer 元数据与快照里的已验证版本是
三个不同层面的约束。

### 登记新的宿主补丁版本

`test/fixtures/dsh-llm-0.2.1-rc.2.exports.json` 的 `surfaceSharedBy` 列出实测与快照共享同一导出面的
版本。上游常以完全相同的代码重切 RC，按补丁号判定兼容会误报。遇到未列出的版本时：

1. 下载新旧两个版本的实际 npm 包，逐个文件比对，确认 `lib/**` 是否一致。
2. 用新版本安装依赖，运行 `npm run typecheck`、`npm run build` 和 `npm test`，并确认重建后的
   `lib/` 与提交一致。
3. 若导出面一致，把该版本加入 `surfaceSharedBy`；若不一致，重新生成快照并按新宿主线处理。
4. 若该版本成为开发与 CI 的默认固定值，同时更新 `package.json`、CI 的固定宿主和 README 的版本表。

从 0.2.0 线换到 0.2.1 线时，`@deepseek-ai/dsh-llm` 的运行时具名导出面完全相同（新增的是纯类型
导出），因此新快照从 0.2.1-rc.2 捕获，0.2.0-rc.2 快照保留为被拒绝宿主线的链接对照，0.1.7-rc.1
快照保留为最旧被拒绝宿主线的对照。

## 一个必须记住的运行时陷阱

`connection.rpc.handle()` 在 0.1.7 到 0.2.1 的宿主线上仍不可用：它的 `rpc` getter 捕获服务自身的
上下文，而那个作用域没有注入 `webServer`，内部 `owner.webServer.register(route)` 抛出
`cannot get property "webServer" without inject` 后被 effect 吞掉，通道静默缺失，浏览器只能撞上
SPA 回退的 405。插件改为注入 `connection` 与 `webServer`，并把自身作用域作为 owner 传给
`connection.register(owner, channel, handler)`；0.2.1 的 handler 还多一个已认证 Peer 参数，本插件
不使用它。细节见 [DESIGN](../DESIGN.md)；组合 smoke 复现了该守卫，CI 的真实启动检查是最终防线。

## 锁文件与依赖

调整宿主依赖时先移走 `node_modules` 与锁文件，再重新 `npm install`：旧子树里的 dsh 包固定在其它
宿主线上，与精确 peer 要求冲突时增量求解会报 `ERESOLVE`。重新生成的锁会顺带更新与本次改动无关的
传递依赖，评审时用 `npm ls` 对照确认没有意外的主版本跃迁。

当前依赖树没有任何 `overrides`：旧的四个别名（`dsh-type-meta`、`dsh-compact`、`dsh-paths`、
`dsh-user-interaction` 指向 `dsh-brand`）在 0.2.1 树上没有被任何包请求，已从 `package.json` 移除。
升级宿主时重新核查一遍，只有确实被请求且需要换名时才加回。

用户 profile 升级插件时，插件目录里可能残留上一次安装自带的 `node_modules/@deepseek-ai`；模块解析
优先使用这些旧包，最低版本检查就会拿旧版本报错。把
`<profile>/node_modules/dsh-llm-omniroute/node_modules/@deepseek-ai` 移出插件包再重启宿主；
`autoInstallPeers: false` 的全新安装不会生成这份副本。
