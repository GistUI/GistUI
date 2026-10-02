import type { FormField, JsonSchema } from "./form-schema";

/**
 * Events a GistUI program sends to the host. `do:[…]` steps run in the runtime; the ones that leave
 * the UI arrive here: `send` (a message for the assistant), `open` (a link), `emit` (a custom event),
 * and `error` (a tool that is missing or failed, a blocked URL).
 */
export type GistUIAction =
  | { type: "send"; message: string; nodeId: string }
  | { type: "open"; url: string; nodeId: string }
  | { type: "emit"; event: string; payload: unknown; nodeId: string }
  | { type: "error"; code: string; message: string; nodeId: string }
  | { type: "select"; nodeId: string; value: unknown }
  | { type: "change"; nodeId: string; name: string; value: unknown }
  | FormSubmitAction;

/**
 * A Form was submitted (after validation), or a draft was saved (`partial`: empty fields allowed).
 */
export interface FormSubmitAction {
  type: "submit";
  nodeId: string;
  /** The Form's name (first argument). */
  form: string;
  /** Stable id of the form: its `id:`, or `form_` + a fingerprint of its fields. Route on this. */
  formId: string;
  /** Unique per submission (UUID v4): use it as an idempotency key. */
  submissionId: string;
  /** ISO 8601 time of the submission. */
  submittedAt: string;
  partial: boolean;
  /** Step forms: where the user was (drafts can be saved on any step). */
  step?: { index: number; count: number; title?: string | undefined } | undefined;
  /** Typed values that match `schema`: numbers, booleans, string arrays; empty optionals left out. */
  values: Record<string, unknown>;
  /** Every field: name, label, component, JSON type, input type, options, rules, step. */
  fields: FormField[];
  /** JSON Schema (draft 2020-12) for `values`. */
  schema: JsonSchema;
  /** A readable summary a chat host can send to the model as the user's reply. */
  message: string;
}
