var __knownSymbol = (name2, symbol) => (symbol = Symbol[name2]) ? symbol : Symbol.for("Symbol." + name2);
var __typeError = (msg) => {
  throw TypeError(msg);
};
var __using = (stack, value, async) => {
  if (value != null) {
    if (typeof value !== "object" && typeof value !== "function") __typeError("Object expected");
    var dispose, inner;
    if (async) dispose = value[__knownSymbol("asyncDispose")];
    if (dispose === void 0) {
      dispose = value[__knownSymbol("dispose")];
      if (async) inner = dispose;
    }
    if (typeof dispose !== "function") __typeError("Object not disposable");
    if (inner) dispose = function() {
      try {
        inner.call(this);
      } catch (e) {
        return Promise.reject(e);
      }
    };
    stack.push([async, dispose, value]);
  } else if (async) {
    stack.push([async]);
  }
  return value;
};
var __callDispose = (stack, error, hasError) => {
  var E = typeof SuppressedError === "function" ? SuppressedError : function(e, s, m, _) {
    return _ = Error(m), _.name = "SuppressedError", _.error = e, _.suppressed = s, _;
  };
  var fail = (e) => error = hasError ? new E(e, error, "An error was suppressed during disposal") : (hasError = true, e);
  var next = (it) => {
    while (it = stack.pop()) {
      try {
        var result = it[1] && it[1].call(it[2]);
        if (it[0]) return Promise.resolve(result).then(next, (e) => (fail(e), next()));
      } catch (e) {
        fail(e);
      }
    }
    if (hasError) throw error;
  };
  return next();
};

// src/index.ts
import z from "@deepseek-ai/schemastery";
import { assertUsableApiKey as assertUsableApiKey2, LlmError as LlmError5, resolveRetryPolicy, RetryPolicySchema } from "@deepseek-ai/dsh-llm";
import llmManifest from "@deepseek-ai/dsh-llm/package.json" with { type: "json" };
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { launchEnvironmentOf } from "@deepseek-ai/dsh-launch-environment";
import { MAX_TIMER_DELAY_MS } from "@deepseek-ai/dsh-timeout";

// src/adapter.ts
import {
  assertUsableApiKey,
  attributionHeaders,
  CONTEXT_WINDOW_EXCEEDED_CODE,
  isContextWindowExceededError,
  isQuotaExceededError,
  LlmAdapter,
  LlmError as LlmError4,
  ProviderRequestId,
  QUOTA_EXCEEDED_CODE,
  ReasoningEffortId
} from "@deepseek-ai/dsh-llm";
import { idleWatchdog, timeoutOf } from "@deepseek-ai/dsh-timeout";
import { fetch as undiciFetch, ProxyAgent } from "undici";

// src/group.ts
var NO_THINK_MARKERS = [
  "nothink",
  "nothinking",
  "notthinking",
  "nonthinking",
  "noreasoning"
];
function routeIdOf(id) {
  const slash = id.indexOf("/");
  if (slash < 0) return id;
  const head = id.slice(0, slash).toLowerCase().replace(/[-_\s]/g, "");
  return NO_THINK_MARKERS.includes(head) ? id.slice(slash + 1) : id;
}
function groupOf(id) {
  const route = routeIdOf(id);
  const slash = route.indexOf("/");
  return slash < 0 ? "" : route.slice(0, slash);
}
function modelTail(id) {
  const slash = id.lastIndexOf("/");
  return slash < 0 ? id : id.slice(slash + 1);
}
function groupedModelName(id, name2, labels) {
  const tail = name2 !== void 0 && name2.length > 0 ? name2 : modelTail(id);
  const group = groupOf(id);
  if (group.length === 0) return tail;
  const label = labels?.[group];
  return `[${label !== void 0 && label.length > 0 ? label : group}]${tail}`;
}

// src/catalog.ts
var DEFAULT_MODEL_EXCLUDE_PATTERNS = ["embed", "rerank", "ranker"];
var EFFORT_TOKENS = ["none", "minimal", "low", "medium", "high", "xhigh", "max"];
var EFFORT_RUNG = {
  max: 7,
  xhigh: 6,
  high: 5,
  medium: 4,
  low: 3,
  minimal: 2,
  none: 1,
  default: 0
};
var NO_THINK_EFFORT = "none";
var NON_CHAT_TYPES = /* @__PURE__ */ new Set([
  "embedding",
  "embeddings",
  "rerank",
  "ranker",
  "image",
  "images",
  "audio",
  "speech",
  "transcription",
  "tts",
  "video",
  "moderation"
]);
var BRAND_SPELLING = {
  glm: "GLM",
  gpt: "GPT",
  deepseek: "DeepSeek"
};
function flattenId(id) {
  return id.toLowerCase().replace(/[^a-z0-9]+/gu, "");
}
function isNoThinkModel(id) {
  const flat = flattenId(id);
  if (flat.length === 0) return false;
  return NO_THINK_MARKERS.some((marker) => flat.includes(marker));
}
function effortSuffixOf(id) {
  const at = id.lastIndexOf("-");
  if (at <= 0 || at === id.length - 1) return void 0;
  const token = id.slice(at + 1).toLowerCase();
  return EFFORT_TOKENS.includes(token) ? token : void 0;
}
function highestEffort(efforts) {
  return [...efforts].sort((a, b) => (EFFORT_RUNG[b] ?? -1) - (EFFORT_RUNG[a] ?? -1))[0];
}
function orderEfforts(efforts) {
  const seen = /* @__PURE__ */ new Set();
  const unique = [];
  for (const effort of efforts) {
    if (effort.length === 0 || seen.has(effort)) continue;
    seen.add(effort);
    unique.push(effort);
  }
  return unique.map((effort, at) => ({ effort, at })).sort((a, b) => {
    const left = EFFORT_RUNG[a.effort];
    const right = EFFORT_RUNG[b.effort];
    if (left === void 0 && right === void 0) return a.at - b.at;
    if (left === void 0) return 1;
    if (right === void 0) return -1;
    return left - right;
  }).map((entry) => entry.effort);
}
function modelNameFromId(id) {
  const slash = id.lastIndexOf("/");
  const prefix = slash === -1 ? void 0 : id.slice(0, slash);
  const words = id.slice(slash + 1).split("-").filter((word) => word.length > 0);
  const spelled = words.map((word, at) => {
    if (word.length === 1) return word.toUpperCase();
    const brand = BRAND_SPELLING[word];
    if (brand !== void 0) return brand;
    let result = word.charAt(0).toUpperCase() + word.slice(1);
    if (at === words.length - 1) {
      result = result.replace(/([0-9.])([bkm])$/, (_match, head, tail) => head + tail.toUpperCase());
    }
    return result;
  }).join(" ");
  return prefix === void 0 ? spelled : `${spelled}[${prefix}]`;
}
function displayModelName(id, listed) {
  if (listed !== void 0 && listed.length > 0) return listed;
  return modelNameFromId(id);
}
function positiveInt(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : void 0;
}
function entryVision(entry) {
  if (entry.capabilities?.vision === true) return true;
  return (entry.input_modalities ?? []).some(
    (modality) => typeof modality === "string" && modality.trim().toLowerCase() === "image"
  );
}
function servesChat(entry) {
  const type = typeof entry.type === "string" ? entry.type.trim().toLowerCase() : "";
  if (type.length > 0 && NON_CHAT_TYPES.has(type)) return false;
  const endpoints = entry.supported_endpoints;
  if (Array.isArray(endpoints) && endpoints.length > 0) {
    return endpoints.some(
      (endpoint) => typeof endpoint === "string" && endpoint.trim().toLowerCase() === "chat"
    );
  }
  return true;
}
function entryEfforts(entry) {
  const tiers = entry.capabilities?.effort_tiers;
  if (!Array.isArray(tiers)) return [];
  return orderEfforts(
    tiers.filter((tier) => typeof tier === "string").map((tier) => tier.trim()).filter((tier) => tier.length > 0)
  );
}
function entryFacts(entry) {
  const contextWindow = positiveInt(entry.context_length) ?? positiveInt(entry.max_input_tokens);
  const maxTokens = positiveInt(entry.max_output_tokens) ?? positiveInt(entry.max_tokens);
  return {
    ...contextWindow === void 0 ? {} : { contextWindow },
    ...maxTokens === void 0 ? {} : { maxTokens },
    ...entryVision(entry) ? { vision: true } : {},
    ...typeof entry.capabilities?.tool_calling === "boolean" ? { toolCalling: entry.capabilities.tool_calling } : {}
  };
}
function entryName(entry) {
  const name2 = typeof entry.name === "string" ? entry.name.trim() : "";
  return name2.length > 0 ? name2 : void 0;
}
function parseOmniRouteCatalog(entries, options = {}) {
  const excludes = (options.excludePatterns ?? DEFAULT_MODEL_EXCLUDE_PATTERNS).map((pattern) => pattern.toLowerCase());
  const groups = /* @__PURE__ */ new Map();
  for (const entry of entries) {
    const id = typeof entry?.id === "string" ? entry.id : "";
    if (id.length === 0) continue;
    if (!servesChat(entry)) continue;
    const lower = id.toLowerCase();
    if (excludes.some((pattern) => pattern.length > 0 && lower.includes(pattern))) continue;
    const noThink = isNoThinkModel(id);
    const effort = noThink ? void 0 : effortSuffixOf(id);
    const base = effort === void 0 ? id : id.slice(0, id.length - effort.length - 1);
    const members = groups.get(base) ?? [];
    members.push({ entry, base, noThink, ...effort === void 0 ? {} : { effort } });
    groups.set(base, members);
  }
  const rows = [];
  for (const members of groups.values()) {
    const first = members[0];
    if (first === void 0) continue;
    const bare = members.find((member) => member.effort === void 0 && !member.noThink);
    const restricted = members.filter((member) => member.effort !== void 0);
    const factsSource = (bare ?? first).entry;
    const facts = entryFacts(factsSource);
    const listedName = bare !== void 0 || restricted.length === 1 || first.noThink ? entryName(factsSource) : void 0;
    const name2 = displayModelName(first.base, listedName);
    let efforts = [];
    let effortModels;
    if (first.noThink) {
      efforts = [NO_THINK_EFFORT];
    } else if (restricted.length > 0) {
      const map = {};
      for (const member of restricted) {
        const effort = member.effort;
        if (effort === void 0 || map[effort] !== void 0) continue;
        map[effort] = member.entry.id;
      }
      const bareTiers = bare === void 0 ? [] : entryEfforts(bare.entry);
      efforts = orderEfforts([...Object.keys(map), ...bareTiers.filter((tier) => map[tier] === void 0)]);
      effortModels = map;
    } else {
      efforts = entryEfforts(factsSource);
    }
    const onlyLevel = restricted.length === 1 && bare === void 0 ? restricted[0]?.effort : void 0;
    const defaultEffort = onlyLevel ?? highestEffort(efforts);
    rows.push({
      id: first.base,
      name: name2,
      ...facts,
      ...efforts.length === 0 ? {} : { reasoningEfforts: efforts },
      ...defaultEffort === void 0 ? {} : { defaultReasoningEffort: defaultEffort },
      ...effortModels === void 0 ? {} : { effortModels }
    });
  }
  rows.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return rows;
}
function resolveWireModel(row, model, effort) {
  if (effort === void 0) return { model };
  const mapped = row?.effortModels?.[effort];
  if (mapped !== void 0 && mapped.length > 0) return { model: mapped };
  return { model, reasoningEffort: effort };
}

// src/serialize.ts
import { contentHasImage, LlmError } from "@deepseek-ai/dsh-llm";
function flattenText(blocks) {
  return blocks.filter((block) => block.type === "text").map((block) => block.text).join("");
}
function assertTextOnly(blocks) {
  if (contentHasImage(blocks)) {
    throw new LlmError("The OmniRoute chat-completions adapter does not support image content.", "UNSUPPORTED_CONTENT");
  }
}
function serializeAssistant(message) {
  const text = flattenText(message.content);
  const reasoning = message.content.filter((block) => block.type === "reasoning").map((block) => block.text).join("");
  const toolCalls = message.content.filter((block) => block.type === "tool-call").map((block) => ({
    id: block.id,
    type: "function",
    function: { name: block.name, arguments: block.arguments }
  }));
  return {
    role: "assistant",
    // Text-less turns send "" — NEVER null. Pure tool-call turns: some
    // gateways reject null outright. Reasoning-ONLY turns (the model can
    // answer entirely in the reasoning channel): the wire API rejects
    // null-content/no-tool_calls assistant messages with a 400, and since
    // the message sits durably in the session log, a null here bricks every
    // later turn of that session.
    content: text,
    // DeepSeek-family upstream passback rule: reasoning_content must return
    // on tool-call turns; it is ignored on plain turns, so we drop it there
    // to save tokens.
    ...toolCalls.length > 0 && reasoning.length > 0 ? { reasoning_content: reasoning } : {},
    ...toolCalls.length > 0 ? { tool_calls: toolCalls } : {}
  };
}
function assertSupportedBlocks(message) {
  if (message.role === "developer") {
    throw new LlmError("The OmniRoute chat-completions adapter does not support developer messages.", "UNSUPPORTED_CONTENT");
  }
  if (message.content.some((block) => block.type === "tool-addition" || block.type === "tool-removal")) {
    throw new LlmError("The OmniRoute chat-completions adapter does not support tool-change blocks.", "UNSUPPORTED_CONTENT");
  }
}
function serializeMessages(messages) {
  const wire = [];
  for (const message of messages) {
    assertSupportedBlocks(message);
    assertTextOnly(message.content);
    if (message.role === "system") {
      wire.push({ role: "system", content: flattenText(message.content) });
      continue;
    }
    if (message.role === "assistant") {
      wire.push(serializeAssistant(message));
      continue;
    }
    if (message.role === "tool") {
      wire.push({
        role: "tool",
        tool_call_id: message.toolCallId,
        // Empty tool output still needs SOME content on the wire.
        content: flattenText(message.content) || "(no output)"
      });
      continue;
    }
    wire.push({ role: "user", content: flattenText(message.content) });
  }
  return wire;
}
function serializeRequest(options) {
  const messages = [];
  if (options.system !== void 0) {
    messages.push({ role: "system", content: options.system });
  }
  messages.push(...serializeMessages(options.messages));
  const tools = options.tools?.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }
  }));
  return {
    model: options.model,
    messages,
    stream: true,
    stream_options: { include_usage: true },
    ...tools !== void 0 && tools.length > 0 ? { tools } : {},
    ...options.temperature !== void 0 ? { temperature: options.temperature } : {},
    ...options.maxTokens === void 0 ? {} : { max_tokens: options.maxTokens },
    ...options.reasoningEffort !== void 0 ? { reasoning_effort: options.reasoningEffort } : {},
    ...options.stop !== void 0 ? { stop: options.stop } : {}
  };
}

// src/sse.ts
import { EventSourceParserStream } from "eventsource-parser/stream";
import { LlmError as LlmError2 } from "@deepseek-ai/dsh-llm";
var DONE = "[DONE]";
async function* parseSse(stream, onComment) {
  const events = stream.pipeThrough(new TextDecoderStream()).pipeThrough(new EventSourceParserStream({ onComment }));
  const reader = events.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      yield value.data;
      if (value.data === DONE) return;
    }
  } finally {
    reader.releaseLock();
  }
  throw new LlmError2("SSE stream ended without [DONE]", "STREAM_CLOSED");
}

// src/translate.ts
import { EMPTY_RESPONSE_CODE, LlmError as LlmError3 } from "@deepseek-ai/dsh-llm";
var toCallId = (id) => id;
function mapFinishReason(reason) {
  switch (reason) {
    case "stop":
      return { kind: "stop" };
    case "tool_calls":
      return { kind: "tool-calls" };
    case "length":
      return { kind: "max-tokens" };
    default:
      return {
        kind: "error",
        failure: { message: `model stopped: ${reason}`, code: reason.toUpperCase() }
      };
  }
}
function mapUsage(usage) {
  const cacheRead = usage.prompt_tokens_details?.cached_tokens ?? usage.prompt_cache_hit_tokens;
  const reasoning = usage.completion_tokens_details?.reasoning_tokens;
  const combined = usage.prompt_tokens + usage.completion_tokens;
  const hasValidCombined = Number.isSafeInteger(usage.prompt_tokens) && usage.prompt_tokens >= 0 && Number.isSafeInteger(usage.completion_tokens) && usage.completion_tokens >= 0 && Number.isSafeInteger(combined) && combined >= 0 && (usage.total_tokens === void 0 || usage.total_tokens === combined);
  return {
    inputTokens: usage.prompt_tokens - (cacheRead ?? 0),
    outputTokens: usage.completion_tokens,
    ...cacheRead !== void 0 ? { cacheReadTokens: cacheRead } : {},
    ...reasoning !== void 0 ? { reasoningTokens: reasoning } : {},
    ...hasValidCombined ? { totalTokens: combined } : {}
  };
}
function closeBlock(block) {
  switch (block.kind) {
    case "text":
      return { type: "text", text: block.text };
    case "reasoning":
      return { type: "reasoning", text: block.text };
    case "tool-call":
      return {
        type: "tool-call",
        id: toCallId(block.callId ?? ""),
        name: block.name ?? "",
        arguments: block.text
      };
  }
}
async function* translate(payloads) {
  let nextIndex = 0;
  let textBlock;
  let reasoningBlock;
  const toolBlocks = /* @__PURE__ */ new Map();
  const order = [];
  let pendingFinish;
  let pendingUsage;
  function open(kind) {
    const block = { index: nextIndex++, kind, text: "" };
    order.push(block);
    return block;
  }
  for await (const payload of payloads) {
    if (payload === DONE) {
      for (const block of order) {
        yield { type: "block-end", index: block.index, block: closeBlock(block) };
      }
      if (pendingUsage) yield { type: "usage", usage: pendingUsage };
      const reason = pendingFinish ?? { kind: "stop" };
      yield {
        type: "finish",
        reason: reason.kind === "stop" && order.length === 0 ? {
          kind: "error",
          failure: { message: "model returned a completed response with no content", code: EMPTY_RESPONSE_CODE }
        } : reason
      };
      return;
    }
    let chunk;
    try {
      chunk = JSON.parse(payload);
    } catch {
      throw new LlmError3(`malformed SSE payload: ${payload.slice(0, 120)}`, "MALFORMED_RESPONSE");
    }
    for (const choice of chunk.choices ?? []) {
      const delta = choice.delta;
      const reasoning = delta?.reasoning_content;
      if (typeof reasoning === "string" && reasoning.length > 0) {
        if (!reasoningBlock) {
          reasoningBlock = open("reasoning");
          yield { type: "block-start", index: reasoningBlock.index, blockType: "reasoning" };
        }
        reasoningBlock.text += reasoning;
        yield { type: "reasoning-delta", index: reasoningBlock.index, text: reasoning };
      }
      const content = delta?.content;
      if (typeof content === "string" && content.length > 0) {
        if (!textBlock) {
          textBlock = open("text");
          yield { type: "block-start", index: textBlock.index, blockType: "text" };
        }
        textBlock.text += content;
        yield { type: "text-delta", index: textBlock.index, text: content };
      }
      for (const call of delta?.tool_calls ?? []) {
        let block = toolBlocks.get(call.index);
        if (!block) {
          block = open("tool-call");
          toolBlocks.set(call.index, block);
          yield { type: "block-start", index: block.index, blockType: "tool-call" };
        }
        const id = call.id;
        if (typeof id === "string" && id.length > 0) block.callId = id;
        const name2 = call.function?.name;
        if (typeof name2 === "string" && name2.length > 0) block.name = name2;
        const rawArguments = call.function?.arguments;
        const fragment = typeof rawArguments === "string" ? rawArguments : "";
        block.text += fragment;
        yield {
          type: "tool-call-delta",
          index: block.index,
          id: toCallId(block.callId ?? ""),
          ...block.name !== void 0 ? { name: block.name } : {},
          argumentsDelta: fragment
        };
      }
      if (typeof choice.finish_reason === "string") {
        pendingFinish = mapFinishReason(choice.finish_reason);
      }
    }
    if (chunk.usage) pendingUsage = mapUsage(chunk.usage);
  }
  throw new LlmError3("SSE payload stream ended without [DONE]", "STREAM_CLOSED");
}

// src/adapter.ts
var PKG = "dsh-llm-omniroute";
var DEFAULT_STREAM_IDLE_TIMEOUT_MS = 3e5;
var DEFAULT_CONTEXT_WINDOW = 128e3;
var STREAM_IDLE_TIMEOUT_CODE = "LLM_STREAM_IDLE_TIMEOUT";
var MODELS_DEV_API_URL = "https://models.dev/api.json";
var MODELS_DEV_TIMEOUT_MS = 3e4;
function modelsDevMatch(provider, entry) {
  const contextWindow = entry.limit?.context;
  const maxTokens = entry.limit?.output;
  const reasoningEfforts = entry.reasoning_options?.filter((option) => option?.type === "effort").flatMap((option) => (option.values ?? []).filter((value) => typeof value === "string" && value.length > 0));
  if (contextWindow === void 0 && maxTokens === void 0) return void 0;
  return {
    provider,
    ...entry.name !== void 0 && entry.name.length > 0 ? { name: entry.name } : {},
    ...contextWindow !== void 0 ? { contextWindow } : {},
    ...maxTokens !== void 0 ? { maxTokens } : {},
    ...reasoningEfforts !== void 0 && reasoningEfforts.length > 0 ? { reasoningEfforts } : {}
  };
}
var DEFAULT_PROVIDER_HINTS = {
  defaults: {
    glm: "zai",
    gpt: "openai",
    o: "openai",
    claude: "anthropic",
    deepseek: "deepseek",
    gemini: "google",
    grok: "xai",
    hunyuan: "tencent",
    qwen: "alibaba",
    kimi: "moonshotai",
    // xiaomi is the vendor key mimo models live under (mimo-v2* family);
    // no separate xiaomimimo provider exists in the catalog.
    mimo: "xiaomi",
    minimax: "minimax"
  }
};
function hintedProvider(id, bare, hints) {
  const exact = hints?.models?.[id] ?? hints?.models?.[bare];
  if (exact !== void 0) return exact;
  const lower = bare.toLowerCase();
  const entries = Object.entries({ ...DEFAULT_PROVIDER_HINTS.defaults, ...hints?.defaults });
  const hit = entries.filter(([prefix]) => lower.startsWith(prefix.toLowerCase())).sort((a, b) => b[0].length - a[0].length)[0];
  return hit?.[1];
}
function matchModelsDev(api, id, hints) {
  const bare = id.slice(id.lastIndexOf("/") + 1);
  const keys = /* @__PURE__ */ new Set([id, bare]);
  const hinted = hintedProvider(id, bare, hints);
  const exact = /* @__PURE__ */ new Map();
  const near = /* @__PURE__ */ new Map();
  for (const [provider, catalog] of Object.entries(api)) {
    const models = catalog?.models;
    if (models === void 0 || typeof models !== "object") continue;
    for (const key of keys) {
      const entry = models[key];
      if (entry === void 0 || typeof entry !== "object") continue;
      const match = modelsDevMatch(provider, entry);
      if (match !== void 0) exact.set(provider, match);
    }
    if (provider === hinted && !exact.has(provider)) {
      const hit = Object.keys(models).filter((key) => key.includes(bare) || bare.includes(key)).map((key) => ({ key, entry: models[key] })).sort((a, b) => a.key.length - b.key.length)[0];
      const entry = hit?.entry;
      const match = entry === void 0 ? void 0 : modelsDevMatch(provider, entry);
      if (match !== void 0) near.set(provider, match);
    }
  }
  const ordered = [];
  const seen = /* @__PURE__ */ new Set();
  const push = (match, official) => {
    if (seen.has(match.provider)) return;
    seen.add(match.provider);
    ordered.push(official ? { ...match, official: true } : match);
  };
  const hintedMatch = exact.get(hinted ?? "") ?? near.get(hinted ?? "");
  if (hinted !== void 0 && hintedMatch !== void 0) push(hintedMatch, true);
  for (const match of exact.values()) push(match, false);
  for (const match of near.values()) push(match, false);
  return ordered;
}
function normalizeBaseUrl(raw) {
  const base = raw.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//.test(base)) {
    throw new Error(`${PKG}: baseURL must be an absolute http(s) URL including the /v1 prefix, e.g. http://gw.local:3000/v1 (got: ${raw.trim()})`);
  }
  return base;
}
function modelInfo(provider, model, labels) {
  return {
    provider,
    id: model.id,
    name: groupedModelName(model.id, model.name, labels),
    ...model.description === void 0 ? {} : { description: model.description },
    inputModalities: ["text"]
  };
}
function providerRetryAfterMs(value) {
  if (value === null) return void 0;
  if (/^\d+$/.test(value)) {
    const delay2 = Number(value) * 1e3;
    return Number.isFinite(delay2) && delay2 > 0 ? delay2 : void 0;
  }
  const delay = Date.parse(value) - Date.now();
  return Number.isFinite(delay) && delay > 0 ? delay : void 0;
}
function requestId(headers) {
  const value = headers.get("x-request-id");
  return value === null || value.length === 0 ? void 0 : ProviderRequestId(value);
}
function httpErrorCode(status, error) {
  if (status === 401 || status === 403) return "AUTH";
  const detail = [error?.code, error?.type, error?.message].filter(Boolean).join(" ");
  if (isQuotaExceededError(detail)) return QUOTA_EXCEEDED_CODE;
  if (status === 429) return "RATE_LIMIT";
  if (status === 400) {
    if (isContextWindowExceededError(detail)) return CONTEXT_WINDOW_EXCEEDED_CODE;
    return "INVALID_REQUEST";
  }
  if (status >= 500) return "SERVER";
  return `HTTP_${status}`;
}
var OmniRouteAdapter = class extends LlmAdapter {
  constructor(config) {
    super();
    this.config = config;
  }
  providerInfo(provider) {
    return { id: provider, name: "Custom Provider" };
  }
  providerRetryPolicy(_provider) {
    return this.config.options().retryPolicy;
  }
  listModels(provider) {
    const connection = this.config.options();
    return Promise.resolve(
      connection.models.map((model) => modelInfo(provider, model, connection.groupLabels))
    );
  }
  resolveModel(provider, model, _signal) {
    const connection = this.config.options();
    const configured = connection.models.find((entry) => entry.id === model);
    const defaultMaxTokens = configured?.maxTokens ?? connection.maxTokens;
    const declaredEfforts = configured?.reasoningEfforts ?? [];
    const idBound = Object.keys(configured?.effortModels ?? {}).length > 0;
    const defaultEffort = configured?.defaultReasoningEffort !== void 0 && declaredEfforts.includes(configured.defaultReasoningEffort) ? configured.defaultReasoningEffort : idBound ? highestEffort(declaredEfforts) : void 0;
    return Promise.resolve({
      // The chat-completions wire route is text-only regardless of catalog
      // membership, so the uncatalogued fallback declares the same negative
      // capability — "unknown" here would let the host accept and persist
      // images the serializer must then reject. The gateway's own vision flag
      // is kept on the row (displayed by the settings page) but is not
      // promoted to a declaration until this adapter can serialize images.
      ...configured === void 0 ? {
        provider,
        id: model,
        name: groupedModelName(model, void 0, connection.groupLabels),
        inputModalities: ["text"]
      } : modelInfo(provider, configured, connection.groupLabels),
      context: { contextWindow: configured?.contextWindow ?? connection.defaultContextWindow },
      // Reasoning efforts arrive as catalog facts: the gateway's own listing
      // (parsed by ./catalog.ts, which decides whether an id encodes its own
      // level) or a models.dev fallback the user adopted. A row that carries
      // them offers the effort selector, and the selected effort either rides
      // the wire as `reasoning_effort` or selects the concrete model id, per
      // the row's effortModels map. The default is the row's configured
      // preset; an id-bound row without one falls back to the strongest
      // declared level, because a request without a level would have to send
      // the native id the gateway does not carry. Other rows leave
      // `defaultEffort` undeclared: the settings page offers "not sent" as a
      // deliberate choice, and the request then lets the gateway apply the
      // model's own default. Rows without the fact keep declaring nothing — an
      // explicit effort then rejects before provider I/O, same as before.
      ...declaredEfforts.length > 0 ? {
        reasoning: {
          efforts: declaredEfforts.map((effort) => ({
            id: ReasoningEffortId(effort),
            name: effort.charAt(0).toUpperCase() + effort.slice(1)
          })),
          ...defaultEffort === void 0 ? {} : { defaultEffort: ReasoningEffortId(defaultEffort) }
        }
      } : {},
      ...defaultMaxTokens === void 0 ? {} : { defaultMaxTokens }
    });
  }
  /**
   * Fetch and parse one gateway `/models` listing into catalog rows. The one
   * place that knows the endpoint, the credential choice, and the error
   * vocabulary; discovery, the settings-page catalog fetch, and any future
   * consumer share it.
   * @param request - the draft endpoint/credential, when a settings form is editing one.
   * @param signal - caller cancellation.
   * @returns the parsed rows, sorted by id.
   */
  async catalogRows(request, signal) {
    const connection = this.config.options();
    const base = request.baseURL !== void 0 && request.baseURL.length > 0 ? normalizeBaseUrl(request.baseURL) : connection.baseURL;
    const apiKey = request.apiKey !== void 0 ? assertUsableApiKey(request.apiKey, PKG, "the draft credential") : await this.config.resolveApiKey(connection);
    let response;
    try {
      response = await fetch(`${base}/models`, {
        method: "GET",
        headers: {
          "authorization": `Bearer ${apiKey}`,
          "accept": "application/json",
          ...attributionHeaders()
        },
        ...signal === void 0 ? {} : { signal }
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new LlmError4(`OmniRoute model discovery request to ${base} failed`, "TRANSPORT", { cause: error });
    }
    if (!response.ok) {
      let providerError;
      try {
        providerError = (await response.json()).error;
      } catch {
      }
      const id = requestId(response.headers);
      throw new LlmError4(
        providerError?.message ?? `OmniRoute model discovery error (HTTP ${response.status})`,
        httpErrorCode(response.status, providerError),
        {
          status: response.status,
          ...id === void 0 ? {} : { requestId: id }
        }
      );
    }
    let list;
    try {
      list = await response.json();
    } catch {
      throw new LlmError4(`OmniRoute model discovery from ${base} returned a malformed body`, "MALFORMED_RESPONSE");
    }
    const options = { excludePatterns: connection.modelExcludePatterns };
    return parseOmniRouteCatalog(list.data ?? [], options);
  }
  /**
   * Interrogate one gateway endpoint for the models it advertises, serving
   * the settings-namespace discovery the plugin registered. A draft being
   * edited supplies its own base and one-shot credential; otherwise both
   * come from the current connection snapshot.
   *
   * The rows are the collapsed ones (`./catalog.ts`): one entry per native
   * model id, with the level-carrying variants folded away. Context, output
   * cap and vision come from the listing's own capability facts, so an
   * adoption no longer needs a second catalog to be useful.
   * @param request - the discovery draft (endpoint, protocol, credential).
   * @param signal - caller cancellation, supplied separately by the runtime.
   * @returns the advertised models, deduplicated by the runtime.
   */
  async discoverModels(request, signal) {
    const rows = await this.catalogRows(request, signal);
    return rows.map((row) => ({
      id: row.id,
      // The raw name, never the group-composed one: the Models page adopts a
      // discovery row into `models[]` verbatim, so a stored `[label]tail` would
      // collect a second label when the route lists its own models.
      name: row.name ?? row.id,
      ...row.contextWindow === void 0 ? {} : { contextWindow: row.contextWindow },
      ...row.maxTokens === void 0 ? {} : { maxTokens: row.maxTokens },
      // Text-only declaration on purpose: the row keeps the gateway's vision
      // flag (`row.vision`) for display, but this wire route cannot carry
      // images yet, and claiming otherwise would make the host accept them.
      inputModalities: ["text"]
    }));
  }
  /**
   * Serve the settings page's rich catalog fetch over the plugin's own RPC
   * channel: the same `/models` interrogation as {@link discoverModels}, but
   * with the facts an adoption persists (thinking levels, the level → model-id
   * map, vision and tool capability, capacities) instead of the reduced
   * discovery shape the harness declares.
   * @param request - the draft endpoint/credential from the settings form.
   * @param signal - caller cancellation.
   * @returns the rows the form adopts verbatim.
   */
  async fetchCatalog(request, signal) {
    return { models: await this.catalogRows(request, signal) };
  }
  /**
   * Download the models.dev catalog (optionally through the configured
   * forward proxy) and match every requested gateway id against it, serving
   * the `models-dev-params` RPC endpoint. Runs host-side on purpose: the
   * browser only names the ids and the proxy, so no cross-origin download
   * happens and the proxy is a plain HTTP forward proxy Node can use.
   * @param request - gateway model ids and an optional proxy URL.
   * @param signal - caller cancellation.
   * @returns per id: every provider entry that matched it (possibly several —
   *   the user resolves which provider's facts to adopt), possibly none.
   */
  async fetchModelsDevParams(request, signal) {
    const proxyUrl = request.proxyUrl !== void 0 && request.proxyUrl.length > 0 ? request.proxyUrl : this.config.options().proxyUrl;
    const dispatcher = proxyUrl !== void 0 ? new ProxyAgent(proxyUrl) : void 0;
    let api;
    try {
      const request_ = {
        headers: { accept: "application/json", ...attributionHeaders() },
        signal: AbortSignal.any([signal, AbortSignal.timeout(MODELS_DEV_TIMEOUT_MS)])
      };
      const response = dispatcher === void 0 ? await fetch(MODELS_DEV_API_URL, request_) : await undiciFetch(MODELS_DEV_API_URL, { ...request_, dispatcher });
      if (!response.ok) {
        throw new LlmError4(
          `models.dev catalog fetch failed (HTTP ${response.status})`,
          httpErrorCode(response.status),
          { status: response.status }
        );
      }
      api = await response.json();
    } catch (error) {
      if (error instanceof LlmError4) throw error;
      if (signal.aborted) throw error;
      const cause = error instanceof Error && error.cause instanceof Error ? `: ${error.cause.message}` : error instanceof Error ? `: ${error.message}` : "";
      const remedy = proxyUrl !== void 0 ? ` \u2014 the proxy at ${proxyUrl} is unreachable; check that it is running, or change or disable the proxy setting` : " \u2014 check the network path to models.dev, or configure a proxy for this plugin";
      throw new LlmError4(
        `models.dev catalog fetch failed${cause}${remedy}`,
        "TRANSPORT",
        { cause: error }
      );
    } finally {
      void dispatcher?.close().catch(() => {
      });
    }
    const hints = this.config.options().providerHints;
    return {
      models: await Promise.all(request.modelIds.map(async (id) => ({
        id,
        matches: await this.prioritizeOfficial(id, matchModelsDev(api, id, hints))
      })))
    };
  }
  /**
   * Registry-based official priority, complementing the hint-driven one
   * inside {@link matchModelsDev}: when the hints did NOT flag a match
   * official yet, a route registered on ctx.llm that officially serves the
   * id (bare, or the last segment of a routed id) still leads. Runs only
   * when nothing is flagged, so the two mechanisms never fight.
   * @param id - the gateway model id.
   * @param matches - every catalog match, hinted order already applied.
   * @returns matches with the registry-official one first, flagged.
   */
  async prioritizeOfficial(id, matches) {
    const hook = this.config.officialProviderOf;
    if (hook === void 0 || matches.length < 2 || matches.some((match) => match.official === true)) return matches;
    const slash = id.lastIndexOf("/");
    const official = await hook(id) ?? (slash === -1 ? void 0 : await hook(id.slice(slash + 1)));
    if (official === void 0) return matches;
    const at = matches.findIndex((match) => match.provider === official);
    const hit = at === -1 ? void 0 : matches[at];
    if (hit === void 0) return matches;
    const rest = matches.filter((_match, index) => index !== at);
    return [{ ...hit, official: true }, ...rest];
  }
  async *stream(options) {
    var _stack = [];
    try {
      const connection = this.config.options();
      const apiKey = await this.config.resolveApiKey(connection);
      const consumer = new AbortController();
      const upstream = options.signal === void 0 ? consumer.signal : AbortSignal.any([options.signal, consumer.signal]);
      const watchdog = __using(_stack, idleWatchdog(upstream, connection.streamIdleTimeoutMs, STREAM_IDLE_TIMEOUT_CODE));
      const iterator = this.request(
        options,
        watchdog.signal,
        connection,
        apiKey,
        () => {
          watchdog.pulse();
        }
      )[Symbol.asyncIterator]();
      let exhausted = false;
      try {
        while (true) {
          const result = await watchdog.next(iterator);
          if (result.done) {
            exhausted = true;
            return;
          }
          yield result.value;
        }
      } catch (error) {
        if (timeoutOf(watchdog.signal, STREAM_IDLE_TIMEOUT_CODE) !== void 0) {
          throw new LlmError4(
            `OmniRoute stream idle timeout after ${connection.streamIdleTimeoutMs}ms`,
            "TIMEOUT",
            { cause: error }
          );
        }
        if (options.signal?.aborted) {
          throw new LlmError4("OmniRoute request aborted by caller", "ABORTED", { cause: error });
        }
        if (error instanceof LlmError4) throw error;
        throw new LlmError4(`OmniRoute stream from ${connection.baseURL} failed`, "TRANSPORT", { cause: error });
      } finally {
        consumer.abort("OmniRoute stream consumer stopped");
        if (!exhausted && iterator.return !== void 0) {
          try {
            await iterator.return();
          } catch (_abortedTransportTeardown) {
          }
        }
      }
    } catch (_) {
      var _error = _, _hasError = true;
    } finally {
      __callDispose(_stack, _error, _hasError);
    }
  }
  async *request(options, signal, connection, apiKey, onComment) {
    const row = connection.models.find((entry) => entry.id === options.model);
    if (options.reasoningEffort === void 0 && Object.keys(row?.effortModels ?? {}).length > 0) {
      throw new LlmError4(
        `OmniRoute model "${options.model}" encodes its thinking level in the model id; select one of its declared levels`,
        "INVALID_REQUEST"
      );
    }
    const wire = resolveWireModel(row, options.model, options.reasoningEffort);
    const { reasoningEffort: _selectedEffort, ...rest } = options;
    const body = serializeRequest({
      ...rest,
      model: wire.model,
      ...wire.reasoningEffort === void 0 ? {} : { reasoningEffort: ReasoningEffortId(wire.reasoningEffort) }
    });
    const payload = JSON.stringify(body);
    const headers = {
      "authorization": `Bearer ${apiKey}`,
      "content-type": "application/json",
      "accept": "text/event-stream",
      // The mandatory product attribution; nothing per-request or per-user
      // rides on a third-party gateway request.
      ...attributionHeaders()
    };
    let response;
    try {
      response = await fetch(`${connection.baseURL}/chat/completions`, {
        method: "POST",
        headers,
        body: payload,
        signal
      });
    } catch (error) {
      if (signal.aborted) throw error;
      throw new LlmError4(
        `OmniRoute request to ${connection.baseURL} failed`,
        "TRANSPORT",
        { cause: error }
      );
    }
    if (!response.ok) {
      let message = `OmniRoute error (HTTP ${response.status})`;
      let providerError;
      try {
        const parsed = await response.json();
        providerError = parsed.error;
        if (providerError?.message) message = providerError.message;
      } catch {
      }
      const delay = providerRetryAfterMs(response.headers.get("retry-after"));
      const id = requestId(response.headers);
      throw new LlmError4(message, httpErrorCode(response.status, providerError), {
        status: response.status,
        ...delay === void 0 ? {} : { providerRetryAfterMs: delay },
        ...id === void 0 ? {} : { requestId: id }
      });
    }
    if (!response.body) {
      throw new LlmError4("OmniRoute returned no response body", "EMPTY_RESPONSE");
    }
    yield* translate(parseSse(response.body, onComment));
  }
};

// src/web.ts
var WEB_PROVIDER_ID = "omniroute";
var SEARCH_PATH = "/search";
var FETCH_PATH = "/web/fetch";
var DEFAULT_WEB_MAX_RESULTS = 8;
var DEFAULT_SNIPPET_MAX_CHARS = 600;
var DEFAULT_FETCH_MAX_CHARS = 1e5;
var DEFAULT_WEB_TIMEOUT_MS = 3e4;
function webError(message, code, cause) {
  const error = new Error(message, cause === void 0 ? void 0 : { cause });
  error.name = "WebError";
  error.code = code;
  return error;
}
function isAbortError(error) {
  return error instanceof DOMException && error.name === "AbortError";
}
function callerAborted(signal) {
  return signal !== void 0 && signal.aborted;
}
async function errorDetail(response) {
  try {
    const text = (await response.text()).replace(/\s+/gu, " ").trim();
    return text.length > 0 ? `: ${text.slice(0, 300)}` : "";
  } catch {
    return "";
  }
}
var OmniRouteWebProvider = class {
  constructor(hooks) {
    this.hooks = hooks;
  }
  id = WEB_PROVIDER_ID;
  /** Cheap local usability check; makes no network call. */
  available() {
    const options = this.hooks.options();
    return options.enabled && URL.canParse(options.baseURL) && options.timeoutMs > 0;
  }
  /**
   * POST one JSON body to a gateway web endpoint and decode the answer.
   * @param path - the endpoint path appended to the configured base.
   * @param body - the request body.
   * @param signal - caller cancellation.
   * @param label - human-readable capability name for diagnostics.
   * @returns the decoded JSON body.
   */
  async post(path, body, signal, label) {
    const options = this.hooks.options();
    const endpoint = `${options.baseURL}${path}`;
    if (callerAborted(signal)) throw webError(`OmniRoute ${label} aborted`, "WEB_ABORTED");
    const apiKey = await this.hooks.resolveApiKey();
    const timeout = AbortSignal.timeout(options.timeoutMs);
    const combined = signal === void 0 ? timeout : AbortSignal.any([signal, timeout]);
    let response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        redirect: "error",
        headers: {
          "content-type": "application/json",
          "accept": "application/json",
          ...apiKey.length > 0 ? { "authorization": `Bearer ${apiKey}` } : {}
        },
        body: JSON.stringify(body),
        signal: combined
      });
    } catch (error) {
      if (callerAborted(signal) || isAbortError(error)) {
        throw webError(`OmniRoute ${label} aborted`, "WEB_ABORTED", error);
      }
      throw webError(
        `OmniRoute ${label} request failed: ${String(error)}. The request used endpoint ${JSON.stringify(endpoint)}; check that the OmniRoute gateway is running and reachable.`,
        "WEB_PROVIDER_ERROR",
        error
      );
    }
    if (!response.ok) {
      throw webError(
        `OmniRoute ${label} failed (HTTP ${response.status})${await errorDetail(response)}. The request used endpoint ${JSON.stringify(endpoint)}; fix the gateway side or this plugin's gateway settings (the web endpoints are separate from chat).`,
        "WEB_PROVIDER_ERROR"
      );
    }
    try {
      return await response.json();
    } catch (error) {
      if (callerAborted(signal) || isAbortError(error)) {
        throw webError(`OmniRoute ${label} aborted`, "WEB_ABORTED", error);
      }
      throw webError(`OmniRoute returned an unprocessable ${label} body: ${String(error)}`, "WEB_PROVIDER_ERROR", error);
    }
  }
};
var OmniRouteSearchProvider = class extends OmniRouteWebProvider {
  constructor(hooks) {
    super(hooks);
  }
  /**
   * Run one search through the gateway.
   * @param request - the query and optional result bound.
   * @param signal - caller cancellation.
   * @returns normalized sources, snippets already clipped.
   */
  async search(request, signal) {
    const options = this.hooks.options();
    const maxResults = request.maxResults ?? options.maxResults;
    const body = { query: request.query, max_results: maxResults };
    if (options.searchProvider.length > 0) body.provider = options.searchProvider;
    const payload = await this.post(SEARCH_PATH, body, signal, "search");
    return mapSearchResponse(payload, options.snippetMaxChars);
  }
};
var OmniRouteFetchProvider = class extends OmniRouteWebProvider {
  constructor(hooks) {
    super(hooks);
  }
  /**
   * Retrieve one URL through the gateway.
   * @param request - the URL to retrieve.
   * @param signal - caller cancellation.
   * @returns the extracted body plus the extraction status.
   */
  async fetch(request, signal) {
    const options = this.hooks.options();
    const body = { url: request.url, format: options.fetchFormat, include_metadata: true };
    if (options.fetchProvider.length > 0) body.provider = options.fetchProvider;
    const payload = await this.post(FETCH_PATH, body, signal, "web fetch");
    const content = typeof payload.content === "string" ? payload.content : "";
    const capped = content.length > options.fetchMaxChars ? content.slice(0, options.fetchMaxChars) : content;
    const decoded = { kind: "text", content: capped };
    return {
      url: typeof payload.url === "string" && payload.url.length > 0 ? payload.url : request.url,
      statusCode: metadataStatus(payload.metadata) ?? 200,
      body: decoded,
      truncated: capped.length !== content.length
    };
  }
};
function metadataStatus(metadata) {
  if (metadata === null || metadata === void 0) return void 0;
  for (const key of ["statusCode", "status_code", "status"]) {
    const value = metadata[key];
    if (typeof value === "number" && Number.isSafeInteger(value) && value >= 100 && value <= 599) {
      return value;
    }
  }
  return void 0;
}
function mapSearchResponse(payload, snippetMaxChars = DEFAULT_SNIPPET_MAX_CHARS) {
  const rows = Array.isArray(payload.results) ? payload.results : [];
  const seen = /* @__PURE__ */ new Set();
  const sources = [];
  for (const row of rows) {
    if (row === null || typeof row !== "object") continue;
    const url = typeof row.url === "string" ? row.url : "";
    if (url.length === 0 || seen.has(url)) continue;
    seen.add(url);
    const title = typeof row.title === "string" ? row.title.trim() : "";
    const rawSnippet = typeof row.snippet === "string" ? row.snippet.replace(/\s+/gu, " ").trim() : "";
    const snippet = rawSnippet.length > snippetMaxChars ? `${rawSnippet.slice(0, snippetMaxChars)}\u2026` : rawSnippet;
    const publishedAt = typeof row.published_at === "string" ? row.published_at : "";
    sources.push({
      url,
      ...title.length > 0 ? { title } : {},
      ...snippet.length > 0 ? { snippet } : {},
      ...publishedAt.length > 0 ? { publishedAt } : {}
    });
  }
  const answer = typeof payload.answer?.text === "string" ? payload.answer.text.trim() : "";
  return {
    ...answer.length > 0 ? { content: answer } : {},
    sources,
    truncated: false
  };
}

// src/index.ts
var MINIMUM_DSH_VERSION = "0.2.1-rc.2";
function parseSemver(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u.exec(version);
  if (match === null) return void 0;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  const prerelease = match[4]?.split(".").map((part) => /^\d+$/u.test(part) ? Number(part) : part);
  return prerelease === void 0 ? { core: [major, minor, patch] } : { core: [major, minor, patch], prerelease };
}
function compareSemver(left, right) {
  const [leftMajor, leftMinor, leftPatch] = left.core;
  const [rightMajor, rightMinor, rightPatch] = right.core;
  for (const difference of [leftMajor - rightMajor, leftMinor - rightMinor, leftPatch - rightPatch]) {
    if (difference !== 0) return difference;
  }
  if (left.prerelease === void 0) return right.prerelease === void 0 ? 0 : 1;
  if (right.prerelease === void 0) return -1;
  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = left.prerelease[index];
    const rightPart = right.prerelease[index];
    if (leftPart === void 0) return rightPart === void 0 ? 0 : -1;
    if (rightPart === void 0) return 1;
    if (leftPart === rightPart) continue;
    if (typeof leftPart === "number" && typeof rightPart === "number") return leftPart - rightPart;
    if (typeof leftPart === "number") return -1;
    if (typeof rightPart === "number") return 1;
    return leftPart < rightPart ? -1 : 1;
  }
  return 0;
}
function isSupportedHostVersion(version) {
  const actual = parseSemver(version);
  const minimum = parseSemver(MINIMUM_DSH_VERSION);
  return actual !== void 0 && minimum !== void 0 && compareSemver(actual, minimum) >= 0;
}
var hostLlmVersion = typeof llmManifest.version === "string" ? llmManifest.version : "unknown";
if (!isSupportedHostVersion(hostLlmVersion)) {
  throw new Error(
    `dsh-llm-omniroute requires dsh >= ${MINIMUM_DSH_VERSION} (host ships @deepseek-ai/dsh-llm ${hostLlmVersion}); upgrade the host: npm install -g @deepseek-ai/dsh@${MINIMUM_DSH_VERSION}`
  );
}
function deepEqualJson(left, right) {
  if (left === right) return true;
  if (typeof left !== "object" || typeof right !== "object" || left === null || right === null) return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((entry, index) => deepEqualJson(entry, right[index]));
  }
  const leftRecord = left;
  const rightRecord = right;
  const keys = Object.keys(leftRecord);
  if (keys.length !== Object.keys(rightRecord).length) return false;
  return keys.every((key) => key in rightRecord && deepEqualJson(leftRecord[key], rightRecord[key]));
}
var name = "dsh-llm-omniroute";
var inject = ["llm"];
var NS = "dsh-llm-omniroute";
var API_KEY_REF = "omniroute";
var BASE_URL_ENV = "OMNIROUTE_BASE_URL";
var DEFAULT_BASE_URL = "http://127.0.0.1:20128/v1";
var PROVIDER = "omniroute";
var catalogModel = z.object({
  id: z.string().required(),
  name: z.string(),
  description: z.string(),
  contextWindow: z.number().step(1).min(1),
  maxTokens: z.number().step(1).min(1),
  vision: z.boolean(),
  toolCalling: z.boolean(),
  reasoningEfforts: z.array(z.string()),
  defaultReasoningEffort: z.string(),
  effortModels: z.object({})
});
var DEFAULT_PROXY_URL = "http://127.0.0.1:7890";
function asValidationError(error) {
  return new z.ValidationError(error instanceof Error ? error.message : String(error), { path: [] });
}
var baseURLField = z.transform(z.string(), (value) => {
  if (value.trim().length === 0) return value;
  try {
    normalizeBaseUrl(value);
  } catch (error) {
    throw asValidationError(error);
  }
  return value;
});
var proxyField = z.transform(z.object({
  enabled: z.boolean().default(false),
  url: z.string().default(DEFAULT_PROXY_URL)
}), (value) => {
  const enabled = value.enabled === true;
  const url = typeof value.url === "string" ? value.url : DEFAULT_PROXY_URL;
  if (enabled) {
    let protocol;
    try {
      protocol = new URL(url).protocol;
    } catch {
    }
    if (protocol === void 0) {
      throw asValidationError(new Error(`${PKG}: proxy.url must be an absolute URL (got: ${url})`));
    }
    if (!/^https?:$/.test(protocol)) {
      throw asValidationError(new Error(`${PKG}: proxy.url must be an http(s) URL (got: ${url})`));
    }
  }
  return { enabled, url };
});
var modelsField = z.transform(z.array(catalogModel).default([]), (value) => {
  try {
    resolveModels(value);
  } catch (error) {
    throw asValidationError(error);
  }
  return value;
});
var excludePatternsField = z.transform(
  z.array(z.string()).default([...DEFAULT_MODEL_EXCLUDE_PATTERNS]),
  (value) => {
    for (const pattern of value) {
      if (pattern.length === 0) {
        throw asValidationError(new Error(`${PKG}: modelExcludePatterns entries must be non-empty`));
      }
    }
    return value;
  }
);
var webField = z.transform(z.object({
  enabled: z.boolean().default(true),
  searchProvider: z.string().default(""),
  maxResults: z.number().step(1).min(1).max(100).default(DEFAULT_WEB_MAX_RESULTS),
  snippetMaxChars: z.number().step(1).min(1).default(DEFAULT_SNIPPET_MAX_CHARS),
  fetchProvider: z.string().default(""),
  fetchFormat: z.union([z.const("markdown"), z.const("html"), z.const("links"), z.const("screenshot")]).default("markdown"),
  fetchMaxChars: z.number().step(1).min(1).default(DEFAULT_FETCH_MAX_CHARS),
  timeoutMs: z.number().min(Number.MIN_VALUE).max(MAX_TIMER_DELAY_MS).default(DEFAULT_WEB_TIMEOUT_MS)
}), (value) => {
  try {
    return resolveWebSettings(value);
  } catch (error) {
    throw asValidationError(error);
  }
});
var configSchema = z.object({
  baseURL: baseURLField.volatile(),
  models: modelsField.volatile(),
  modelExcludePatterns: excludePatternsField.volatile(),
  defaultContextWindow: z.number().step(1).min(1).default(DEFAULT_CONTEXT_WINDOW).volatile(),
  maxTokens: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).volatile(),
  streamIdleTimeoutMs: z.number().min(Number.MIN_VALUE).max(MAX_TIMER_DELAY_MS).default(DEFAULT_STREAM_IDLE_TIMEOUT_MS).volatile(),
  proxy: proxyField.volatile(),
  // Arbitrary-key maps are declared as dicts, never as empty object schemas:
  // the settings plane projects a form field key by key, so `z.object({})`
  // would read every stored entry back as `{}` and a saved edit would look
  // like it never happened.
  providerHints: z.object({
    defaults: z.dict(z.string()).default({}),
    models: z.dict(z.string()).default({})
  }).volatile(),
  groupLabels: z.dict(z.string()).default({}).volatile(),
  retryPolicy: RetryPolicySchema.volatile(),
  web: webField.volatile()
});
var Config = configSchema;
function plain(snapshot) {
  return snapshot;
}
function snapshotConfig(config) {
  const baseURL = plain(config.baseURL.get());
  const maxTokens = plain(config.maxTokens.get());
  const providerHints = plain(config.providerHints.get());
  const groupLabels = plain(config.groupLabels.get());
  const retryPolicy = plain(config.retryPolicy.get());
  const web = plain(config.web.get());
  return {
    ...baseURL === void 0 ? {} : { baseURL },
    models: plain(config.models.get()) ?? [],
    modelExcludePatterns: plain(config.modelExcludePatterns.get()) ?? [...DEFAULT_MODEL_EXCLUDE_PATTERNS],
    defaultContextWindow: plain(config.defaultContextWindow.get()) ?? DEFAULT_CONTEXT_WINDOW,
    ...maxTokens === void 0 ? {} : { maxTokens },
    streamIdleTimeoutMs: plain(config.streamIdleTimeoutMs.get()) ?? DEFAULT_STREAM_IDLE_TIMEOUT_MS,
    proxy: plain(config.proxy.get()) ?? { enabled: false, url: DEFAULT_PROXY_URL },
    ...providerHints === void 0 ? {} : { providerHints },
    ...groupLabels === void 0 ? {} : { groupLabels },
    ...retryPolicy === void 0 ? {} : { retryPolicy },
    ...web === void 0 ? {} : { web }
  };
}
function resolveModels(models) {
  const seen = /* @__PURE__ */ new Set();
  return (models ?? []).map((model) => {
    if (model.id.length === 0) throw new Error(`${PKG}: catalog model ids must be non-empty`);
    if (model.name !== void 0 && model.name.length === 0) {
      throw new Error(`${PKG}: catalog model "${model.id}" has an empty name`);
    }
    if (model.contextWindow !== void 0 && (!Number.isInteger(model.contextWindow) || model.contextWindow <= 0)) {
      throw new Error(
        `${PKG}: catalog model "${model.id}" contextWindow must be a positive integer`
      );
    }
    if (model.maxTokens !== void 0 && (!Number.isInteger(model.maxTokens) || model.maxTokens <= 0)) {
      throw new Error(
        `${PKG}: catalog model "${model.id}" maxTokens must be a positive integer`
      );
    }
    if (seen.has(model.id)) throw new Error(`${PKG}: duplicate catalog model "${model.id}"`);
    seen.add(model.id);
    for (const effort of model.reasoningEfforts ?? []) {
      if (effort.length === 0) throw new Error(`${PKG}: catalog model "${model.id}" has an empty reasoning effort`);
    }
    if (model.defaultReasoningEffort !== void 0 && !(model.reasoningEfforts ?? []).includes(model.defaultReasoningEffort)) {
      throw new Error(
        `${PKG}: catalog model "${model.id}" default reasoning effort "${model.defaultReasoningEffort}" is not among its reasoning efforts`
      );
    }
    for (const [effort, wireModel] of Object.entries(model.effortModels ?? {})) {
      if (wireModel.length === 0) {
        throw new Error(`${PKG}: catalog model "${model.id}" maps effort "${effort}" to an empty model id`);
      }
      if (!(model.reasoningEfforts ?? []).includes(effort)) {
        throw new Error(
          `${PKG}: catalog model "${model.id}" maps effort "${effort}" but does not declare it`
        );
      }
    }
    return {
      id: model.id,
      ...model.name === void 0 ? {} : { name: model.name },
      ...model.description === void 0 ? {} : { description: model.description },
      ...model.contextWindow === void 0 ? {} : { contextWindow: model.contextWindow },
      ...model.maxTokens === void 0 ? {} : { maxTokens: model.maxTokens },
      ...model.vision === void 0 ? {} : { vision: model.vision },
      ...model.toolCalling === void 0 ? {} : { toolCalling: model.toolCalling },
      ...model.reasoningEfforts === void 0 || model.reasoningEfforts.length === 0 ? {} : { reasoningEfforts: model.reasoningEfforts },
      ...model.defaultReasoningEffort === void 0 ? {} : { defaultReasoningEffort: model.defaultReasoningEffort },
      ...model.effortModels === void 0 || Object.keys(model.effortModels).length === 0 ? {} : { effortModels: { ...model.effortModels } }
    };
  });
}
function resolveWebSettings(config) {
  const raw = config ?? {};
  const maxResults = raw.maxResults ?? DEFAULT_WEB_MAX_RESULTS;
  if (!Number.isInteger(maxResults) || maxResults <= 0 || maxResults > 100) {
    throw new Error(`${PKG}: web.maxResults must be an integer between 1 and 100`);
  }
  const snippetMaxChars = raw.snippetMaxChars ?? DEFAULT_SNIPPET_MAX_CHARS;
  if (!Number.isInteger(snippetMaxChars) || snippetMaxChars <= 0) {
    throw new Error(`${PKG}: web.snippetMaxChars must be a positive integer`);
  }
  const fetchMaxChars = raw.fetchMaxChars ?? DEFAULT_FETCH_MAX_CHARS;
  if (!Number.isInteger(fetchMaxChars) || fetchMaxChars <= 0) {
    throw new Error(`${PKG}: web.fetchMaxChars must be a positive integer`);
  }
  const timeoutMs = raw.timeoutMs ?? DEFAULT_WEB_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > MAX_TIMER_DELAY_MS) {
    throw new Error(
      `${PKG}: web.timeoutMs must be a positive finite number no greater than ${MAX_TIMER_DELAY_MS}`
    );
  }
  const fetchFormat = raw.fetchFormat ?? "markdown";
  if (!["markdown", "html", "links", "screenshot"].includes(fetchFormat)) {
    throw new Error(`${PKG}: web.fetchFormat must be markdown, html, links or screenshot (got: ${fetchFormat})`);
  }
  return {
    enabled: raw.enabled !== false,
    searchProvider: (raw.searchProvider ?? "").trim(),
    maxResults,
    snippetMaxChars,
    fetchProvider: (raw.fetchProvider ?? "").trim(),
    fetchFormat,
    fetchMaxChars,
    timeoutMs
  };
}
function resolveWebOptions(config, baseURL) {
  return { baseURL, ...resolveWebSettings(config) };
}
function resolveAdapterOptions(config, environment) {
  const named = config.baseURL !== void 0 && config.baseURL.trim().length > 0 ? config.baseURL : environment?.get(BASE_URL_ENV)?.value;
  const rawBase = named !== void 0 && named.trim().length > 0 ? named : DEFAULT_BASE_URL;
  const modelExcludePatterns = config.modelExcludePatterns ?? [...DEFAULT_MODEL_EXCLUDE_PATTERNS];
  for (const pattern of modelExcludePatterns) {
    if (pattern.length === 0) throw new Error(`${PKG}: modelExcludePatterns entries must be non-empty`);
  }
  if (config.defaultContextWindow !== void 0 && (!Number.isInteger(config.defaultContextWindow) || config.defaultContextWindow <= 0)) {
    throw new Error(`${PKG}: defaultContextWindow must be a positive integer`);
  }
  if (config.maxTokens !== void 0 && (!Number.isSafeInteger(config.maxTokens) || config.maxTokens <= 0)) {
    throw new Error(`${PKG}: maxTokens must be a positive safe integer`);
  }
  const streamIdleTimeoutMs = config.streamIdleTimeoutMs ?? DEFAULT_STREAM_IDLE_TIMEOUT_MS;
  if (!Number.isFinite(streamIdleTimeoutMs) || streamIdleTimeoutMs <= 0 || streamIdleTimeoutMs > MAX_TIMER_DELAY_MS) {
    throw new Error(
      `${PKG}: streamIdleTimeoutMs must be a positive finite number no greater than ${MAX_TIMER_DELAY_MS}`
    );
  }
  const defaultContextWindow = config.defaultContextWindow ?? DEFAULT_CONTEXT_WINDOW;
  const proxyEnabled = config.proxy?.enabled === true;
  const proxyUrlRaw = config.proxy?.url ?? DEFAULT_PROXY_URL;
  if (proxyEnabled) {
    try {
      new URL(proxyUrlRaw);
    } catch {
      throw new Error(`${PKG}: proxy.url must be an absolute URL (got: ${proxyUrlRaw})`);
    }
    if (!/^https?:$/.test(new URL(proxyUrlRaw).protocol)) {
      throw new Error(`${PKG}: proxy.url must be an http(s) URL (got: ${proxyUrlRaw})`);
    }
  }
  const baseURL = normalizeBaseUrl(rawBase);
  return {
    baseURL,
    // Resolved here, not per web call: the endpoint and the key must come from
    // ONE configuration generation, and an invalid generation must keep serving
    // the last good one exactly as the chat route does.
    web: resolveWebOptions(config.web, baseURL),
    apiKeyRef: credentialRef(API_KEY_REF),
    models: resolveModels(config.models),
    modelExcludePatterns,
    defaultContextWindow,
    streamIdleTimeoutMs,
    ...proxyEnabled ? { proxyUrl: proxyUrlRaw } : {},
    providerHints: {
      defaults: { ...config.providerHints?.defaults },
      models: { ...config.providerHints?.models }
    },
    groupLabels: { ...config.groupLabels },
    retryPolicy: resolveRetryPolicy(config.retryPolicy, `${PKG}: retryPolicy`),
    ...config.maxTokens === void 0 ? {} : { maxTokens: config.maxTokens }
  };
}
function apply(ctx, config) {
  let lastRaw;
  let lastGood;
  let registration;
  let registeredPolicy;
  const options = () => {
    const raw = snapshotConfig(config);
    if (lastGood !== void 0 && deepEqualJson(raw, lastRaw)) return lastGood;
    try {
      const next = resolveAdapterOptions(raw, launchEnvironmentOf(ctx));
      lastRaw = raw;
      lastGood = next;
      if (registration !== void 0 && !deepEqualJson(next.retryPolicy, registeredPolicy)) {
        registration.replace([PROVIDER]);
        registeredPolicy = next.retryPolicy;
      }
      return next;
    } catch (error) {
      if (lastGood === void 0) throw error;
      lastRaw = raw;
      ctx.logger.error(`${PKG}: keeping the last good configuration after an invalid configuration generation`);
      ctx.logger.error(error);
      return lastGood;
    }
  };
  options();
  const resolveApiKey = async (connection) => {
    const ref = connection.apiKeyRef;
    const credentials = ctx.get("credentials");
    if (credentials !== void 0) {
      const hit = await credentials.resolve(ref);
      if (hit !== void 0) return assertUsableApiKey2(hit.value, PKG, ref);
    }
    throw new LlmError5(
      `${PKG}: no API key for provider route "${PROVIDER}"; configure it on the Custom Provider settings page in dsh web (credentials reference "${ref}")`,
      "MISSING_CREDENTIAL"
    );
  };
  let webSnapshot;
  const webHooks = {
    options: () => {
      webSnapshot = options();
      return webSnapshot.web;
    },
    resolveApiKey: () => resolveApiKey(webSnapshot ?? options())
  };
  let indexCache;
  const officialProviderOf = async (modelId) => {
    const routes = ctx.llm.listProviders().map((provider) => provider.id).sort().join(",");
    if (indexCache === void 0 || indexCache.routes !== routes) {
      const byModel = /* @__PURE__ */ new Map();
      for (const provider of ctx.llm.listProviders()) {
        if (provider.id === PROVIDER) continue;
        try {
          for (const model of await ctx.llm.listModels(provider.id)) {
            byModel.set(model.id, provider.id);
          }
        } catch {
        }
      }
      indexCache = { routes, byModel };
    }
    return indexCache.byModel.get(modelId);
  };
  const adapter = new OmniRouteAdapter({ options, resolveApiKey, officialProviderOf });
  ctx.llm.registerConfigurableProviders([
    {
      provider: PROVIDER,
      displayName: "Custom Provider",
      settingsNs: NS,
      settingsPath: [],
      // The endpoint facts this route advertises to the configurable-provider
      // directory: the same default and trusted environment variable the
      // resolver below uses. The route still declares itself configured-only,
      // because the adapter knows it only because configuration declared it.
      defaultBaseURL: DEFAULT_BASE_URL,
      baseURLEnv: [BASE_URL_ENV],
      declared: true
    }
  ]);
  registration = ctx.llm.registerAdapter([PROVIDER], adapter);
  registeredPolicy = options().retryPolicy;
  ctx.llm.registerModelDiscovery(NS, (request, signal) => adapter.discoverModels(request, signal));
  ctx.inject(["connection", "webServer"], (cctx) => {
    const connection = cctx.get("connection");
    const registrar = connection;
    cctx.effect(() => registrar.register(
      cctx,
      "/dsh-llm-omniroute",
      (endpoint, payload, signal) => {
        const answer = (promise) => promise.then((value) => ({ ok: true, value })).catch((error) => ({
          ok: false,
          error: {
            code: "internal",
            message: error instanceof Error ? error.message : String(error),
            details: {}
          }
        }));
        if (endpoint === "models-dev-params") {
          return answer(adapter.fetchModelsDevParams(payload, signal));
        }
        if (endpoint === "catalog") {
          return answer(adapter.fetchCatalog(payload, signal));
        }
        return Promise.resolve({
          ok: false,
          error: { code: "internal", message: `dsh-llm-omniroute: unknown endpoint ${endpoint}`, details: {} }
        });
      }
    ), "dsh-llm-omniroute: host RPC channel");
  });
  ctx.inject(["web"], (webCtx) => {
    const web = webCtx.web;
    const search = new OmniRouteSearchProvider(webHooks);
    const fetch_ = new OmniRouteFetchProvider(webHooks);
    webCtx.effect(() => {
      if (!webHooks.options().enabled) return () => {
      };
      const disposeSearch = web.registerSearchProvider(search);
      const disposeFetch = web.registerFetchProvider(fetch_);
      return () => {
        disposeSearch();
        disposeFetch();
      };
    }, "dsh-llm-omniroute: web search and fetch providers");
  });
  ctx.inject(["settings"], (settingsCtx) => {
    settingsCtx.effect(() => settingsCtx.settings.configure({ auto: false }, ctx.fiber));
  });
}
export {
  Config,
  DEFAULT_BASE_URL,
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_FETCH_MAX_CHARS,
  DEFAULT_MODEL_EXCLUDE_PATTERNS,
  DEFAULT_PROVIDER_HINTS,
  DEFAULT_PROXY_URL,
  DEFAULT_SNIPPET_MAX_CHARS,
  DEFAULT_STREAM_IDLE_TIMEOUT_MS,
  DEFAULT_WEB_MAX_RESULTS,
  DEFAULT_WEB_TIMEOUT_MS,
  OmniRouteAdapter,
  OmniRouteFetchProvider,
  OmniRouteSearchProvider,
  PKG,
  WEB_PROVIDER_ID,
  apply,
  inject,
  mapSearchResponse,
  matchModelsDev,
  modelNameFromId,
  name,
  normalizeBaseUrl,
  parseOmniRouteCatalog,
  resolveAdapterOptions,
  resolveWebOptions,
  resolveWebSettings,
  resolveWireModel,
  serializeRequest
};
//# sourceMappingURL=index.js.map
