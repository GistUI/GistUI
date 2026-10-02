/**
 * `@gistui/vanilla`: render streamed GistUI programs into any element, without a framework.
 *
 *   import { mount } from "@gistui/vanilla";
 *   import { ui } from "@gistui/vanilla/ui";
 *   import "@gistui/styles/styles.css";
 *
 *   const view = mount(document.querySelector("#out")!, { library: ui, source, streaming: true });
 *   view.update({ source: more });   // only the appended part is parsed
 */

export { mount, syncOptions, type GistUIMount, type MountOptions } from "./mount";
export { componentLibrary, createDomLibrary, defineDomComponent, libraryOf, type DomComponentDef } from "./library";
export { h, setAttrs, setStyle, syncChildren, str, num, cx } from "./dom";
export { formField, fieldLink, rulesOf, bindingLink, boundValue, resetLink, type FieldKind, type GistField } from "./field";
export type { Binding, ChildEntry, DomContext, DomInstance, DomLibrary, DomRenderer } from "./types";
export type { GistUIAction, FormSubmitAction } from "@gistui/headless/actions";
