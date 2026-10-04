import "@openuidev/react-ui/styles/index.css";
import { Renderer } from "@openuidev/react-lang";
import { ThemeProvider } from "@openuidev/react-ui";
import { openuiLibrary } from "@openuidev/react-ui/genui-lib";

/** OpenUI's documented setup: <Renderer> with its default component library, in its theme provider. */
export function View({ text, streaming }: { text: string; streaming: boolean }) {
  return (
    <ThemeProvider mode="light">
      <Renderer response={text} isStreaming={streaming} library={openuiLibrary} />
    </ThemeProvider>
  );
}
