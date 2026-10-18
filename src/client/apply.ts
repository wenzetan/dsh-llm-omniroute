/**
 * Browser half apply: register the OmniRoute copy dictionary and, once the
 * `settings.section` declaration is on the ledger, one settings page of our
 * own. Zero dsh modifications — the section slot is `kind: 'list'`, built for
 * feature-owned pages ("adding a setting never means editing the shell").
 *
 * Seam (dsh 0.2.1): the browser half mounts as a plain cordis plugin
 * module (`inject` + `apply(ctx)`); there is no dedicated client-runtime
 * package anymore, and `ConnectionHandle.api` is gone. Data access rides the
 * typert Remote namespaces (`ctx.remote.settings` / `.credentials`, assembled
 * by `@deepseek-ai/dsh-api-remotes`) and the plugin's own host RPC channel
 * (`ctx.connection.rpc.call`). The section registers through the settings
 * shell's `settings.section` slot with the locale seat declared, so the
 * renderer supplies the bound `t`. Settings namespaces are profile entry ids on
 * this line, so the host half's entry must keep the id `dsh-llm-omniroute` (the
 * bundle patch does).
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the ctx.slots merge into this program.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the ctx.locale merge into this program.
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the settings shell's SlotMap merge (the 'settings.section' entry).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the ctx.remote merge into this program.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import { OmniRouteSection } from './OmniRouteSection.tsx'
import type { OmniRouteSectionInjected } from './OmniRouteSection.tsx'
import { en, zh } from './locale.ts'
import type { CatalogRequest, CatalogResponse, ModelsDevParamsRequest, ModelsDevParamsResponse } from './params-types.ts'

/** Copy namespace owned by this plugin. */
const NS = 'settings.omniroute'

/**
 * Section styles. The browser bundle is one JS file (the module loader serves
 * no plugin CSS), so the section injects its rules as a fiber-scoped
 * `<style>` element. Every color rides the shell's `--dsw-alias-*` design
 * tokens, which `ui-theme` redefines under `body[data-ds-dark-theme]`, so one
 * set of rules renders correctly in both themes.
 *
 * The metrics mirror what the shell's own settings sections render on this
 * host line, measured on the live page: secondary and icon buttons 28px tall
 * with an 8px radius and 12px text, text fields 28px tall with an 8px radius
 * and 13px text, a provider row card with 12px/14px padding and a 20px radius,
 * and the catalog's add affordance a full-width 44px block with a 16px radius
 * and 14px text.
 *
 * Paragraphs carry an explicit zero margin: the shell's global stylesheet
 * leaves the user-agent margins in place, so every hint or summary line would
 * otherwise sit inside a 16px gap and each block would grow past its own text.
 */
export const SECTION_CSS = `
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
/* One configured group of model entries; the heading above it is the same
   disclosure control the fetched-model picker uses. */
.omniroute-modelgroup { display: flex; flex-direction: column; gap: 10px; }
/* The group heading doubles as the disclosure control: one click folds the whole
   group, and the count stays on the heading so a folded group still reports its
   size. Both the configured list and the fetched-model picker use it. */
.omniroute-grouptoggle {
  box-sizing: border-box; width: 100%; display: flex; align-items: center;
  gap: 6px; height: 28px; padding: 0 8px 0 2px; margin: 6px 0 0;
  border: none; border-radius: 8px; background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit; font-size: 12px; line-height: 18px; font-weight: 500;
  text-align: left; cursor: pointer;
}
.omniroute-grouptoggle:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.omniroute-groupname {
  flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap;
}
.omniroute-groupcount {
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
/* 一行在选择器里显示的名字：分组显示名加中括号前缀，再接 id 尾段。它是这一行的
   主体信息，故用次级文字色，比旁边的能力徽标更重。 */
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
`

/** Required services (cordis fiber inject): the slots/locale/connection faces and the host remotes. */
export const inject = [
  'slots', 'locale', 'connection',
  'remote', 'remote.settings', 'remote.credentials',
]

/**
 * Register the Custom Provider settings section.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-llm-omniroute: copy dictionaries')

  // Fiber-scoped styles: removed with the plugin, so a reload swaps them cleanly.
  if (typeof document !== 'undefined') {
    ctx.effect(() => {
      const element = document.createElement('style')
      element.textContent = SECTION_CSS
      document.head.append(element)
      return () => { element.remove() }
    }, 'dsh-llm-omniroute: section styles')
  }

  const connection = ctx.get('connection') as ConnectionHandle
  const t = ctx.locale.bind(NS)

  // Two plain callbacks over the plugin's host RPC channel. The browser never
  // performs a cross-origin request: it names the draft endpoint/credential or
  // the ids to look up, and the host does the network work.
  const fetchModelParams = (request: ModelsDevParamsRequest) =>
    connection.rpc.call('/dsh-llm-omniroute', 'models-dev-params', request) as Promise<
      { ok: true; value: ModelsDevParamsResponse } | { ok: false; error: { message: string } }
    >
  const fetchCatalog = (request: CatalogRequest) =>
    connection.rpc.call('/dsh-llm-omniroute', 'catalog', request) as Promise<
      { ok: true; value: CatalogResponse } | { ok: false; error: { message: string } }
    >

  // The section's data face over the typert Remote namespaces: reads and
  // writes the dsh-llm-omniroute settings section and the fixed credential
  // reference. Model discovery rides the plugin's own channel, because the
  // catalog rows carry capability facts (thinking levels, the level → model-id
  // map, vision, tool calling) that the harness's discovery shape has no field
  // for.
  const injected = (): OmniRouteSectionInjected => ({
    fetchModelParams,
    fetchCatalog,
    api: {
      describeSettings: () => ctx.remote.settings.describe(),
      mutateSettings: (ns, ops, expectedRevision) =>
        ctx.remote.settings.mutate(ns, ops, expectedRevision),
      describeCredentials: (refs) => ctx.remote.credentials.describe(refs),
      setCredential: (ref, value) => ctx.remote.credentials.set(ref, value),
    },
  })

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'omniroute',
    order: 15,
    label: () => t('nav'),
    locale: NS,
    inject: injected,
  }, OmniRouteSection))
}
