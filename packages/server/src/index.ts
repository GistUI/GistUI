/**
 * `@gistui/server`: GistUI on the model side (Node, Edge, Bun, Deno, Workers).
 *
 * - `textDeltas(response, format)`: text from OpenAI-compatible, Anthropic, AI SDK, AG-UI or plain streams.
 * - `validateProgram`, `repairProgram`, `repairStream`: deterministic repair, then optional model repair
 *   of only the failing statements, appended to the stream as edits.
 * - `generatePrompt` / `merge`: re-exported from `@gistui/core` for convenience.
 */

export { readSSE, textDeltas, type SSEEvent, type StreamFormat } from "./sse";
export { blocking, repairProgram, repairStream, toReadable, validateProgram, type RepairOptions, type RepairRequest, type RepairResult } from "./repair";
import { generatePrompt as corePrompt, merge as coreMerge } from "@gistui/core";
// Re-exported as constants (the declaration bundler mishandles re-exports from another package).
export const generatePrompt: typeof corePrompt = corePrompt;
export const merge: typeof coreMerge = coreMerge;
