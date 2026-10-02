/**
 * Demo tools for the playground's live examples (`@query` / `@mutation`). In an app these call your
 * API or an MCP server; here they read and change an in-memory order book, with a little latency.
 */

type Order = { Order: string; Customer: string; Status: "Paid" | "Pending" | "Refunded"; Total: number; Day: string };

const customers = ["Acme Corp", "Globex", "Initech", "Umbrella", "Hooli", "Stark Ind.", "Wayne Ent.", "Wonka", "Soylent", "Tyrell"];
const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const orders: Order[] = Array.from({ length: 28 }, (_, i) => ({
  Order: `#${1040 + i}`,
  Customer: customers[(i * 7) % customers.length]!,
  Status: i % 9 === 4 ? "Refunded" : i % 4 === 1 ? "Pending" : "Paid",
  Total: Math.round(120 + ((i * 7919) % 1380)),
  Day: days[i % 7]!,
}));

const wait = (ms = 250 + Math.random() * 350) => new Promise((r) => setTimeout(r, ms));
const byStatus = (status?: string) => orders.filter((o) => !status || status === "All" || o.Status === status);

/** Read-only tools: `@query` may call these by itself while the UI renders. */
export const demoTools = {
  async list_orders({ status }: { status?: string } = {}) {
    await wait();
    return byStatus(status).map((o) => ({ ...o }));
  },
  async orders_by_day({ status }: { status?: string } = {}) {
    await wait();
    return days.map((Day) => ({ Day, Revenue: byStatus(status).filter((o) => o.Day === Day).reduce((s, o) => s + o.Total, 0) }));
  },
};

/** Tools that change something: only `@mutation`, from a click. */
export const demoMutations = {
  async refund_order({ id }: { id?: string } = {}) {
    await wait(400);
    const o = orders.find((x) => x.Order === id);
    if (!o) throw new Error(`Order ${id ?? "(none)"} not found`);
    if (o.Status === "Refunded") throw new Error(`${id} is already refunded`);
    o.Status = "Refunded";
    return { ok: true, id };
  },
};
