/** Renderer parity page for `@gistui/vue` (see tests/visual/parity.spec.ts). */
import { GistUI } from "@gistui/vue";
import { createApp, defineComponent, h, onMounted } from "vue";
// The playground's examples, demo tools and page setup, shared by every parity page.
import { demoTools, paritySetup } from "../../../apps/playground/src/parity-setup";

const { example, theme, stage, ready } = paritySetup();
const Root = defineComponent(() => {
  onMounted(() => ready("vue"));
  return () => h(GistUI, { source: example.source, theme, tools: demoTools });
});
createApp(Root).mount(stage);
