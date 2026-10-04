import "@gistui/styles/styles.css";
import { GistUI } from "@gistui/react";
import { ui } from "@gistui/react/ui";

/** GistUI's documented setup: <GistUI> with its default component library. */
export function View({ text, streaming }: { text: string; streaming: boolean }) {
  return <GistUI library={ui} source={text} streaming={streaming} theme="light" />;
}
