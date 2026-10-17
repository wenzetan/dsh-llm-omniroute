# dsh-llm-omniroute

**English** | [中文](README.zh-CN.md)

Use your [OmniRoute](https://github.com/diegosouzapw/OmniRoute) gateway in
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (dsh).

The plugin registers the gateway as the **`omniroute`** provider route — shown as
**Custom Provider** in dsh Web — and adapts what the gateway actually exposes:

- **Chat completions** over `/v1/chat/completions`, streamed back as text,
  reasoning and tool calls.
- **A model list mapped from `/v1/models`**: context window, output cap, vision
  and tool-calling capability, and the model's thinking levels — no second
  catalog needed.
- **Thinking levels that respect the gateway's naming**: a `no-think/…` route
  offers `None` only; a route whose id carries the level (`…-high`, `…-low`)
  folds back to the native id and sends the id matching the selected level;
  only an id that encodes no level uses the advertised `effort_tiers`.
- **`web_search` / `web_fetch` backed by the gateway's own retrieval stack**
  (`POST /v1/search`, `POST /v1/web/fetch`) instead of the shipped
  `deepseek-official` search provider, which needs a DeepSeek credential.

No dsh modification is required. The API key lives in the dsh credentials store
under the fixed reference `omniroute`; it is configured on the settings page and
never echoed back.

## Install

You need Node.js and pnpm. Install the host with npm, then install this plugin
into the dsh profile that runs your Web UI (usually `web`):

```sh
npm install -g @deepseek-ai/dsh@0.2.0-rc.2
npm install -g pnpm

# from a checkout
dsh plugin --profile web add file:/path/to/dsh-llm-omniroute

# or straight from this repository; pin a published tag once one exists
dsh plugin --profile web add "github:wenzetan/dsh-llm-omniroute#main"
```

`dsh plugin add` writes the profile dependency, appends `dsh-llm-omniroute` to
`dsh.profile.bundles`, and installs the package into the profile. If the bundle
entry is missing on an older host, append it beside the existing entries — this
is a JSON fragment to check, **not** a replacement for the whole file:

```json
{
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "dsh-llm-omniroute"
      ]
    }
  }
}
```

The bundle patch (`cordis.patch.yml`) mounts the plugin row. Restart dsh Web
after installing.

To route `web_search` / `web_fetch` through this gateway, add the seam pin to
the **profile's own** `cordis.patch.yml` (`web` is an official core row, so a
bundle must not override it):

```yaml
- id: web
  config:
    searchProvider: omniroute
    fetchProvider: omniroute
```

Without the pin, the seam sees two usable search providers — the shipped
`deepseek-official` one and this gateway's — and answers
`WEB_PROVIDER_AMBIGUOUS`.

## First use

1. Open **Custom Provider** in the dsh Web settings.
2. Enter the gateway base URL **including `/v1`** (for a local OmniRoute:
   `http://127.0.0.1:20128/v1`) and the API key.
3. Click **Fetch models**. The plugin asks the gateway's `/v1/models` and shows
   what each entry declares: capacities, capability flags and thinking levels.
   Entries that cannot serve chat (embedding, rerank) are filtered out.
4. Select the models you want and add them. Each adopted row keeps the
   gateway's own facts, including the level → model-id map for id-bound routes.
5. Click **Save**, then pick a model under the `omniroute` provider in the
   conversation model picker.

`web_search` / `web_fetch` then send to the same gateway base with the same key.
Use the provider-id fields only if you want to pin one gateway-side search or
fetch provider.

## Thinking levels

The gateway is an aggregation layer, and its `capabilities.effort_tiers` field
comes from a whole-provider sync rather than a per-model probe — it can list
levels a specific route rejects. The model id is the stronger evidence, so it
wins:

| Advertised id | What the plugin exposes | What a request sends |
| --- | --- | --- |
| `no-think/<provider>/<model>` | The id itself, levels = `None` only | The same id; `reasoning_effort: none` |
| `<provider>/<model>-<level>` (one level) | The native id `<provider>/<model>`, that level preselected | The advertised id for that level |
| `<provider>/<model>-<level>` (several levels) | **One** row per native id, every advertised level | The advertised id matching the selected level |
| Any id that encodes no level | The id itself, levels from `effort_tiers` | The id itself + `reasoning_effort` |

Folding is always paired with the reverse map (`effortModels` in the row), and
the plugin only ever sends ids the gateway advertised — it never sends a native
id that the listing does not carry. A route whose *name* merely ends in an
effort word (`qwen-max`) folds too; the row's level map sends the advertised id
back, and the row can be edited by hand if you disagree.

## Capabilities and limits

| Feature | Behavior |
| --- | --- |
| Text, reasoning content, tool calls | Streaming; the selected level is sent as `reasoning_effort` or folded into the model id |
| Model discovery | `GET /v1/models`; non-chat entries are dropped by capability fact (`type`, `supported_endpoints`) and by the configurable id-name filter |
| Capacities | `context_length`/`max_input_tokens` → context window, `max_output_tokens`/`max_tokens` → output cap |
| Image input | The gateway's `vision` flag is kept and shown, but this route declares text-only input: the serializer cannot send images yet, and declaring otherwise would let the host accept requests that must fail |
| Tool calling | The gateway's `tool_calling` flag is kept and shown; the harness has no per-model declaration for it |
| models.dev | Optional fallback for rows the gateway leaves thin; it never overwrites levels that the model id already fixes |
| API key | Saved through settings, never echoed; blank input keeps the stored key |
| Multiple gateways | One `omniroute` route and one gateway configuration |

## Troubleshooting

| Symptom | Check first |
| --- | --- |
| No **Custom Provider** settings page | The `web` profile, the bundle entry, the host version, and whether Web was restarted |
| Missing credential | Enter and save the key on the settings page; the plugin reads no `OMNIROUTE_API_KEY` environment variable |
| Model discovery fails | The `/v1` base URL, the key, and gateway support for `/v1/models` |
| Empty model list | The id-name filter (`modelExcludePatterns`) and whether the entries declare a non-chat `type` |
| A request fails with `Model '…' is not available in the active live catalog` | The row's id may be hand-edited to a native id the gateway does not route; re-fetch the models or pick the row's mapped level |
| `WEB_PROVIDER_AMBIGUOUS` on `web_search` | Pin `web.searchProvider: omniroute` in the profile patch |
| `WEB_DUPLICATE_PROVIDER: omniroute` at boot | Another installed plugin owns the same web provider id — `dsh-web-search-omniroute` is the known one; keep only one of them |
| models.dev download fails | Network and proxy settings; the plugin proxy applies to that download only, and dsh may also apply its own environment proxy |
| Missing-peer warnings during install | dsh supplies the host packages at runtime; if install and startup succeed, do not add duplicate host packages |

## Environment notes

On a machine whose environment exports `GIT_CONFIG_COUNT`, `git` fails with a missing `GIT_CONFIG_KEY_0`
instead of running the command. Strip those variables for repository work:

```bash
env -u GIT_CONFIG_COUNT -u GIT_CONFIG_VALUE_0 -u GIT_CONFIG_VALUE_1 git status
```

## Documentation

The detailed guides are currently in Chinese:

- [Configuration and troubleshooting](docs/configuration.md): every field, the
  thinking-level rules, the models.dev panel, proxies and save failures.
- [Development and RC releases](docs/development.md): builds, tests, artifacts.
- [Design](DESIGN.md): source map, data flow and implementation decisions.

## Version scheme

The plugin version follows the host: `<dsh version>-v<plugin revision>`
(`0.2.0-rc.2-v0.1`), and a Git tag carries a `v` prefix. It supports the dsh
`0.2.0-rc.2` host line and rejects older hosts with an explicit upgrade message;
compatibility is keyed to a host *line*, and `npm run test:host` compares the
installed export surface against the checked-in snapshot instead of assuming.
