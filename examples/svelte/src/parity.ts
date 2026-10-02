/** Renderer parity page for `@gistui/svelte` (see tests/visual/parity.spec.ts). */
import { mount } from "svelte";
import Parity from "./Parity.svelte";
// The playground's examples, demo tools and page setup, shared by every parity page.
import { demoTools, paritySetup } from "../../../apps/playground/src/parity-setup";

const { example, theme, stage, ready } = paritySetup();
mount(Parity, { target: stage, props: { source: example.source, theme, tools: demoTools, onready: () => ready("svelte") } });
