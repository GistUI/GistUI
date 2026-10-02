/**
 * The "model" behind the examples chat: no model is called. A thread opens with one of the recorded
 * example programs, and every button or follow-up pressed in it is answered from that example's
 * recorded follow-ups (./follows). Each answer (a sentence, then the program in a ```gistui fence) is
 * streamed at a fixed 300 tokens per second, the way a fast model would send it.
 */

import type { ChatAdapter } from "@gistui/chat";
import { EXAMPLES, type Example } from "../examples";
import { FOLLOWS, SUBMITS, type Follow } from "./follows";

export const TOKENS_PER_SECOND = 300;
/** About four characters per token. */
const CHARS_PER_SECOND = TOKENS_PER_SECOND * 4;
/** A thread stops after this many messages from the user: the opening question and nine more. */
export const MAX_TURNS = 10;

/**
 * How each example's thread opens: the question that is asked, and the sentence the reply starts
 * with before its screen. The first six are also offered on the empty page.
 */
export const QUESTIONS: { q: string; id: string; say: string }[] = [
  { q: "Show me SaaS metrics for the last 30 days", id: "saas", say: "Here are your SaaS metrics for the last 30 days." },
  { q: "Compare Meta, Microsoft, Netflix and Google in 2025", id: "stocks", say: "Here is how the four did in 2025, against the S&P 500." },
  { q: "Plan a first trip to Japan", id: "japan", say: "Here is a first trip to Japan: where to go, what to do and a 7-day route." },
  { q: "Build a checkout form", id: "checkout", say: "Here is a three-step checkout with an order summary. Every field is checked." },
  { q: "What's the weather today?", id: "weather", say: "Here is today's weather." },
  { q: "Find flights from San Francisco to Tokyo", id: "flights", say: "I found four flights from San Francisco to Tokyo." },
  { q: "Let me pick a seat on my flight", id: "seats", say: "Here is the seat map for your flight." },
  { q: "Show my boarding pass", id: "boarding", say: "Here is your boarding pass for NH 7." },
  { q: "Is my flight on time?", id: "status", say: "Here is the status of your flight." },
  { q: "How is Apple stock doing?", id: "stock", say: "Here is Apple today. Switch the range to redraw the chart." },
  { q: "Where is my order?", id: "order", say: "Your order is confirmed and on its way." },
  { q: "Schedule a meeting with the design team", id: "meeting", say: "Here is a scheduling card: a date, the time slots and who is coming." },
  { q: "Show a product page for a t-shirt", id: "product", say: "Here is a product page with colours, sizes and an add-to-bag button." },
  { q: "Who is on the design team?", id: "team", say: "Here is the design team and who is online." },
  { q: "Show product analytics for this month", id: "analytics", say: "Here is this month's product analytics." },
  { q: "Give me a quick Q3 revenue overview", id: "revenue", say: "Here is Q3 revenue across all regions." },
  { q: "Suggest hidden gems and gear for a trip", id: "gems", say: "Here are a few lesser-known places, and the gear worth packing." },
  { q: "Write a report on world population in 2026", id: "population", say: "Here is an eight-page report on world population in 2026." },
  { q: "Summarise earthquakes over the last 12 months", id: "quakes", say: "Here is a review of the last 12 months of seismic activity." },
  { q: "Write the Q3 business review as a report", id: "report", say: "Here is the Q3 business review as a five-page report." },
  { q: "Make a deck about coffee culture", id: "coffee", say: "Here is a six-slide deck on coffee culture." },
  { q: "Prepare the Q3 board deck", id: "board", say: "Here is the Q3 board update in five slides." },
  { q: "Make a slide deck about Japan", id: "japandeck", say: "Here is a six-slide deck for a first trip to Japan." },
  { q: "I want to book a demo", id: "form", say: "Here is a short form to book a demo." },
  { q: "Create a sign-up flow", id: "signup", say: "Here is a sign-up flow in three validated steps." },
  { q: "Show me every validation rule", id: "validation", say: "Here is one field for each rule. They are checked as you type." },
  { q: "What form controls are there?", id: "controls", say: "Here are the form controls in their sizes and variants." },
  { q: "Open my workspace settings", id: "settings", say: "Here are your workspace settings." },
  { q: "What's new in the latest release?", id: "content", say: "Here are the release notes." },
  { q: "Can it draw a fully custom design?", id: "custom", say: "Yes. These are built from free-form frames and styles." },
  { q: "Build a launch page with pricing", id: "launch", say: "Here is a launch page with a hero, pricing and the details." },
  { q: "Show live orders from my tools", id: "live", say: "This screen reads from your tools. Change the filter or refund an order." },
  { q: "What if the model makes mistakes?", id: "errors", say: "This answer has a misspelled component, a wrong value and a missing section. GistUI repaired it in code:" },
];

/** The question that opens an example's thread. */
export const questionFor = (id: string): string => QUESTIONS.find((q) => q.id === id)?.q ?? EXAMPLES.find((e) => e.id === id)?.title ?? id;

const byId = (id: string): Example | undefined => EXAMPLES.find((e) => e.id === id);

/** The example a reply shows, found by its program text. */
export const exampleIn = (reply: string): Example | undefined => EXAMPLES.find((e) => reply.includes(e.source));

/** What a message asks for, as the store sends it: typed text, or the wrapper around a button's text or a form's summary. */
function read(content: string): { text: string; form: boolean } {
  if (content.startsWith("[The user submitted a form in the UI]")) return { text: content.slice(content.indexOf("\n") + 1), form: true };
  const button = /^\[The user clicked a button in the UI\. Button action text: (".*")\]$/s.exec(content);
  if (button) {
    try {
      return { text: JSON.parse(button[1]!) as string, form: false };
    } catch {
      /* fall through: treat it as typed */
    }
  }
  return { text: content, form: false };
}

const fence = (program: string): string => `\`\`\`gistui\n${program}\n\`\`\``;

/** A screen as a program: the blocks in a Page, the questions still to ask under them, then the tables. */
export function screen(blocks: string[], tables: Record<string, string> = {}, more: string[] = []): string {
  const children = more.length ? [...blocks, followUps(more)] : blocks;
  return [`root = Page(${children.join(", ")})`, ...Object.entries(tables).map(([name, table]) => `${name} = ${table}`)].join("\n");
}

const callout = (text: string, title: string, rest: string): string => `Callout(${JSON.stringify(text)}, title:${JSON.stringify(title)}, ${rest})`;

/** The recorded answer in an example's thread that a message asks for. */
const followFor = (pool: Follow[], text: string): Follow | undefined => {
  const want = text.trim().toLowerCase();
  return pool.find((f) => f.q.toLowerCase() === want) ?? pool.find((f) => f.match?.test(text.trim()));
};

/** The questions of an example that are offered as suggestions, in order. */
const offered = (id: string): Follow[] => (FOLLOWS[id] ?? []).filter((f) => !f.match && !f.button);

const followUps = (questions: string[]): string => `FollowUps([${questions.map((q) => JSON.stringify(q)).join(", ")}])`;

/**
 * Questions to offer under a thread's first answer, as a program, when its screen suggests none itself
 * (a boarding pass, a report). Empty when the screen already ends in its own follow-ups.
 */
export function suggestions(reply: string): string {
  const example = exampleIn(reply);
  if (!example || example.source.includes("FollowUps(")) return "";
  // Not the ones a button on the screen already sends.
  const questions = offered(example.id).filter((f) => !example.source.includes(f.q)).slice(0, 3).map((f) => f.q);
  return questions.length ? `root = ${followUps(questions)}` : "";
}

/** The first screen of a thread: the example its opening question (or its title) asks for. */
function opening(text: string): string | undefined {
  const want = text.trim().toLowerCase();
  const id = (QUESTIONS.find((q) => q.q.toLowerCase() === want) ?? EXAMPLES.find((e) => e.title.toLowerCase() === want))?.id;
  const example = id ? byId(id) : undefined;
  if (!example) return undefined;
  const say = QUESTIONS.find((q) => q.id === id)?.say ?? `Here is ${example.title.toLowerCase()}: ${example.description.toLowerCase()}.`;
  return `${say}\n\n${fence(example.source)}`;
}

/**
 * The reply to the newest message of a thread. `asked` are the thread's messages from the user, oldest
 * first, and `home` is the example its first answer showed. A message after the first is answered
 * from that example's recorded follow-ups, and each answer offers the ones not asked yet.
 */
function answer(asked: string[], home: string | undefined): string {
  const said = asked.map(read);
  const now = said[said.length - 1] ?? { text: "", form: false };
  if (!home) {
    return opening(now.text) ?? fence(screen([callout("This page only has recorded answers. Pick an example on the left.", "No recorded answer", "tone:info")]));
  }
  if (asked.length > MAX_TURNS) {
    return fence(screen([callout(`This thread stops at ${MAX_TURNS} messages. Press Replay to start it again, or pick another example.`, "End of this example", "tone:neutral")]));
  }
  const pool = FOLLOWS[home] ?? [];
  const done = new Set(said.map((m) => (m.form ? undefined : followFor(pool, m.text))));
  // What to offer next: up to three questions of this example that the thread has not had, none on the last turn.
  const more = asked.length >= MAX_TURNS ? [] : offered(home).filter((f) => !done.has(f)).slice(0, 3).map((f) => f.q);
  if (now.form) {
    const name = /^Submitted "([^"]*)"/.exec(now.text)?.[1] ?? "";
    const sent = SUBMITS[name] ?? { say: "Received.", title: "Form submitted", text: "The form was valid, so it was sent. In your app, this is where you save it.", icon: "check-circle" };
    return `${sent.say}\n\n${fence(screen([callout(sent.text, sent.title, `tone:success, icon:${sent.icon}`)], {}, more))}`;
  }
  const follow = followFor(pool, now.text);
  if (follow) return `${follow.say}\n\n${fence(screen(follow.ui, follow.tables, more))}`;
  // Nothing recorded fits: say what happened instead of showing an unrelated screen.
  const note = `That sent "${now.text.trim()}" as the next message. In your app, the model answers it with the next screen.`;
  return fence(screen([callout(note, "Sent to the model", "tone:info")], {}, more));
}

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const recorded: ChatAdapter = async function* ({ messages, signal }) {
  const first = messages.find((m) => m.role === "assistant");
  const text = answer(
    messages.flatMap((m) => (m.role === "user" ? [m.content] : [])),
    first ? exampleIn(first.content)?.id : undefined,
  );
  // A short wait before the first token, as with a real request.
  await pause(260);
  let sent = 0;
  let last = performance.now();
  while (sent < text.length && !signal.aborted) {
    await pause(16);
    const now = performance.now();
    const n = Math.max(1, Math.round(((now - last) / 1000) * CHARS_PER_SECOND));
    last = now;
    yield text.slice(sent, sent + n);
    sent += n;
  }
};
