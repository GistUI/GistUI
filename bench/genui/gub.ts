/** Paths into the pinned generative-ui-bench checkout (bench/genui/setup.sh). */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const HERE = dirname(fileURLToPath(import.meta.url));
export const GUB = process.env.GUB_DIR ?? join(HERE, "..", ".cache", "generative-ui-bench");
export const RESULTS = join(HERE, "..", "results");

if (!existsSync(join(GUB, "node_modules"))) {
  console.error(`generative-ui-bench is not set up. Run: sh bench/genui/setup.sh`);
  process.exit(1);
}

/** The six models on the openui.com headline board (one seat per company), as the bench labels them. */
export const HEADLINE = ["sol", "opus48", "kimi", "gemini", "qwen", "muse"] as const;
