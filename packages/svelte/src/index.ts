/**
 * `@gistui/svelte`: GistUI for Svelte 5 (and SvelteKit).
 *
 *   <script>
 *     import { GistUI } from "@gistui/svelte";
 *     import "@gistui/styles/styles.css";
 *   </script>
 *   <GistUI source={answer} streaming={loading} onaction={handle} />
 *
 * The default components are built in. Replace any of them with your own Svelte component: it gets
 * `props`, `node` and `ctx`, and `<GistChildren />` places its children.
 *
 *   <GistUI source={answer} components={{ Card: MyCard }} />
 */

export { default as GistUI } from "./GistUI.svelte";
export { default as GistChildren } from "./GistChildren.svelte";
export { gistui, withRenderers, type GistUIOptions } from "./action";
export { gistField, svelteComponents, svelteRenderer, type GistUIComponentProps } from "./bridge.svelte";
export { ui } from "@gistui/vanilla/ui";
export type { DomContext, DomLibrary, DomRenderer, FieldKind, GistField, GistUIAction } from "@gistui/vanilla";
