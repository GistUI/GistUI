import "@gistui/styles/styles.css";
import "@gistui/chat/chat.css";
import "./playground.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Playground } from "./Playground";

// A tab opened on an older build asks for chunks that no longer exist: reload once to get the new build.
window.addEventListener("vite:preloadError", () => {
  if (sessionStorage.getItem("gistui-reloaded")) return;
  sessionStorage.setItem("gistui-reloaded", "1");
  location.reload();
});
setTimeout(() => sessionStorage.removeItem("gistui-reloaded"), 10_000);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Playground />
  </StrictMode>,
);
