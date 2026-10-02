/** Renderer parity page for `@gistui/solid` (see tests/visual/parity.spec.ts). */
import { GistUI } from "@gistui/solid";
import { onMount } from "solid-js";
import { render } from "solid-js/web";
// The playground's examples, demo tools and page setup, shared by every parity page.
import { demoTools, paritySetup } from "../../../apps/playground/src/parity-setup";

const { example, theme, stage, ready } = paritySetup();
render(() => {
  onMount(() => ready("solid"));
  return <GistUI source={example.source} theme={theme} tools={demoTools} />;
}, stage);
