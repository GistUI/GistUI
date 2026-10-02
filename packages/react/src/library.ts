/**
 * React component libraries: a core `Library` (schemas, for parsing and the prompt) plus a React
 * renderer per component. Schemas come from the shared catalog, from plain `PropSpec`s, or from any
 * Standard JSON Schema (Zod 4, Valibot, ArkType), so the prompt and props are the same everywhere.
 */

import {
  defineLibrary,
  generatePrompt,
  propsFromJSONSchema,
  type ComponentSpec,
  type GeneratedPrompt,
  type GistUINode,
  type JSONSchema,
  type Library,
  type NodeRef,
  type PromptOptions,
  type PropSpec,
} from "@gistui/core";
import type { ComponentType, ReactNode } from "react";
import { libraryOf } from "./library-base";

/** What every component renderer receives. */
export interface ComponentProps<P = Record<string, unknown>> {
  node: GistUINode;
  /** Resolved props. Component-valued props are `NodeRef`s: render them with `renderNode`. */
  props: P;
  /** The rendered children. */
  children: ReactNode;
  childIds: readonly string[];
  renderNode: (ref: NodeRef | string | null | undefined) => ReactNode;
}

export type ComponentRenderer<P = Record<string, unknown>> = ComponentType<ComponentProps<P>>;

export interface ComponentDef {
  spec: ComponentSpec;
  component: ComponentRenderer<any>;
}

/** A Standard JSON Schema (e.g. a Zod 4 object schema). */
interface StandardJSONSchema {
  "~standard": { jsonSchema: { input: (opts: { target: string }) => unknown } };
}

export interface DefineComponentInput<P> extends Omit<ComponentSpec, "props"> {
  /** Plain prop specs, or a Standard JSON Schema such as `z.object({...})`. */
  props: Readonly<Record<string, PropSpec>> | StandardJSONSchema;
  component: ComponentRenderer<P>;
}

export function defineComponent<P = Record<string, unknown>>(input: DefineComponentInput<P>): ComponentDef {
  const { component, props, ...rest } = input;
  const specProps = isStandardJSONSchema(props)
    ? propsFromJSONSchema(props["~standard"].jsonSchema.input({ target: "draft-2020-12" }) as JSONSchema)
    : props;
  return { spec: { ...rest, props: specProps }, component: component as ComponentRenderer<any> };
}

function isStandardJSONSchema(v: unknown): v is StandardJSONSchema {
  return typeof v === "object" && v !== null && "~standard" in v && typeof (v as StandardJSONSchema)["~standard"]?.jsonSchema?.input === "function";
}

export interface GistUILibrary {
  core: Library;
  components: ReadonlyMap<string, ComponentRenderer<any>>;
  examples: readonly string[];
  /** The system prompt for this library (byte-stable). */
  prompt(opts?: PromptOptions): GeneratedPrompt;
  /** Swaps renderers and keeps every schema, so the prompt and props do not change (§6.2, layer 4). */
  extend(renderers: Readonly<Record<string, ComponentRenderer<any>>>): GistUILibrary;
}

export interface CreateLibraryInput {
  components: readonly ComponentDef[];
  unions?: Readonly<Record<string, readonly string[]>>;
  examples?: readonly string[];
  /** Design guidance included in the prompt (see `PromptOptions.guide`). */
  guide?: string;
  /**
   * Builds the system prompt instead of the default generator, for a library whose prompt text is
   * kept out of the browser bundle (the default `ui` does this; see `@gistui/react/prompt`).
   */
  prompt?: (opts?: PromptOptions) => GeneratedPrompt;
}

export function createLibrary(input: CreateLibraryInput): GistUILibrary {
  const core = defineLibrary({ components: input.components.map((c) => c.spec), unions: input.unions ?? {} });
  const components = new Map(input.components.map((c) => [c.spec.name, c.component]));
  const examples = input.examples ?? [];
  const prompt =
    input.prompt ??
    ((opts: PromptOptions = {}) => generatePrompt(core, { libraryExamples: examples, examples: "one", ...(input.guide ? { libraryGuide: input.guide } : {}), ...opts }));
  return libraryOf(core, components, examples, prompt);
}

