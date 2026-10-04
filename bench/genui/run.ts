/**
 * Live GistUI generations for generative-ui-bench, under the benchmark's exact condition: same
 * briefs, same providers and request bodies as its run.ts (temperature 0.7, minimal/no reasoning,
 * 16,384-token ceiling, 4 repeats). Raws go to bench/genui/raw/<label>/gistui__<brief>__r<n>.txt;
 * existing raws are never regenerated, so an interrupted run resumes.
 *
 *   BENCH_MODEL=google/gemini-3.7-flash BENCH_LABEL=gemini37 OPENROUTER_API_KEY=… bun bench/genui/run.ts
 *
 * Use the label of a model already in the bench to compare against its committed OpenUI / A2UI /
 * json-render runs; score with bench/genui/score.ts.
 * The label must be the bench's label for that exact model (gemini37 = google/gemini-3.7-flash,
 * gemini = google/gemini-3.6-flash; see the bench README), or the comparison mixes models. A version
 * tag keeps a new run apart from earlier raws: BENCH_LABEL=gemini37@v2 (scored against gemini37).
 * Vercel AI Gateway: BENCH_PROVIDER=vercel AI_GATEWAY_API_KEY=… BENCH_MODEL=google/gemini-3.7-flash.
 * Real usage per run (prompt, output and hidden reasoning tokens, and the gateway's cost when it
 * reports one) is written to raw/<label>/usage.json. Probe first: BENCH_ONLY=b1-invoice BENCH_REPEATS=1.
 * Env: BENCH_PROVIDER openrouter|vercel|openai|anthropic|google|local, BENCH_REPEATS, BENCH_MAX_TOKENS,
 * BENCH_CONCURRENCY, BENCH_TIMEOUT_MS, BENCH_TEMP, BENCH_ONLY, BENCH_REASONING_EFFORT,
 * BENCH_FORMAT gistui (default) | openui: openui writes the bench's own OpenUI answers, with its own prompt,
 * to the bench's raw/<label>, for models the bench has no answers for (score them with its score.ts).
 * BENCH_RPM: requests per minute, when the provider limits it: requests start at most that often, and a
 * rate-limited request waits the time the provider asks for and is sent again. The limit is per team, so
 * run one process at a time under it. BENCH_GATEWAY_PROVIDERS=azure,openai (Vercel only): the gateway's
 * free tier limits each provider of a model separately (5 a minute each), so each request is pinned to
 * one of these providers and BENCH_RPM applies to each of them.
 * BENCH_PROVIDER_ORDER, BENCH_BUDGET_USD (hard stop on billed cost, OpenRouter/gateways that report it). Keys: OPENROUTER_API_KEY / AI_GATEWAY_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY / GEMINI_KEY.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GUB, HERE } from "./gub";
import { systemPrompt, userPrompt } from "./prompt";

type Brief = { name: string; prompt: string };
const { SCENARIOS } = (await import(join(GUB, "briefs/briefs.ts"))) as { SCENARIOS: Brief[] };

const MODEL = process.env.BENCH_MODEL;
const LABEL = process.env.BENCH_LABEL;
if (!MODEL || !LABEL) {
  console.error("BENCH_MODEL and BENCH_LABEL are required");
  process.exit(1);
}

const FORMAT = process.env.BENCH_FORMAT || "gistui";
if (FORMAT !== "gistui" && FORMAT !== "openui") {
  console.error("BENCH_FORMAT must be gistui or openui");
  process.exit(1);
}
const PROVIDER = process.env.BENCH_PROVIDER || "openrouter";
const API_URL =
  PROVIDER === "openai"
    ? "https://api.openai.com/v1/chat/completions"
    : PROVIDER === "anthropic"
      ? "https://api.anthropic.com/v1/messages"
      : PROVIDER === "google"
        ? "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
        : PROVIDER === "local"
          ? (process.env.LOCAL_API_URL ?? "http://localhost:8081") + "/v1/chat/completions"
          : PROVIDER === "vercel"
            ? "https://ai-gateway.vercel.sh/v1/chat/completions"
            : "https://openrouter.ai/api/v1/chat/completions";
const KEY_ENV =
  PROVIDER === "vercel" ? "AI_GATEWAY_API_KEY" : PROVIDER === "openai" ? "OPENAI_API_KEY" : PROVIDER === "anthropic" ? "ANTHROPIC_API_KEY" : PROVIDER === "google" ? "GEMINI_KEY" : PROVIDER === "local" ? "LOCAL_API_KEY" : "OPENROUTER_API_KEY";
const API_KEY = process.env[KEY_ENV] ?? (PROVIDER === "local" ? "local" : "");
if (!API_KEY) {
  console.error(`${KEY_ENV} not set`);
  process.exit(1);
}

// Same reasoning defaults per family as the bench (minimal/none reasoning).
const REASONING = MODEL.includes("gemini")
  ? { effort: "minimal" }
  : MODEL.includes("claude")
    ? { enabled: false }
    : MODEL.includes("gpt-") || MODEL.includes("qwen") || MODEL.includes("kimi")
      ? { effort: "minimal" }
      : undefined;
const REASONING_OVERRIDE = process.env.BENCH_REASONING_EFFORT && process.env.BENCH_REASONING_EFFORT !== "none" ? { effort: process.env.BENCH_REASONING_EFFORT } : null;
const PROVIDER_ORDER = process.env.BENCH_PROVIDER_ORDER?.split(",").map((s) => s.trim());
const MAX_TOKENS = Number(process.env.BENCH_MAX_TOKENS) || 16384;
const REPEATS = Number(process.env.BENCH_REPEATS) || 4;
const CONCURRENCY = Number(process.env.BENCH_CONCURRENCY) || 6;
const RPM = Number(process.env.BENCH_RPM) || 0;
// Requests start at least 60/RPM seconds apart (retries included), so the provider's per-minute limit holds.
const GATEWAY_PROVIDERS = PROVIDER === "vercel" ? (process.env.BENCH_GATEWAY_PROVIDERS?.split(",").map((s) => s.trim()).filter(Boolean) ?? []) : [];
// Next allowed start per provider ("" when requests are not pinned to a provider).
const nextStart = new Map<string, number>((GATEWAY_PROVIDERS.length ? GATEWAY_PROVIDERS : [""]).map((p) => [p, 0]));
/** Picks the provider with the earliest free slot, reserves the slot and waits for it. */
async function paced(): Promise<string> {
  const [p, at] = [...nextStart].reduce((a, b) => (b[1] < a[1] ? b : a));
  if (!RPM) return p;
  nextStart.set(p, Math.max(Date.now(), at) + 60000 / RPM);
  const wait = at - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  return p;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ONLY = process.env.BENCH_ONLY?.split(",").map((s) => s.trim());
const BRIEFS = ONLY ? SCENARIOS.filter((s) => ONLY.includes(s.name)) : SCENARIOS;

type Usage = { input?: number; output?: number; reasoning?: number; cost?: number; provider?: string };

// When the gateway reports no cost (Vercel AI Gateway), it is computed from the tokens used and the
// model's list price from the gateway's model list, so BENCH_BUDGET_USD still holds. Cached input is
// priced as full input, so the estimate errs high.
const PRICE: { input: number; output: number } | undefined =
  PROVIDER === "vercel"
    ? await fetch("https://ai-gateway.vercel.sh/v1/models")
        .then((r) => r.json() as Promise<{ data: { id: string; pricing?: { input?: string; output?: string } }[] }>)
        .then((j) => j.data.find((m) => m.id === MODEL)?.pricing)
        .then((p) => (p?.input && p.output ? { input: Number(p.input), output: Number(p.output) } : undefined))
    : undefined;
if (PROVIDER === "vercel" && !PRICE) {
  console.error(`no price for ${MODEL} in the gateway's model list; check the model id`);
  process.exit(1);
}
function priced(u: { prompt_tokens?: number; completion_tokens?: number }): number | undefined {
  if (!PRICE || u.prompt_tokens === undefined || u.completion_tokens === undefined) return undefined;
  return u.prompt_tokens * PRICE.input + u.completion_tokens * PRICE.output;
}
async function generate(systemText: string, userText: string): Promise<{ text: string; truncated: boolean; usage: Usage }> {
  const body =
    PROVIDER === "anthropic"
      ? { model: MODEL, max_tokens: MAX_TOKENS, system: systemText, messages: [{ role: "user", content: userText }] }
      : {
          model: MODEL,
          ...(PROVIDER === "openai" && process.env.BENCH_REASONING_EFFORT && process.env.BENCH_REASONING_EFFORT !== "none" ? {} : { temperature: Number(process.env.BENCH_TEMP) || 0.7 }),
          ...(PROVIDER === "openai"
            ? { max_completion_tokens: MAX_TOKENS, reasoning_effort: process.env.BENCH_REASONING_EFFORT || "none" }
            : {
                max_tokens: MAX_TOKENS,
                ...((REASONING_OVERRIDE ?? REASONING) ? { reasoning: REASONING_OVERRIDE ?? REASONING } : {}),
                ...(PROVIDER_ORDER ? { provider: { order: PROVIDER_ORDER, allow_fallbacks: true } } : {}),
                // OpenRouter reports the billed cost with usage accounting on.
                ...(PROVIDER === "openrouter" ? { usage: { include: true } } : {}),
              }),
          messages: [
            { role: "system", content: systemText },
            { role: "user", content: userText },
          ],
        };
  const headers: Record<string, string> =
    PROVIDER === "anthropic"
      ? { "x-api-key": API_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" }
      : { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };
  for (let attempt = 0, limited = 0; ; attempt++) {
    let res: Response;
    const pinned = await paced();
    if (pinned) (body as Record<string, unknown>).providerOptions = { gateway: { only: [pinned] } };
    try {
      res = await fetch(API_URL, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(Number(process.env.BENCH_TIMEOUT_MS) || 240000) });
    } catch (e) {
      if (attempt === 3) throw e;
      await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
      continue;
    }
    const json = (await res.json().catch(() => ({}))) as any;
    const message: string = json?.error?.message ?? "";
    if ((res.status === 429 || /rate limit/i.test(message)) && limited < 20) {
      // Rate limited: wait as long as the provider asks (Retry-After, or "Retry after 60s"), then resend.
      // This does not count as a failed attempt.
      const after = Number(res.headers.get("retry-after")) || Number(/retry after (\d+)\s*s/i.exec(message)?.[1]) || 60;
      limited++;
      attempt--;
      console.log(`  rate limited; waiting ${after}s`);
      // Hold every other request to this provider back too, so they do not hit the same limit.
      nextStart.set(pinned, Math.max(nextStart.get(pinned) ?? 0, Date.now() + after * 1000));
      await sleep(after * 1000);
      continue;
    }
    if (!res.ok || json?.error) {
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 8000 * (attempt + 1)));
        continue;
      }
      throw new Error(json?.error?.message || `HTTP ${res.status}`);
    }
    if (PROVIDER === "anthropic") {
      return {
        text: json.content?.map((c: { text?: string }) => c.text ?? "").join("") ?? "",
        truncated: json.stop_reason === "max_tokens",
        usage: { input: json.usage?.input_tokens, output: json.usage?.output_tokens },
      };
    }
    const u = json.usage ?? {};
    // The provider that actually served it, as the Vercel gateway reports it.
    const served: string | undefined = json.choices[0]?.message?.provider_metadata?.gateway?.routing?.finalProvider ?? (pinned || undefined);
    return {
      text: json.choices[0]?.message?.content ?? "",
      truncated: json.choices[0]?.finish_reason === "length",
      usage: {
        input: u.prompt_tokens,
        output: u.completion_tokens,
        reasoning: u.completion_tokens_details?.reasoning_tokens ?? u.reasoning_tokens,
        cost: typeof u.cost === "number" ? u.cost : priced(u),
        ...(served ? { provider: served } : {}),
      },
    };
  }
}

const dir = FORMAT === "openui" ? join(GUB, "raw", LABEL) : join(HERE, "raw", LABEL);
mkdirSync(dir, { recursive: true });
function markTruncated(id: string) {
  const path = join(dir, "truncated.json");
  const list: string[] = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : [];
  if (!list.includes(id)) writeFileSync(path, JSON.stringify([...list, id].sort(), null, 1));
}

const usagePath = join(dir, "usage.json");
const usage: Record<string, Usage> = existsSync(usagePath) ? JSON.parse(readFileSync(usagePath, "utf8")) : {};
const saveUsage = () => writeFileSync(usagePath, JSON.stringify(usage, null, 1));

// BENCH_BUDGET_USD: a hard stop on billed cost for this label (earlier runs included). The first
// request runs alone to learn the price; after that a request starts only if the spend so far plus
// every in-flight request at 1.5× the dearest one seen still fits. Needs the gateway's cost report.
const BUDGET = Number(process.env.BENCH_BUDGET_USD) || 0;
let spent = Object.values(usage).reduce((s, x) => s + (x.cost ?? 0), 0);
let dearest = Math.max(0, ...Object.values(usage).map((x) => x.cost ?? 0));
// Whether a price has been seen (a free model reports $0; after that, requests run in parallel).
let pricedSeen = Object.values(usage).some((x) => x.cost !== undefined);
let inFlight = 0;
let stopped: string | null = null;
const fits = () => !BUDGET || (!pricedSeen ? inFlight === 0 && spent < BUDGET : spent + (inFlight + 1) * dearest * 1.5 <= BUDGET);

const system =
  FORMAT === "openui" ? ((await import(join(GUB, "protocols/openui/prompt.ts"))) as { systemPrompt: () => string }).systemPrompt() : systemPrompt();
// One label = one prompt. The prompt is saved with the raws; a label whose raws came from another
// prompt (or an unrecorded one) is refused, so two prompts never mix in one result.
const promptPath = join(dir, FORMAT === "openui" ? "openui-prompt.txt" : "prompt.txt");
const hasRaws = readdirSync(dir).some((f) => f.startsWith(`${FORMAT}__`));
if (existsSync(promptPath) ? readFileSync(promptPath, "utf8") !== system : hasRaws) {
  console.error(`raw/${LABEL} was generated with a different prompt; run under a new tag, e.g. BENCH_LABEL=${LABEL.split("@")[0]}@v2`);
  process.exit(1);
}
writeFileSync(promptPath, system);
console.log(`${FORMAT}: system prompt ${system.length} chars, model ${MODEL} via ${PROVIDER}${BUDGET ? `, budget $${BUDGET.toFixed(2)} ($${spent.toFixed(4)} spent)` : ""}`);
const tasks = BRIEFS.flatMap((brief) => Array.from({ length: REPEATS }, (_, i) => ({ brief, r: i + 1 })));
const total = tasks.length;
let done = 0;
async function worker() {
  for (;;) {
    if (stopped) return;
    const t = tasks.shift();
    if (!t) return;
    const id = `${FORMAT}__${t.brief.name}__r${t.r}`;
    const file = join(dir, `${id}.txt`);
    const n = ++done;
    if (existsSync(file) && readFileSync(file, "utf8").trim().length > 0) continue;
    while (!fits()) {
      if (inFlight === 0) stopped ??= `budget reached: $${spent.toFixed(4)} of $${BUDGET.toFixed(2)}`;
      if (stopped) return;
      await new Promise((r) => setTimeout(r, 200));
    }
    inFlight++;
    try {
      const gen = await generate(system, userPrompt(t.brief));
      writeFileSync(file, gen.text);
      if (gen.truncated) markTruncated(id);
      usage[id] = gen.usage;
      saveUsage();
      if (gen.usage.cost !== undefined) {
        spent += gen.usage.cost;
        dearest = Math.max(dearest, gen.usage.cost);
        pricedSeen = true;
      } else if (BUDGET) stopped ??= "the gateway reported no cost, so the budget cannot be enforced";
      const r = (gen.usage.reasoning ? `, ${gen.usage.reasoning} reasoning tokens` : "") + (gen.usage.provider ? `, ${gen.usage.provider}` : "");
      console.log(`[${n}/${total}] ${id} ${gen.text.length} chars${gen.truncated ? " (truncated)" : ""}${r}${gen.usage.cost !== undefined ? `, $${gen.usage.cost.toFixed(4)}` : ""}`);
    } catch (e) {
      console.log(`[${n}/${total}] ${id} ERROR ${(e as Error).message}`);
    } finally {
      inFlight--;
    }
  }
}
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tasks.length) }, worker));
const u = Object.values(usage);
const sum = (k: keyof Usage) => u.reduce((s, x) => s + (x[k] ?? 0), 0);
console.log(`usage: ${sum("input")} input, ${sum("output")} output (${sum("reasoning")} reasoning) tokens${u.some((x) => x.cost !== undefined) ? `, $${sum("cost").toFixed(2)} billed` : ""}`);
if (stopped) console.log(`stopped early (${stopped}); re-run the same command with a higher BENCH_BUDGET_USD to continue.`);
console.log(FORMAT === "openui" ? `done. score with: (cd ${GUB} && node score.ts ${LABEL})` : `done. score with: bun bench/genui/score.ts ${LABEL}`);
