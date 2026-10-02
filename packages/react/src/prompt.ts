/**
 * `@gistui/react/prompt`: the system prompt for the default library, with the catalog's descriptions,
 * design guide and example. Import it where you call the model (usually the server); the browser
 * bundle (`@gistui/react/ui`) leaves this text out. Importing it also makes `ui.prompt()` work.
 *
 *   import { prompt } from "@gistui/react/prompt";
 *   const system = prompt({ mode: "inline" }).text;
 */

import { prompt as catalogPrompt } from "@gistui/catalog";
import type { GeneratedPrompt, PromptOptions } from "@gistui/core";
import { promptSlot } from "./ui";

/** The default library's system prompt (byte-stable); the same as `prompt` in `@gistui/catalog`. */
export function prompt(opts: PromptOptions = {}): GeneratedPrompt {
  return catalogPrompt(opts);
}

promptSlot.current = prompt;
