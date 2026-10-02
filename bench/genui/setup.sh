#!/usr/bin/env sh
# Fetches thesysdev/generative-ui-bench (the benchmark behind openui.com/benchmarks) at a pinned
# commit into bench/.cache, and installs its dependencies (OpenUI lang-core 0.2.16, json-render,
# A2UI web core, tiktoken). Our GistUI adapter imports its briefs, catalog, prompts and raws.
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)/.cache/generative-ui-bench"
COMMIT=fcca05af68dc3acc5b04660531509b4aed861c7e
if [ ! -d "$DIR/.git" ]; then
  git clone https://github.com/thesysdev/generative-ui-bench "$DIR"
fi
git -C "$DIR" fetch --depth 1 origin "$COMMIT" 2>/dev/null || true
git -C "$DIR" checkout -q "$COMMIT"
(cd "$DIR" && npm install --no-audit --no-fund)
echo "generative-ui-bench ready at $DIR ($COMMIT)"

# OpenUI's own in-repo token benchmark (Tier A): only its benchmarks/ folder, at the analysed commit.
OUI="$(cd "$(dirname "$0")/.." && pwd)/.cache/openui"
OUI_COMMIT=17be4966d31ac92b86a9670feeac5c48d08c1277
if [ ! -d "$OUI/.git" ]; then
  git clone --filter=blob:none --no-checkout https://github.com/thesysdev/openui "$OUI"
  git -C "$OUI" sparse-checkout set benchmarks
fi
git -C "$OUI" checkout -q "$OUI_COMMIT"
echo "openui benchmarks ready at $OUI/benchmarks ($OUI_COMMIT)"
