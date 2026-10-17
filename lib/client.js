window.__ModuleLoader__.load({ id: "dsh-llm-omniroute", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);

// src/client/OmniRouteSection.tsx
var import_react = require("react");

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
function groupedModelName(id, name, labels) {
  const tail = name !== void 0 && name.length > 0 ? name : modelTail(id);
  const group = groupOf(id);
  if (group.length === 0) return tail;
  const label = labels?.[group];
  return `[${label !== void 0 && label.length > 0 ? label : group}]${tail}`;
}

// src/client/OmniRouteSection.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function textOf(model, key) {
  const value = model[key];
  return typeof value === "string" ? value : "";
}
function numberOf(model, key) {
  const value = model[key];
  return typeof value === "number" ? value : void 0;
}
var CAPACITY_PATTERN = /^(\d+(?:\.\d+)?)([km])?$/i;
var CAPACITY_SCALE = { k: 1e3, m: 1e6 };
function parseCapacity(text) {
  const trimmed = text.trim();
  if (trimmed.length === 0) return void 0;
  const match = CAPACITY_PATTERN.exec(trimmed);
  if (match === null) return Number.NaN;
  const suffix = match[2]?.toLowerCase();
  const scale = suffix === "k" || suffix === "m" ? CAPACITY_SCALE[suffix] : 1;
  const scaled = Number(match[1]) * scale;
  const rounded = Math.round(scaled);
  return Math.abs(scaled - rounded) < 1e-6 ? rounded : scaled;
}
function formatCapacity(value) {
  if (!Number.isInteger(value) || value <= 0) return String(value);
  if (value % CAPACITY_SCALE.m === 0) return `${String(value / CAPACITY_SCALE.m)}M`;
  if (value % CAPACITY_SCALE.k === 0) return `${String(value / CAPACITY_SCALE.k)}K`;
  return String(value);
}
var CAPACITY_HINT = {
  contextWindow: "128K",
  maxTokens: "8K"
};
function IconChevron({ open }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "svg",
    {
      width: "14",
      height: "14",
      viewBox: "0 0 16 16",
      fill: "none",
      "aria-hidden": true,
      style: { transform: open ? "rotate(90deg)" : void 0, transition: "transform 120ms ease" },
      children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M6 3.5L10.5 8L6 12.5", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round" })
    }
  );
}
function IconTrash() {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { width: "14", height: "14", viewBox: "0 0 16 16", fill: "none", "aria-hidden": true, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "path",
    {
      d: "M2.5 4h11M6.5 4V2.5h3V4M4 4l.7 9a1 1 0 001 .9h4.6a1 1 0 001-.9L12 4M6.5 6.8v4.4M9.5 6.8v4.4",
      stroke: "currentColor",
      strokeWidth: "1.3",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }
  ) });
}
var NS = "dsh-llm-omniroute";
var KEY_REF = "omniroute";
var DEFAULT_PROXY_URL = "http://127.0.0.1:7890";
function toDrafts(source) {
  if (!Array.isArray(source)) return [];
  return source.map((entry) => typeof entry === "object" && entry !== null && !Array.isArray(entry) ? entry : {});
}
function toGroupLabels(source) {
  if (typeof source !== "object" || source === null || Array.isArray(source)) return {};
  return Object.fromEntries(
    Object.entries(source).filter((entry) => typeof entry[1] === "string")
  );
}
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
var NO_THINK_LEVEL = "none";
var UNSET_EFFORT = "";
function highestOf(efforts) {
  const ids = efforts.filter((effort) => typeof effort === "string");
  return [...ids].sort((a, b) => (EFFORT_RUNG[b] ?? -1) - (EFFORT_RUNG[a] ?? -1))[0] ?? "";
}
function effortModelsOf(model) {
  const value = model.effortModels;
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry) => typeof entry[1] === "string")
  );
}
function pinsToNone(model) {
  const efforts = Array.isArray(model.reasoningEfforts) ? model.reasoningEfforts : [];
  return efforts.length === 1 && efforts[0] === NO_THINK_LEVEL;
}
function isIdBoundRow(model) {
  if (Object.keys(effortModelsOf(model)).length > 0) return true;
  return pinsToNone(model);
}
function effortLabel(effort, noneLabel) {
  return effort === "none" ? noneLabel : effort;
}
function presetOf(model) {
  const efforts = Array.isArray(model.reasoningEfforts) ? model.reasoningEfforts : [];
  if (typeof model.defaultReasoningEffort === "string" && efforts.includes(model.defaultReasoningEffort)) {
    return model.defaultReasoningEffort;
  }
  return Object.keys(effortModelsOf(model)).length > 0 ? highestOf(efforts) : UNSET_EFFORT;
}
function capabilitySummary(model, labels) {
  const parts = [];
  if (model.vision === true) parts.push(labels.vision);
  if (model.toolCalling === true) parts.push(labels.tools);
  return parts.length > 0 ? parts.join(" \xB7 ") : labels.none;
}
var COMBO_GROUP_KEY = "\0combo";
function groupKeyOf(group) {
  return group.length === 0 ? COMBO_GROUP_KEY : group;
}
function bufferKey(index, field) {
  return `${String(index)}:${field}`;
}
function OmniRouteSection(props) {
  const { api, t, fetchModelParams, fetchCatalog } = props;
  const [status, setStatus] = (0, import_react.useState)("loading");
  const [errorText, setErrorText] = (0, import_react.useState)(void 0);
  const [revision, setRevision] = (0, import_react.useState)(0);
  const [writable, setWritable] = (0, import_react.useState)(true);
  const [keyConfigured, setKeyConfigured] = (0, import_react.useState)(void 0);
  const [keyLocked, setKeyLocked] = (0, import_react.useState)(false);
  const [baseURL, setBaseURL] = (0, import_react.useState)("");
  const [keyDraft, setKeyDraft] = (0, import_react.useState)("");
  const [models, setModels] = (0, import_react.useState)([]);
  const [groupLabels, setGroupLabels] = (0, import_react.useState)({});
  const [expanded, setExpanded] = (0, import_react.useState)(/* @__PURE__ */ new Set());
  const [editing, setEditing] = (0, import_react.useState)(/* @__PURE__ */ new Map());
  const [busy, setBusy] = (0, import_react.useState)(false);
  const [notice, setNotice] = (0, import_react.useState)(void 0);
  const [candidates, setCandidates] = (0, import_react.useState)(void 0);
  const [picked, setPicked] = (0, import_react.useState)(/* @__PURE__ */ new Set());
  const [collapsedGroups, setCollapsedGroups] = (0, import_react.useState)(/* @__PURE__ */ new Set());
  const [proxyEnabled, setProxyEnabled] = (0, import_react.useState)(false);
  const [proxyUrl, setProxyUrl] = (0, import_react.useState)(DEFAULT_PROXY_URL);
  const [params, setParams] = (0, import_react.useState)(void 0);
  const [paramChoices, setParamChoices] = (0, import_react.useState)(/* @__PURE__ */ new Map());
  const [paramsBusy, setParamsBusy] = (0, import_react.useState)(false);
  const paramsRef = (0, import_react.useRef)(null);
  (0, import_react.useEffect)(() => {
    paramsRef.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
  }, [params]);
  const candidatesRef = (0, import_react.useRef)(null);
  (0, import_react.useEffect)(() => {
    candidatesRef.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
  }, [candidates]);
  const load = async () => {
    setStatus("loading");
    setErrorText(void 0);
    try {
      const described = await api.describeSettings();
      if (!described.ok) {
        setErrorText(described.error.message);
        setStatus("error");
        return;
      }
      setWritable(described.value.writable);
      const section = described.value.namespaces.find((entry) => entry.ns === NS);
      if (section === void 0) {
        setErrorText(t("nsNotRegistered"));
        setStatus("error");
        return;
      }
      const value = section.value ?? {};
      setRevision(section.revision);
      setBaseURL(typeof value.baseURL === "string" ? value.baseURL : "");
      setModels(toDrafts(value.models));
      setGroupLabels(toGroupLabels(value.groupLabels));
      const proxy = value.proxy ?? {};
      setProxyEnabled(proxy.enabled === true);
      if (typeof proxy.url === "string" && proxy.url.length > 0) setProxyUrl(proxy.url);
      setExpanded(/* @__PURE__ */ new Set());
      setEditing(/* @__PURE__ */ new Map());
      const credential = await api.describeCredentials([KEY_REF]);
      if (credential.ok) {
        const view = credential.value[KEY_REF];
        setKeyConfigured(view?.configured);
        setKeyLocked(view?.writable === false);
      }
      setStatus("ready");
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : String(error));
      setStatus("error");
    }
  };
  (0, import_react.useEffect)(() => {
    void load();
  }, []);
  const saved = (text) => {
    setNotice(text);
    void load();
  };
  const catalogProblem = () => {
    const seen = /* @__PURE__ */ new Set();
    for (const [index, model] of models.entries()) {
      const id = textOf(model, "id").trim();
      if (id.length === 0) return `${t("modelIdRequired")} (${t("models")} ${String(index + 1)})`;
      if (seen.has(id)) return `${t("modelIdDuplicate")} (${id})`;
      seen.add(id);
      for (const field of ["contextWindow", "maxTokens"]) {
        const buffer = editing.get(bufferKey(index, field));
        if (buffer !== void 0 && Number.isNaN(parseCapacity(buffer) ?? 0)) {
          return `${t("capacityInvalid")} (${id} \xB7 ${t(field)})`;
        }
      }
    }
    return void 0;
  };
  const save = async () => {
    const problem = catalogProblem();
    if (problem !== void 0) {
      setErrorText(problem);
      return;
    }
    setBusy(true);
    setNotice(void 0);
    setErrorText(void 0);
    try {
      const trimmedBase = baseURL.trim();
      const ops = [];
      if (trimmedBase.length > 0) ops.push({ op: "set", path: ["baseURL"], value: trimmedBase });
      else ops.push({ op: "unset", path: ["baseURL"] });
      ops.push({
        op: "set",
        path: ["proxy"],
        value: { enabled: proxyEnabled, url: proxyUrl.trim().length > 0 ? proxyUrl.trim() : DEFAULT_PROXY_URL }
      });
      const labels = Object.fromEntries(
        Object.entries(groupLabels).map(([group, label]) => [group.trim(), label.trim()]).filter(([group, label]) => group.length > 0 && label.length > 0)
      );
      if (Object.keys(labels).length > 0) ops.push({ op: "set", path: ["groupLabels"], value: labels });
      else ops.push({ op: "unset", path: ["groupLabels"] });
      ops.push({
        op: "set",
        path: ["models"],
        value: models.map((model) => {
          const id = textOf(model, "id").trim();
          const name = textOf(model, "name").trim();
          const contextWindow = numberOf(model, "contextWindow");
          const maxTokens = numberOf(model, "maxTokens");
          const listed = Array.isArray(model.reasoningEfforts) ? model.reasoningEfforts.filter((effort) => typeof effort === "string" && effort.length > 0) : [];
          const pinned = pinsToNone(model);
          const efforts = pinned ? [NO_THINK_LEVEL] : listed;
          const preset = pinned ? NO_THINK_LEVEL : typeof model.defaultReasoningEffort === "string" && efforts.includes(model.defaultReasoningEffort) ? model.defaultReasoningEffort : Object.keys(effortModelsOf(model)).length > 0 ? highestOf(efforts) : void 0;
          const effortModels = Object.fromEntries(
            Object.entries(effortModelsOf(model)).filter(([effort]) => efforts.includes(effort))
          );
          return {
            id,
            ...name.length > 0 ? { name } : {},
            ...contextWindow !== void 0 ? { contextWindow } : {},
            ...maxTokens !== void 0 ? { maxTokens } : {},
            ...model.vision === true ? { vision: true } : {},
            ...typeof model.toolCalling === "boolean" ? { toolCalling: model.toolCalling } : {},
            ...efforts.length > 0 ? { reasoningEfforts: efforts } : {},
            ...preset !== void 0 ? { defaultReasoningEffort: preset } : {},
            ...Object.keys(effortModels).length > 0 ? { effortModels } : {}
          };
        })
      });
      const mutated = await api.mutateSettings(NS, ops, revision);
      if (!mutated.ok) {
        setErrorText(mutated.error.message);
        return;
      }
      setRevision(mutated.value.revision);
      const key = keyDraft.trim();
      if (key.length > 0) {
        const stored = await api.setCredential(KEY_REF, key);
        if (!stored.ok) {
          setErrorText(stored.error.message);
          return;
        }
        setKeyDraft("");
      }
      saved(t("saved"));
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  const fetchModels = async () => {
    setBusy(true);
    setErrorText(void 0);
    setCandidates(void 0);
    setCollapsedGroups(/* @__PURE__ */ new Set());
    try {
      const key = keyDraft.trim();
      const response = await fetchCatalog({
        ...baseURL.trim().length > 0 ? { baseURL: baseURL.trim() } : {},
        ...key.length > 0 ? { apiKey: key } : {}
      });
      if (!response.ok) {
        setErrorText(`${t("fetchFailed")}: ${response.error.message}`);
        return;
      }
      const found = [...response.value.models];
      found.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
      if (found.length === 0) {
        setErrorText(t("fetchEmpty"));
        return;
      }
      const known = new Set(models.map((model) => textOf(model, "id")));
      setCandidates(found);
      setPicked(new Set(found.filter((model) => !known.has(model.id)).map((model) => model.id)));
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  const adopt = () => {
    if (candidates === void 0) return;
    const existing = new Map(models.map((model) => [textOf(model, "id"), model]));
    for (const candidate of candidates) {
      if (!picked.has(candidate.id)) continue;
      if (existing.has(candidate.id)) continue;
      existing.set(candidate.id, {
        id: candidate.id,
        ...candidate.name === void 0 ? {} : { name: candidate.name },
        ...candidate.contextWindow === void 0 ? {} : { contextWindow: candidate.contextWindow },
        ...candidate.maxTokens === void 0 ? {} : { maxTokens: candidate.maxTokens },
        ...candidate.vision === true ? { vision: true } : {},
        ...typeof candidate.toolCalling === "boolean" ? { toolCalling: candidate.toolCalling } : {},
        ...candidate.reasoningEfforts === void 0 || candidate.reasoningEfforts.length === 0 ? {} : { reasoningEfforts: [...candidate.reasoningEfforts] },
        ...candidate.defaultReasoningEffort === void 0 ? {} : { defaultReasoningEffort: candidate.defaultReasoningEffort },
        ...candidate.effortModels === void 0 ? {} : { effortModels: { ...candidate.effortModels } }
      });
    }
    setModels([...existing.values()].sort((a, b) => {
      const ai = textOf(a, "id").trim();
      const bi = textOf(b, "id").trim();
      if (ai.length === 0) return bi.length === 0 ? 0 : 1;
      if (bi.length === 0) return -1;
      return ai < bi ? -1 : ai > bi ? 1 : 0;
    }));
    setCandidates(void 0);
    setPicked(/* @__PURE__ */ new Set());
  };
  const toggle = (id) => {
    setPicked((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  };
  const toggleGroup = (key) => {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  };
  const allPicked = candidates !== void 0 && candidates.length > 0 && candidates.every((model) => picked.has(model.id));
  const somePicked = candidates !== void 0 && candidates.some((model) => picked.has(model.id));
  const toggleAll = () => {
    if (candidates === void 0) return;
    setPicked(allPicked ? /* @__PURE__ */ new Set() : new Set(candidates.map((model) => model.id)));
  };
  const selectAllRef = (0, import_react.useRef)(null);
  (0, import_react.useEffect)(() => {
    if (selectAllRef.current !== null) selectAllRef.current.indeterminate = somePicked && !allPicked;
  }, [somePicked, allPicked]);
  const updateParams = async () => {
    const ids = models.map((model) => textOf(model, "id").trim()).filter((id) => id.length > 0);
    if (ids.length === 0) {
      setErrorText(t("paramsNoModels"));
      return;
    }
    setParamsBusy(true);
    setErrorText(void 0);
    setParams(void 0);
    try {
      const response = await fetchModelParams({
        modelIds: ids,
        ...proxyEnabled && proxyUrl.trim().length > 0 ? { proxyUrl: proxyUrl.trim() } : {}
      });
      if (!response.ok) {
        setErrorText(response.error.message);
        return;
      }
      setParams(response.value);
      setParamChoices(/* @__PURE__ */ new Map());
      const matched = response.value.models.filter((entry) => entry.matches.length > 0).length;
      setNotice(
        t("paramsSummary").replace("{matched}", String(matched)).replace("{unmatched}", String(response.value.models.length - matched))
      );
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : String(error));
    } finally {
      setParamsBusy(false);
    }
  };
  const chosenMatch = (entry) => entry.matches[paramChoices.get(entry.id) ?? 0] ?? entry.matches[0];
  const applyParams = (overwrite) => {
    if (params === void 0) return;
    const byId = new Map(params.models.map((entry) => [entry.id, entry]));
    let touched = 0;
    const next = models.map((model) => {
      const id = textOf(model, "id").trim();
      const entry = byId.get(id);
      const match = entry === void 0 || entry.matches.length === 0 ? void 0 : chosenMatch(entry);
      if (match === void 0) return model;
      const nextContext = match.contextWindow;
      const nextMax = match.maxTokens;
      const nextEfforts = match.reasoningEfforts;
      const currentContext = numberOf(model, "contextWindow");
      const currentMax = numberOf(model, "maxTokens");
      const hasEfforts = Array.isArray(model.reasoningEfforts);
      const idBound = isIdBoundRow(model);
      const takeContext = nextContext !== void 0 && (overwrite || currentContext === void 0);
      const takeMax = nextMax !== void 0 && (overwrite || currentMax === void 0);
      const takeEfforts = !idBound && nextEfforts !== void 0 && nextEfforts.length > 0 && (overwrite || !hasEfforts);
      if (!takeContext && !takeMax && !takeEfforts) return model;
      touched += 1;
      return {
        ...model,
        ...takeContext && nextContext !== void 0 ? { contextWindow: nextContext } : {},
        ...takeMax && nextMax !== void 0 ? { maxTokens: nextMax } : {},
        ...takeEfforts && nextEfforts !== void 0 ? { reasoningEfforts: nextEfforts } : {},
        // A replaced tier list invalidates a preset that named the old one.
        ...takeEfforts ? { defaultReasoningEffort: highestOf(nextEfforts ?? []) } : {}
      };
    });
    setModels(next);
    setParams(void 0);
    setParamChoices(/* @__PURE__ */ new Map());
    setNotice(`${t("paramsApplied")} (${String(touched)})`);
  };
  const patch = (index, next) => {
    setModels((current) => current.map((model, at) => {
      if (at !== index) return model;
      const cleared = new Set(
        Object.entries(next).filter(([, value]) => value === void 0 || value === "").map(([key]) => key)
      );
      return Object.fromEntries(
        Object.entries({ ...model, ...next }).filter(([key]) => !cleared.has(key))
      );
    }));
  };
  const toggleExpanded = (index) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(index)) next.add(index);
      return next;
    });
  };
  const capacityText = (model, index, field) => editing.get(bufferKey(index, field)) ?? (numberOf(model, field) === void 0 ? "" : formatCapacity(numberOf(model, field)));
  const editCapacity = (index, field, text) => {
    setEditing((current) => new Map(current).set(bufferKey(index, field), text));
    patch(index, { [field]: parseCapacity(text) });
  };
  const reindexOnRemove = (current, index) => {
    const next = /* @__PURE__ */ new Map();
    for (const [key, value] of current) {
      const at = Number(key.slice(0, key.indexOf(":")));
      if (at === index) continue;
      next.set(at > index ? key.replace(/^\d+/, String(at - 1)) : key, value);
    }
    return next;
  };
  const removeModel = (index) => {
    setModels((current) => current.filter((_model, at) => at !== index));
    setExpanded((current) => {
      const next = /* @__PURE__ */ new Set();
      for (const at of current) {
        if (at < index) next.add(at);
        else if (at > index) next.add(at - 1);
      }
      return next;
    });
    setEditing((current) => reindexOnRemove(current, index));
  };
  const groups = [...new Set(
    models.map((model) => groupOf(textOf(model, "id").trim())).filter((group) => group.length > 0)
  )].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  const candidateGroups = [];
  if (candidates !== void 0) {
    const byGroup = /* @__PURE__ */ new Map();
    for (const model of candidates) {
      const group = groupOf(model.id);
      const bucket = byGroup.get(group);
      if (bucket === void 0) byGroup.set(group, [model]);
      else bucket.push(model);
    }
    candidateGroups.push(...byGroup);
  }
  if (status === "loading") return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", { className: "omniroute-section", "aria-label": t("nav"), children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "omniroute-hint", children: "\u2026" }) });
  if (status === "error") {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: "omniroute-section", "aria-label": t("nav"), children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "omniroute-error", children: `${t("loadFailed")}: ${errorText ?? ""}` }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "omniroute-button omniroute-submit", onClick: () => {
        void load();
      }, children: t("retry") })
    ] });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: "omniroute-section", "aria-label": t("nav"), children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "omniroute-intro", children: t("intro") }),
    notice === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "omniroute-notice", role: "status", children: notice }),
    !writable ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "omniroute-notice", children: t("readOnly") }) : null,
    errorText === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "omniroute-error", children: errorText }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "omniroute-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { htmlFor: "omniroute-key", children: t("keyInput") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "input",
        {
          id: "omniroute-key",
          type: "password",
          autoComplete: "off",
          className: "omniroute-input",
          disabled: keyLocked,
          placeholder: keyLocked ? t("keyEnvLocked") : keyConfigured === true ? t("keyStored") : keyConfigured === false ? t("keyMissing") : t("keyPlaceholder"),
          value: keyDraft,
          onChange: (event) => {
            setKeyDraft(event.target.value);
          }
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "omniroute-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { htmlFor: "omniroute-base", children: t("baseUrl") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "input",
        {
          id: "omniroute-base",
          type: "text",
          className: "omniroute-input",
          placeholder: t("baseUrlPlaceholder"),
          value: baseURL,
          onChange: (event) => {
            setBaseURL(event.target.value);
          }
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: "omniroute-block", "aria-label": t("proxySection"), children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "omniroute-block-title", children: t("proxySection") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "omniroute-proxyrow", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "input",
            {
              type: "checkbox",
              checked: proxyEnabled,
              "aria-label": t("proxyToggle"),
              onChange: (event) => {
                setProxyEnabled(event.target.checked);
              }
            }
          ),
          t("proxyToggle")
        ] }),
        proxyEnabled ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "input",
          {
            className: "omniroute-input",
            type: "text",
            "aria-label": t("proxyUrl"),
            placeholder: DEFAULT_PROXY_URL,
            value: proxyUrl,
            onChange: (event) => {
              setProxyUrl(event.target.value);
            }
          }
        ) : null
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "omniroute-hint", children: t("proxyHint") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: "omniroute-catalog", "aria-label": t("models"), children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "omniroute-catalog-head", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "omniroute-catalog-title", children: t("models") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "omniroute-catalog-actions", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "omniroute-linkbutton", disabled: busy, onClick: () => {
            void fetchModels();
          }, children: busy ? t("fetching") : t("fetchModels") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "omniroute-linkbutton", disabled: paramsBusy, onClick: () => {
            void updateParams();
          }, children: paramsBusy ? t("paramsFetching") : t("updateParams") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "omniroute-linkbutton", disabled: busy || models.length === 0, onClick: () => {
            setModels([]);
            setExpanded(/* @__PURE__ */ new Set());
            setEditing(/* @__PURE__ */ new Map());
            setParams(void 0);
            setParamChoices(/* @__PURE__ */ new Map());
          }, children: t("clearModels") })
        ] })
      ] }),
      models.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "omniroute-empty", children: t("modelsEmpty") }) : null,
      models.map((model, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "omniroute-entry", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "omniroute-modelrow", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "input",
            {
              className: "omniroute-input",
              type: "text",
              value: textOf(model, "id"),
              placeholder: t("modelId"),
              "aria-label": `${t("modelId")} ${String(index + 1)}`,
              onChange: (event) => {
                patch(index, { id: event.target.value });
              }
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "input",
            {
              className: "omniroute-input",
              type: "text",
              value: textOf(model, "name"),
              placeholder: t("modelName"),
              "aria-label": `${t("modelName")} ${String(index + 1)}`,
              onChange: (event) => {
                patch(index, { name: event.target.value === "" ? void 0 : event.target.value });
              }
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              type: "button",
              className: "omniroute-iconbutton",
              "aria-label": `${t("modelAdvanced")} ${String(index + 1)}`,
              "aria-expanded": expanded.has(index),
              title: t("modelAdvanced"),
              onClick: () => {
                toggleExpanded(index);
              },
              children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(IconChevron, { open: expanded.has(index) })
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              type: "button",
              className: "omniroute-iconbutton omniroute-iconbutton--danger",
              "aria-label": `${t("removeModel")} ${String(index + 1)}`,
              title: t("removeModel"),
              onClick: () => {
                removeModel(index);
              },
              children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(IconTrash, {})
            }
          )
        ] }),
        textOf(model, "id").trim().length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "omniroute-badges", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "omniroute-modeldisplay", children: groupedModelName(textOf(model, "id").trim(), textOf(model, "name").trim(), groupLabels) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: `omniroute-badge ${model.vision === true ? "omniroute-badge--on" : "omniroute-badge--off"}`, children: t("capabilityVision") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: `omniroute-badge ${model.toolCalling === true ? "omniroute-badge--on" : "omniroute-badge--off"}`, children: t("capabilityToolCalling") })
        ] }),
        expanded.has(index) ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "omniroute-modeladvanced", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "omniroute-modelfield", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "omniroute-modelfield-label", children: t("contextWindow") }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "input",
              {
                className: "omniroute-input",
                type: "text",
                inputMode: "numeric",
                value: capacityText(model, index, "contextWindow"),
                placeholder: CAPACITY_HINT.contextWindow,
                "aria-label": `${t("contextWindow")} ${String(index + 1)}`,
                onChange: (event) => {
                  editCapacity(index, "contextWindow", event.target.value);
                }
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "omniroute-modelfield", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "omniroute-modelfield-label", children: t("maxTokens") }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "input",
              {
                className: "omniroute-input",
                type: "text",
                inputMode: "numeric",
                value: capacityText(model, index, "maxTokens"),
                placeholder: CAPACITY_HINT.maxTokens,
                "aria-label": `${t("maxTokens")} ${String(index + 1)}`,
                onChange: (event) => {
                  editCapacity(index, "maxTokens", event.target.value);
                }
              }
            )
          ] }),
          Array.isArray(model.reasoningEfforts) && model.reasoningEfforts.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "omniroute-modelfield", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "omniroute-modelfield-label", children: t("modelReasoning") }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
              "select",
              {
                className: "omniroute-select",
                "aria-label": `${t("defaultEffort")} ${String(index + 1)}`,
                title: pinsToNone(model) ? t("effortForcedNone") : t("defaultEffortHint"),
                disabled: pinsToNone(model),
                value: presetOf(model),
                onChange: (event) => {
                  patch(index, { defaultReasoningEffort: event.target.value });
                },
                children: [
                  isIdBoundRow(model) ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: UNSET_EFFORT, children: t("effortUnset") }),
                  model.reasoningEfforts.map((effort) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: effort, children: effortLabel(effort, t("effortNone")) }, effort))
                ]
              }
            )
          ] }) : null
        ] }) : null,
        expanded.has(index) ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "omniroute-modelnotes", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "omniroute-hint", children: `${capabilitySummary(model, {
            vision: t("capabilityVision"),
            tools: t("capabilityToolCalling"),
            none: t("capabilityNone")
          })}` }),
          Object.keys(effortModelsOf(model)).length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: "omniroute-hint", children: [
            `${t("effortIdBound")} \xB7 ${t("effortIdBoundHint")}`,
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("br", {}),
            Object.entries(effortModelsOf(model)).map(([effort, wireModel]) => t("effortMapRow").replace("{effort}", effortLabel(effort, t("effortNone"))).replace("{model}", wireModel)).join(" \xB7 ")
          ] }) : isIdBoundRow(model) ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "omniroute-hint", children: t("effortIdBound") }) : Array.isArray(model.reasoningEfforts) && model.reasoningEfforts.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "omniroute-hint", children: t("effortFromTiers") }) : null
        ] }) : null
      ] }, index)),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "button",
        {
          type: "button",
          className: "omniroute-addmodel",
          disabled: busy,
          onClick: () => {
            setModels((current) => [...current, { id: "" }]);
          },
          children: t("addModel")
        }
      )
    ] }),
    groups.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: "omniroute-block", "aria-label": t("groupLabels"), children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "omniroute-block-title", children: t("groupLabels") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "omniroute-hint", children: t("groupDisplayHint") }),
      groups.map((group) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "omniroute-grouplabel-row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "omniroute-grouplabel-name", children: group }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "input",
          {
            className: "omniroute-input",
            type: "text",
            "aria-label": `${t("groupLabels")} ${group}`,
            placeholder: t("groupLabelPlaceholder"),
            value: groupLabels[group] ?? "",
            onChange: (event) => {
              const next = event.target.value;
              setGroupLabels((current) => {
                const copy = { ...current };
                if (next.length === 0) delete copy[group];
                else copy[group] = next;
                return copy;
              });
            }
          }
        )
      ] }, group))
    ] }),
    candidates === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "omniroute-candidates", ref: candidatesRef, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "omniroute-candidates-head", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { className: "omniroute-params-title", children: t("fetchTitle") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "input",
            {
              ref: selectAllRef,
              type: "checkbox",
              checked: allPicked,
              "aria-label": t("fetchSelectAll"),
              onChange: toggleAll
            }
          ),
          " ",
          allPicked ? t("fetchInvert") : t("fetchSelectAll")
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "omniroute-candidates-list", children: candidateGroups.map(([group, rows]) => {
        const key = groupKeyOf(group);
        const label = group.length === 0 ? t("groupOther") : groupLabels[group] ?? group;
        const open = !collapsedGroups.has(key);
        return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "omniroute-candidates-group", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
            "button",
            {
              type: "button",
              className: "omniroute-candidategroup-toggle",
              "aria-expanded": open,
              "aria-label": t("groupToggle").replace("{group}", label),
              onClick: () => {
                toggleGroup(key);
              },
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(IconChevron, { open }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "omniroute-candidategroup-name", children: label }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "omniroute-candidategroup-count", children: rows.length })
              ]
            }
          ),
          open ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", { children: rows.map((model) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "input",
              {
                type: "checkbox",
                checked: picked.has(model.id),
                onChange: () => {
                  toggle(model.id);
                }
              }
            ),
            " ",
            model.id,
            model.name === void 0 || model.name === model.id ? "" : ` (${model.name})`,
            model.reasoningEfforts === void 0 || model.reasoningEfforts.length === 0 ? "" : ` \xB7 ${t("modelReasoning")}: ${model.reasoningEfforts.map((effort) => effortLabel(effort, t("effortNone"))).join("/")}`,
            model.contextWindow === void 0 ? "" : ` \xB7 ${t("contextWindow")} ${formatCapacity(model.contextWindow)}`,
            model.vision === true ? ` \xB7 ${t("capabilityVision")}` : "",
            model.toolCalling === false ? "" : model.toolCalling === true ? ` \xB7 ${t("capabilityToolCalling")}` : ""
          ] }) }, model.id)) }) : null
        ] }, key);
      }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "omniroute-candidates-footer", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "omniroute-button omniroute-button--primary", disabled: picked.size === 0, onClick: adopt, children: t("fetchAdopt") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "omniroute-button", onClick: () => {
          setCandidates(void 0);
          setPicked(/* @__PURE__ */ new Set());
          setCollapsedGroups(/* @__PURE__ */ new Set());
        }, children: t("fetchCancel") })
      ] })
    ] }),
    params === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "omniroute-params", ref: paramsRef, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { className: "omniroute-params-title", children: t("paramsTitle") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "omniroute-params-summary", children: t("paramsSummary").replace("{matched}", String(params.models.filter((entry) => entry.matches.length > 0).length)).replace("{unmatched}", String(params.models.filter((entry) => entry.matches.length === 0).length)) }),
      params.models.map((entry) => {
        const row = models.find((model) => textOf(model, "id").trim() === entry.id);
        const idBoundNote = row !== void 0 && isIdBoundRow(row) ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "omniroute-params-unmatched", children: t("paramsIdBoundSkipped") }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {});
        if (entry.matches.length === 0) {
          return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "omniroute-params-row", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "omniroute-params-id", children: entry.id }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "omniroute-params-unmatched", children: t("paramsUnmatched") }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {})
          ] }, entry.id);
        }
        if (entry.matches.length === 1) {
          const match2 = entry.matches[0];
          if (match2 === void 0) return null;
          return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "omniroute-params-row", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "omniroute-params-id", children: entry.id }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "omniroute-params-values", children: `${match2.official === true ? `${t("officialMark")} \xB7 ` : ""}${match2.provider} \xB7 ${t("contextWindow")} ${match2.contextWindow ?? "\u2014"} / ${t("maxTokens")} ${match2.maxTokens ?? "\u2014"}${match2.reasoningEfforts !== void 0 && match2.reasoningEfforts.length > 0 ? ` \xB7 ${t("modelReasoning")}: ${match2.reasoningEfforts.join("/")}` : ""}` }),
            idBoundNote
          ] }, entry.id);
        }
        const chosen = paramChoices.get(entry.id) ?? 0;
        const match = entry.matches[chosen] ?? entry.matches[0];
        if (match === void 0) return null;
        return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "omniroute-params-row", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "omniroute-params-id", children: entry.id }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "select",
            {
              className: "omniroute-select",
              "aria-label": `${t("paramsProvider")} ${entry.id}`,
              value: String(chosen),
              onChange: (event) => {
                setParamChoices((current) => new Map(current).set(entry.id, Number(event.target.value)));
              },
              children: entry.matches.map((candidate, at) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: String(at), children: `${candidate.official === true ? `${t("officialMark")} \xB7 ` : ""}${candidate.provider}: ${t("contextWindow")} ${candidate.contextWindow ?? "\u2014"} / ${t("maxTokens")} ${candidate.maxTokens ?? "\u2014"}${candidate.reasoningEfforts !== void 0 && candidate.reasoningEfforts.length > 0 ? ` \xB7 ${t("modelReasoning")}: ${candidate.reasoningEfforts.join("/")}` : ""}` }, candidate.provider))
            }
          ),
          idBoundNote
        ] }, entry.id);
      }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "omniroute-params-actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "omniroute-button omniroute-button--primary", onClick: () => {
          applyParams(true);
        }, children: t("paramsOverwrite") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "omniroute-button", onClick: () => {
          applyParams(false);
        }, children: t("paramsFillBlank") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "omniroute-button", onClick: () => {
          setParams(void 0);
          setParamChoices(/* @__PURE__ */ new Map());
        }, children: t("fetchCancel") })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "omniroute-hint", children: t("modelHint") }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "omniroute-button omniroute-button--primary omniroute-submit", disabled: busy || !writable, onClick: () => {
      void save();
    }, children: busy ? t("applying") : t("apply") })
  ] });
}

// src/client/locale.ts
var zh = {
  nav: "Custom Provider",
  intro: "\u914D\u7F6E OmniRoute \u7F51\u5173\uFF1AAPI \u5BC6\u94A5\u3001\u7F51\u5173\u5730\u5740\u3001\u6A21\u578B\u5217\u8868\uFF0C\u4EE5\u53CA\u7F51\u5173\u81EA\u5DF1\u7684 web_search / web_fetch\u3002\u6A21\u578B\u53C2\u6570\u4E0E\u80FD\u529B\u7531\u7F51\u5173 /v1/models \u66B4\u9732\u7684\u5B57\u6BB5\u51B3\u5B9A\u3002",
  keyInput: "API \u5BC6\u94A5",
  keyPlaceholder: "\u7C98\u8D34\u4EE4\u724C\uFF1B\u7559\u7A7A\u4FDD\u6301\u5DF2\u5B58\u5BC6\u94A5\u4E0D\u53D8",
  keyStored: "\u5DF2\u914D\u7F6E\uFF08\u4E0D\u56DE\u663E\uFF09",
  keyMissing: "\u672A\u914D\u7F6E",
  keyEnvLocked: "\u7531\u542F\u52A8\u73AF\u5883\u63D0\u4F9B\uFF08\u53EA\u8BFB\uFF09",
  baseUrl: "\u7F51\u5173\u5730\u5740\uFF08\u542B /v1 \u524D\u7F00\uFF09",
  baseUrlPlaceholder: "http://127.0.0.1:20128/v1",
  models: "\u6A21\u578B",
  modelsEmpty: "\u6682\u65E0\u6A21\u578B\uFF1A\u70B9\u300C\u6DFB\u52A0\u6A21\u578B\u300D\u624B\u52A8\u65B0\u589E\uFF0C\u6216\u300C\u83B7\u53D6\u6A21\u578B\u300D\u4ECE\u7F51\u5173\u62C9\u53D6\u3002",
  clearModels: "\u6E05\u7A7A",
  addModel: "\u6DFB\u52A0\u6A21\u578B",
  removeModel: "\u5220\u9664\u8BE5\u6A21\u578B",
  modelAdvanced: "\u9AD8\u7EA7\u8BBE\u7F6E\uFF08\u4E0A\u4E0B\u6587 / \u8F93\u51FA\u4E0A\u9650 / \u601D\u8003\u7B49\u7EA7\uFF09",
  modelId: "\u6A21\u578B ID",
  modelName: "\u663E\u793A\u540D\u79F0",
  contextWindow: "\u4E0A\u4E0B\u6587\u7A97\u53E3",
  maxTokens: "\u8F93\u51FA\u4E0A\u9650",
  modelReasoning: "\u601D\u8003\u7B49\u7EA7",
  defaultEffort: "\u9ED8\u8BA4\u601D\u8003\u7B49\u7EA7",
  defaultEffortHint: "\u5207\u6362\u601D\u8003\u6A21\u5F0F\u65F6\u81EA\u52A8\u9009\u4E2D\u8BE5\u7B49\u7EA7\u3002",
  effortNone: "\u4E0D\u601D\u8003",
  effortUnset: "\u4E0D\u4F20\uFF08\u4F7F\u7528\u6A21\u578B\u9ED8\u8BA4\u503C\uFF09",
  effortForcedNone: "\u8BE5\u8DEF\u7531\u7531\u7F51\u5173\u56FA\u5B9A\u4E3A\u4E0D\u601D\u8003\uFF0C\u7B49\u7EA7\u4E0D\u53EF\u6539\u3002",
  effortIdBound: "\u7B49\u7EA7\u5728\u6A21\u578B id \u4E0A",
  effortIdBoundHint: "\u5DF2\u6309\u8868\u5E76\u53D1\uFF1A\u8BE5\u7F51\u5173\u628A\u7B49\u7EA7\u7F16\u8FDB\u6A21\u578B id\uFF0C\u53D1\u9001\u65F6\u6309\u6240\u9009\u7B49\u7EA7\u6362\u6210\u5BF9\u5E94 id\u3002",
  effortMapRow: "{effort} \u2192 {model}",
  effortFromTiers: "\u7B49\u7EA7\u6765\u81EA\u7F51\u5173\u58F0\u660E\u7684 effort_tiers\uFF08\u8BE5\u6A21\u578B id \u672A\u9650\u5B9A\u7B49\u7EA7\uFF09\u3002",
  capabilityVision: "\u56FE\u7247\u8F93\u5165",
  capabilityToolCalling: "\u5DE5\u5177\u8C03\u7528",
  capabilityNone: "\u7F51\u5173\u672A\u58F0\u660E\u80FD\u529B",
  modelIdRequired: "\u6A21\u578B ID \u4E0D\u80FD\u4E3A\u7A7A",
  modelIdDuplicate: "\u6A21\u578B ID \u91CD\u590D",
  capacityInvalid: "\u5BB9\u91CF\u9700\u4E3A\u6B63\u6570\uFF0C\u53EF\u7528 K/M \u7F29\u5199\uFF08\u5982 128K\u30011M\uFF09",
  fetchModels: "\u83B7\u53D6\u6A21\u578B",
  fetching: "\u6B63\u5728\u8BE2\u95EE\u7F51\u5173\u2026",
  fetchEmpty: "\u7F51\u5173\u6CA1\u6709\u5217\u51FA\u53EF\u7528\u7684 chat \u6A21\u578B\uFF08embedding / rerank / ranker \u5DF2\u6309\u80FD\u529B\u4E0E\u547D\u540D\u8FC7\u6EE4\uFF09\u3002",
  fetchTitle: "\u9009\u62E9\u8981\u6DFB\u52A0\u7684\u6A21\u578B",
  fetchSelectAll: "\u5168\u9009",
  fetchInvert: "\u53CD\u9009",
  fetchAdopt: "\u6DFB\u52A0\u6240\u9009",
  fetchCancel: "\u53D6\u6D88",
  fetchFailed: "\u7F51\u5173\u76EE\u5F55\u83B7\u53D6\u5931\u8D25",
  updateParams: "\u4ECE models.dev \u83B7\u53D6\u6A21\u578B\u4FE1\u606F",
  paramsFetching: "\u6B63\u5728\u67E5\u8BE2 models.dev\u2026",
  paramsTitle: "\u6A21\u578B\u53C2\u6570\uFF08\u6765\u81EA models.dev\uFF09",
  paramsSummary: "\u5339\u914D {matched} \u4E2A \xB7 \u672A\u5339\u914D {unmatched} \u4E2A",
  paramsUnmatched: "\u672A\u5339\u914D\uFF08\u4FDD\u6301\u539F\u503C\uFF09",
  paramsProvider: "\u9009\u62E9\u6570\u636E\u6765\u6E90\u4F9B\u5E94\u5546",
  officialMark: "\u5B98\u65B9",
  paramsOverwrite: "\u5E94\u7528\uFF08\u8986\u76D6\u73B0\u6709\u503C\uFF09",
  paramsFillBlank: "\u4EC5\u586B\u7A7A\u767D\u5B57\u6BB5",
  paramsApplied: "\u5DF2\u66F4\u65B0\u6A21\u578B\u4FE1\u606F",
  paramsNoModels: "\u6CA1\u6709\u53EF\u67E5\u8BE2\u7684\u6A21\u578B\uFF1A\u5148\u6DFB\u52A0\u6A21\u578B\u6216\u4ECE\u7F51\u5173\u83B7\u53D6\u3002",
  paramsIdBoundSkipped: "\u601D\u8003\u7B49\u7EA7\u7531\u6A21\u578B id \u51B3\u5B9A\uFF0C\u672A\u8986\u76D6",
  proxyToggle: "\u4EE3\u7406",
  proxyUrl: "\u4EE3\u7406\u5730\u5740",
  proxyHint: "\u4EC5\u7528\u4E8E\u4E0B\u8F7D models.dev \u6A21\u578B\u53C2\u6570\uFF1B\u7F51\u5173\u8BF7\u6C42\u4ECD\u8D70\u5BBF\u4E3B\u7F51\u7EDC\uFF0C\u5BBF\u4E3B\u81EA\u8EAB\u7684\u4EE3\u7406\u8BBE\u7F6E\u4F9D\u7136\u751F\u6548\uFF0C\u5173\u95ED\u6B64\u9879\u4E0D\u7B49\u4E8E\u76F4\u8FDE\u3002",
  proxySection: "\u7F51\u7EDC",
  groupLabels: "\u5206\u7EC4\u663E\u793A\u540D",
  groupOther: "\u7EC4\u5408",
  groupToggle: "\u6298\u53E0\u6216\u5C55\u5F00 {group} \u5206\u7EC4",
  groupLabelPlaceholder: "\u663E\u793A\u540D\uFF08\u7559\u7A7A\u7528\u539F\u540D\uFF09",
  groupDisplayHint: "\u4EC5\u5F71\u54CD\u663E\u793A\uFF1A\u5206\u7EC4\u5185\u7684\u6A21\u578B\u540D\u4F1A\u5199\u4F5C\u300C[\u663E\u793A\u540D]\u6A21\u578B\u300D\uFF0C\u6A21\u578B\u5217\u8868\uFF08\u5BF9\u8BDD\u91CC\u7684\u6A21\u578B\u9009\u62E9\u5668\uFF09\u4E0E\u672C\u9875\u540C\u6837\u5982\u6B64\uFF1B\u663E\u793A\u540D\u52A0\u82F1\u6587\u4E2D\u62EC\u53F7\u524D\u7F00\uFF0C\u518D\u63A5\u6A21\u578B id \u672B\u6BB5\uFF1B\u7EC4\u5408\u6A21\u578B\u6CA1\u6709\u5206\u7EC4\u5F52\u5C5E\uFF0C\u53EA\u663E\u793A\u539F\u59CB id\u3002",
  apply: "\u4FDD\u5B58",
  applying: "\u6B63\u5728\u4FDD\u5B58\u2026",
  saved: "\u5DF2\u4FDD\u5B58\u3002",
  loadFailed: "\u52A0\u8F7D\u5931\u8D25",
  nsNotRegistered: "dsh-llm-omniroute: \u8BBE\u7F6E\u547D\u540D\u7A7A\u95F4\u672A\u6CE8\u518C\uFF08\u63D2\u4EF6\u884C\u662F\u5426\u5DF2\u52A0\u8F7D\uFF1F\uFF09",
  retry: "\u91CD\u8BD5",
  readOnly: "\u5F53\u524D\u8BBE\u7F6E\u6E90\u53EA\u8BFB\uFF0C\u65E0\u6CD5\u4FDD\u5B58\u3002",
  modelHint: "\u6A21\u578B\u5217\u8868\u4E0E\u80FD\u529B\u6765\u81EA\u7F51\u5173 /v1/models\uFF1A\u4E0A\u4E0B\u6587\u3001\u8F93\u51FA\u4E0A\u9650\u3001\u56FE\u7247\u4E0E\u5DE5\u5177\u80FD\u529B\u7531\u7F51\u5173\u58F0\u660E\uFF1B\u601D\u8003\u7B49\u7EA7\u4F18\u5148\u770B\u6A21\u578B id\uFF08no-think \u524D\u7F00 = \u65E0\u7B49\u7EA7\uFF0C-low/-high \u7B49\u540E\u7F00 = \u7B49\u7EA7\u5199\u5728 id \u4E0A\uFF0C\u6B64\u65F6\u540C\u4E00\u539F\u751F\u6A21\u578B\u4F1A\u6298\u53E0\u4E3A\u4E00\u884C\uFF09\uFF0Cid \u672A\u9650\u5B9A\u7B49\u7EA7\u65F6\u624D\u91C7\u7528\u7F51\u5173\u58F0\u660E\u7684 effort_tiers\u3002web_search / web_fetch \u8D70\u672C\u7F51\u5173\u7684\u641C\u7D22\u4E0E\u6293\u53D6\u6808\u3002"
};
var en = {
  nav: "Custom Provider",
  intro: "Configure the OmniRoute gateway: API key, gateway base URL, model list, and the gateway's own web_search / web_fetch. Model parameters and capabilities come from the fields its /v1/models listing discloses.",
  keyInput: "API key",
  keyPlaceholder: "Paste the token; leave blank to keep the stored key",
  keyStored: "Configured (never echoed)",
  keyMissing: "Not configured",
  keyEnvLocked: "Provided by the launch environment (read-only)",
  baseUrl: "Gateway base URL (including /v1)",
  baseUrlPlaceholder: "http://127.0.0.1:20128/v1",
  models: "Models",
  modelsEmpty: "No models yet: add one by hand, or fetch the list from the gateway.",
  clearModels: "Clear",
  addModel: "Add model",
  removeModel: "Remove this model",
  modelAdvanced: "Advanced (context window / max output / thinking levels)",
  modelId: "Model ID",
  modelName: "Display name",
  contextWindow: "Context window",
  maxTokens: "Max output tokens",
  modelReasoning: "Thinking levels",
  defaultEffort: "Default thinking level",
  defaultEffortHint: "Selected automatically when switching into thinking mode.",
  effortNone: "No thinking",
  effortUnset: "Not sent (model default)",
  effortForcedNone: "The gateway pins this route to no thinking; the level cannot be changed.",
  effortIdBound: "Level lives in the model id",
  effortIdBoundHint: "Adopted as listed: this gateway encodes the level in the model id, so a request sends the id matching the selected level.",
  effortMapRow: "{effort} \u2192 {model}",
  effortFromTiers: "Levels come from the gateway-declared effort_tiers (this model id encodes no level of its own).",
  capabilityVision: "Image input",
  capabilityToolCalling: "Tool calling",
  capabilityNone: "No capability declared",
  modelIdRequired: "Model id is required",
  modelIdDuplicate: "Duplicate model id",
  capacityInvalid: "Capacity must be a positive number; K/M suffix allowed (e.g. 128K, 1M)",
  fetchModels: "Fetch models",
  fetching: "Asking the gateway\u2026",
  fetchEmpty: "The gateway listed no chat-capable models (embedding / rerank / ranker filtered by capability and by name).",
  fetchTitle: "Choose models to add",
  fetchSelectAll: "Select all",
  fetchInvert: "Invert",
  fetchAdopt: "Add selected",
  fetchCancel: "Cancel",
  fetchFailed: "Gateway catalog fetch failed",
  updateParams: "Fetch model info from models.dev",
  paramsFetching: "Querying models.dev\u2026",
  paramsTitle: "Model parameters (from models.dev)",
  paramsSummary: "{matched} matched \xB7 {unmatched} unmatched",
  paramsUnmatched: "No match (values kept)",
  paramsProvider: "Choose the data provider",
  officialMark: "Official",
  paramsOverwrite: "Apply (overwrite existing)",
  paramsFillBlank: "Fill blank fields only",
  paramsApplied: "Model info updated",
  paramsNoModels: "No models to look up: add one or fetch from the gateway first.",
  paramsIdBoundSkipped: "thinking levels come from the model id and were kept",
  proxyToggle: "Proxy",
  proxyUrl: "Proxy URL",
  proxyHint: "Used only for the models.dev parameter download. Gateway requests still use the host network, and the host may apply its own proxy settings, so disabling this does not force a direct connection.",
  proxySection: "Network",
  groupLabels: "Group display names",
  groupOther: "combos",
  groupToggle: "Collapse or expand the {group} group",
  groupLabelPlaceholder: "Display name (blank keeps the group name)",
  groupDisplayHint: "Display only: inside a group a model name reads [display name]model \u2014 the display name in brackets before the id's final segment, in the model list (the picker in a conversation) and on this page alike. Combo models belong to no group and show their plain id.",
  apply: "Save",
  applying: "Saving\u2026",
  saved: "Saved.",
  loadFailed: "Load failed",
  nsNotRegistered: "dsh-llm-omniroute: the settings namespace is not registered (is the plugin row loaded?)",
  retry: "Retry",
  readOnly: "The active settings source is read-only; nothing can be saved.",
  modelHint: "The model list and its capabilities come from the gateway /v1/models listing: context, output cap, image and tool support are what the gateway declares. Thinking levels prefer the model id (a no-think prefix means no level; a -low/-high suffix means the level is in the id, and every level of one native model folds into a single row); the declared effort_tiers are used only when the id encodes no level. web_search / web_fetch use this gateway's search and fetch stack."
};

// src/client/apply.ts
var NS2 = "settings.omniroute";
var SECTION_CSS = `
.omniroute-section { display: flex; flex-direction: column; }
.omniroute-section p { margin: 0; }
.omniroute-intro {
  margin-bottom: 16px; font-size: 13px; line-height: 20px;
  color: var(--dsw-alias-label-secondary);
}
.omniroute-field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
.omniroute-field > label { font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-primary); }
.omniroute-input {
  box-sizing: border-box; height: 28px; padding: 0 10px; border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font: inherit; font-size: 13px;
}
.omniroute-input:focus { outline: none; border-color: var(--dsw-alias-brand-primary); }
.omniroute-input::placeholder { color: var(--dsw-alias-label-dimmed); }
.omniroute-input:disabled { opacity: 0.6; cursor: default; }
.omniroute-button {
  box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center;
  height: 28px; padding: 0 12px; border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: transparent; color: var(--dsw-alias-label-primary);
  font: inherit; font-size: 12px; cursor: pointer;
}
.omniroute-button:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.omniroute-button:disabled { opacity: 0.4; cursor: default; }
.omniroute-button--primary {
  border-color: transparent;
  background: var(--dsw-alias-button-primary-fill);
  color: var(--dsw-alias-label-primary-foreground);
}
.omniroute-button--primary:hover:not(:disabled) { background: var(--dsw-alias-button-primary-hover); }
.omniroute-error { color: var(--dsw-alias-state-error-primary); font-size: 13px; line-height: 20px; }
.omniroute-notice { margin-bottom: 12px; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
.omniroute-hint { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary); }
/* Model catalog: one bordered card per model, id and display name on the row,
   capacities and thinking levels behind the row's own disclosure. The card
   padding and radius follow the shell's provider card. */
.omniroute-catalog {
  display: flex; flex-direction: column; gap: 10px;
  padding-top: 16px; margin-bottom: 16px;
  border-top: 1px solid var(--dsw-alias-border-l2);
}
.omniroute-catalog-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.omniroute-catalog-title {
  font-size: 14px; line-height: 22px; font-weight: 500;
  color: var(--dsw-alias-label-primary);
}
.omniroute-catalog-actions { display: flex; align-items: center; gap: 4px; }
.omniroute-linkbutton {
  box-sizing: border-box; display: inline-flex; align-items: center;
  height: 28px; padding: 0 10px; border: none; border-radius: 8px;
  background: transparent; color: var(--dsw-alias-label-primary);
  font: inherit; font-size: 12px; cursor: pointer;
}
.omniroute-linkbutton:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.omniroute-linkbutton:disabled { opacity: 0.4; cursor: default; }
.omniroute-empty { color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 18px; }
.omniroute-entry {
  display: flex; flex-direction: column; gap: 12px;
  border: 0.5px solid var(--dsw-alias-settings-card-stroke);
  background: var(--dsw-alias-settings-card-fill);
  border-radius: var(--dsw-radius-xl);
  padding: 12px 14px;
}
.omniroute-modelrow {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 8px;
}
/* Square, label-free affordances: the row's own inputs carry the meaning, so
   the actions stay glyphs and announce themselves through aria-label. */
.omniroute-iconbutton {
  box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; padding: 0; border: none; border-radius: 8px;
  background: transparent; color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
}
.omniroute-iconbutton:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.omniroute-iconbutton:disabled { opacity: 0.4; cursor: default; }
.omniroute-iconbutton--danger:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover-danger);
  color: var(--dsw-alias-state-error-primary);
}
/* The disclosure body sits under a divider, like the shell's card sections. */
.omniroute-modeladvanced {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--dsw-alias-border-l2);
}
/* Capability and thinking-level notes under one row's disclosure. */
.omniroute-modelnotes { display: flex; flex-direction: column; gap: 4px; }
.omniroute-modelfield { display: flex; flex-direction: column; gap: 4px; }
.omniroute-modelfield-label { color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 18px; }
.omniroute-addmodel {
  box-sizing: border-box; width: 100%; display: inline-flex; align-items: center; justify-content: center;
  height: 44px; padding: 0 14px; border-radius: 16px;
  border: 1px dashed var(--dsw-alias-border-l2);
  background: transparent; color: var(--dsw-alias-label-secondary);
  font: inherit; font-size: 14px; cursor: pointer;
}
.omniroute-addmodel:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.omniroute-addmodel:disabled { opacity: 0.4; cursor: default; }
.omniroute-candidates {
  border: 0.5px solid var(--dsw-alias-settings-card-stroke);
  background: var(--dsw-alias-settings-card-fill);
  border-radius: var(--dsw-radius-xl);
  padding: 14px; margin-bottom: 16px;
}
.omniroute-candidates-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.omniroute-candidates-head label,
.omniroute-proxyrow label {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-primary);
}
.omniroute-candidates input[type="checkbox"],
.omniroute-proxyrow input[type="checkbox"] {
  width: 14px; height: 14px; margin: 0; accent-color: var(--dsw-alias-brand-primary);
}
/* The fetched list is bounded and scrolls on its own: a gateway catalog runs to
   dozens of entries, and an unbounded list would push every following control
   far below the panel. */
.omniroute-candidates-list { max-height: 320px; overflow-y: auto; }
.omniroute-candidates-group { padding: 2px 0 6px; }
/* The group heading doubles as the disclosure control: one click folds the whole
   group, and the count stays on the heading so a folded group still reports its
   size. */
.omniroute-candidategroup-toggle {
  box-sizing: border-box; width: 100%; display: flex; align-items: center;
  gap: 6px; height: 28px; padding: 0 8px 0 2px; margin: 6px 0 0;
  border: none; border-radius: 8px; background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit; font-size: 12px; line-height: 18px; font-weight: 500;
  text-align: left; cursor: pointer;
}
.omniroute-candidategroup-toggle:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.omniroute-candidategroup-name {
  flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap;
}
.omniroute-candidategroup-count {
  flex: none; font-size: 11px; line-height: 18px;
  color: var(--dsw-alias-label-tertiary); font-variant-numeric: tabular-nums;
}
.omniroute-candidates ul {
  list-style: none; padding: 0; margin: 4px 0 0;
}
.omniroute-candidates li { padding: 3px 0; font-size: 13px; line-height: 20px; }
.omniroute-candidates-footer { display: flex; align-items: center; gap: 8px; }
/* Proxy control + models.dev params panel. */
.omniroute-proxyrow {
  display: flex; flex-direction: row; align-items: center; flex-wrap: wrap;
  gap: 8px; margin-bottom: 8px;
}
.omniroute-proxyrow .omniroute-input { max-width: 240px; }
.omniroute-select {
  box-sizing: border-box; height: 28px; padding: 0 10px; border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font: inherit; font-size: 13px; max-width: 240px;
}
.omniroute-params {
  border: 0.5px solid var(--dsw-alias-settings-card-stroke);
  background: var(--dsw-alias-settings-card-fill);
  border-radius: var(--dsw-radius-xl);
  padding: 14px; margin-bottom: 16px;
}
.omniroute-params-title { font-size: 14px; line-height: 22px; font-weight: 500; color: var(--dsw-alias-label-primary); }
.omniroute-params-summary { margin: 6px 0 10px; color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 18px; }
.omniroute-params-row {
  display: grid; grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center; gap: 8px; padding: 4px 0;
}
/* The id rides a fixed-width text box so rows align; content wider than
   the box stays hidden until hover, when it scrolls horizontally. */
.omniroute-params-id {
  box-sizing: border-box; width: 30ch; max-width: 30ch; height: 28px;
  padding: 0 8px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font: inherit; font-size: 12px; line-height: 26px;
  text-align: left; white-space: nowrap; overflow: hidden;
  scrollbar-width: thin;
}
.omniroute-params-id:hover { overflow-x: auto; }
.omniroute-params-values {
  color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 18px;
  font-variant-numeric: tabular-nums; text-align: left;
}
.omniroute-params-unmatched { color: var(--dsw-alias-label-dimmed); font-size: 12px; line-height: 18px; }
.omniroute-params-actions { display: flex; align-items: center; gap: 8px; margin-top: 12px; }
.omniroute-submit { align-self: flex-start; margin-top: 12px; }
/* Blocks the model entries do not cover: the network block (the models.dev
   download proxy, which has nothing to do with the catalog) and the group
   display-name editor. Same card shell as a model entry. */
.omniroute-block {
  display: flex; flex-direction: column; gap: 8px;
  padding: 12px 14px; margin-bottom: 16px;
  border: 0.5px solid var(--dsw-alias-settings-card-stroke);
  background: var(--dsw-alias-settings-card-fill);
  border-radius: var(--dsw-radius-xl);
}
.omniroute-block-title {
  display: block; font-size: 14px; line-height: 22px; font-weight: 500;
  color: var(--dsw-alias-label-primary);
}
/* Capability badges ride the row itself, so the list reads at a glance
   instead of only after one row's disclosure is open. The shell matches the
   host's own row-tag rule: a 0.5px outlined pill at caption size, an
   annotation on the row rather than a second title. */
.omniroute-badges { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.omniroute-badge {
  flex: none; padding: 1px 6px;
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: var(--dsw-radius-xs);
  font-size: 11px; line-height: 16px;
  color: var(--dsw-alias-label-secondary);
}
/* A supported capability reads heavier and its outline firms up; an unsupported
   one stays at the host row-tag weight. Both keep the host's label-secondary as
   the floor: label-tertiary measures 3.7:1 on the light card and would drop the
   11px caption below the 4.5:1 text minimum. */
.omniroute-badge--on {
  border-color: var(--dsw-alias-border-l4);
  color: var(--dsw-alias-label-primary);
}
.omniroute-badge--off { color: var(--dsw-alias-label-secondary); }
/* \u4E00\u884C\u5728\u9009\u62E9\u5668\u91CC\u663E\u793A\u7684\u540D\u5B57\uFF1A\u5206\u7EC4\u663E\u793A\u540D\u52A0\u4E2D\u62EC\u53F7\u524D\u7F00\uFF0C\u518D\u63A5 id \u5C3E\u6BB5\u3002\u5B83\u662F\u8FD9\u4E00\u884C\u7684
   \u4E3B\u4F53\u4FE1\u606F\uFF0C\u6545\u7528\u6B21\u7EA7\u6587\u5B57\u8272\uFF0C\u6BD4\u65C1\u8FB9\u7684\u80FD\u529B\u5FBD\u6807\u66F4\u91CD\u3002 */
.omniroute-modeldisplay {
  flex: 1 1 auto; min-width: 0;
  font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary);
  font-family: var(--ds-font-family-code); word-break: break-all;
}
/* One row per discovered group in the display-name editor. */
.omniroute-grouplabel-row {
  display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  align-items: center; gap: 8px;
}
.omniroute-grouplabel-name {
  font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary);
  font-family: var(--ds-font-family-code);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
`;
var inject = [
  "slots",
  "locale",
  "connection",
  "remote",
  "remote.settings",
  "remote.credentials"
];
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS2, { zh, en }), "dsh-llm-omniroute: copy dictionaries");
  if (typeof document !== "undefined") {
    ctx.effect(() => {
      const element = document.createElement("style");
      element.textContent = SECTION_CSS;
      document.head.append(element);
      return () => {
        element.remove();
      };
    }, "dsh-llm-omniroute: section styles");
  }
  const connection = ctx.get("connection");
  const t = ctx.locale.bind(NS2);
  const fetchModelParams = (request) => connection.rpc.call("/dsh-llm-omniroute", "models-dev-params", request);
  const fetchCatalog = (request) => connection.rpc.call("/dsh-llm-omniroute", "catalog", request);
  const injected = () => ({
    fetchModelParams,
    fetchCatalog,
    api: {
      describeSettings: () => ctx.remote.settings.describe(),
      mutateSettings: (ns, ops, expectedRevision) => ctx.remote.settings.mutate(ns, ops, expectedRevision),
      describeCredentials: (refs) => ctx.remote.credentials.describe(refs),
      setCredential: (ref, value) => ctx.remote.credentials.set(ref, value)
    }
  });
  ctx.slots.inject("settings.section", () => ctx.slots.register({
    name: "settings.section",
    id: "omniroute",
    order: 15,
    label: () => t("nav"),
    locale: NS2,
    inject: injected
  }, OmniRouteSection));
}
return module.exports; } });
//# sourceMappingURL=client.js.map
