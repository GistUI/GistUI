/**
 * The library object without the prompt generator: `createLibrary` supplies the generator, while the
 * default `ui` supplies the server-side prompt (`@gistui/react/prompt`), so browser bundles do not
 * carry prompt code they never run.
 */

import type { GeneratedPrompt, Library, PromptOptions } from "@gistui/core";
import type { ComponentRenderer, GistUILibrary } from "./library";

export function libraryOf(
  core: Library,
  components: Map<string, ComponentRenderer<any>>,
  examples: readonly string[],
  prompt: (opts?: PromptOptions) => GeneratedPrompt,
): GistUILibrary {
  return {
    core,
    components,
    examples,
    prompt,
    extend(renderers) {
      const next = new Map(components);
      for (const [name, r] of Object.entries(renderers)) {
        if (!core.get(name)) throw new Error(`extend: "${name}" is not a component of this library`);
        next.set(name, r);
      }
      return libraryOf(core, next, examples, prompt);
    },
  };
}
