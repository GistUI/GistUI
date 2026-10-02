/** Table: sorting, search, paging and tag chips. Its own chunk; most tables arrive late in a stream. */

import { columnValues, displayCell, filterTable, nextSort, normalizeTable, pageList, tablePageSize, tableView, type TableSort } from "@gistui/headless";
import { useId, useMemo, useState, type ReactNode } from "react";
import { useIsStreaming } from "../context";
import { num, str } from "../hooks";
import type { ComponentProps } from "../library";
import { trendOf } from "./content";
import { asData, Waiting } from "./data";
import { IconSvg } from "./icon";
import { ScrollArea } from "./scroll";

/** A cell with more text than this may wrap; shorter cells stay on one line (a name, a date). */
const WRAP_FROM = 32;

const names = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === "string" ? [v] : []);

/**
 * Tone for a tag cell: from its meaning when it reads like a status ("Healthy", "At risk", "Watch"),
 * otherwise a stable tone per distinct value.
 */
const TAG_TONES = ["info", "accent", "neutral", "success", "warning", "danger"] as const;
const MEANING: [RegExp, string][] = [
  [/^(none|n\/a|no|off|inactive|draft|unknown|-)$/i, "neutral"],
  [/(at risk|risk|critical|fail|error|down|declin|shrink|loss|late|blocked|overdue|tsunami|severe|high)/i, "danger"],
  [/(watch|warn|pending|review|stable|medium|moderate|paused|delay|partial)/i, "warning"],
  [/(healthy|growing|grow|up|active|done|complete|success|ok|on track|live|paid|low|yes|approved)/i, "success"],
];
function toneFor(value: string, all: readonly string[]): string {
  for (const [re, tone] of MEANING) if (re.test(value.trim())) return tone;
  const i = all.indexOf(value);
  return TAG_TONES[(i < 0 ? 0 : i) % TAG_TONES.length]!;
}

export function Table({ props }: ComponentProps): ReactNode {
  const streaming = useIsStreaming();
  const data = asData(props.data);
  const searchId = useId();
  const searchable = props.search === true;
  const base0 = useMemo(() => normalizeTable(data), [data]);
  const findCol = (name: string) => base0.columns.findIndex((c) => c.name.toLowerCase() === name.trim().toLowerCase());
  // Sorting: `sort` makes every column sortable, `sortable:[…]` only the named ones; `order:"-WAU"` sorts first.
  const sortCols = new Set(props.sort === true ? base0.columns.map((_, i) => i) : names(props.sortable).map(findCol).filter((i) => i >= 0));
  const order = str(props.order);
  // Derived, not state seeded at mount: a streamed table mounts before its data (and columns) arrive.
  const ordered = useMemo<TableSort | null>(() => {
    if (!order) return null;
    const desc = order.startsWith("-");
    const col = findCol(desc ? order.slice(1) : order);
    return col >= 0 ? { column: col, dir: desc ? "desc" : "asc" } : null;
    // `findCol` reads `base0`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, base0]);
  // The user's sort, once they pick one (null: unsorted); until then the program's `order`.
  const [userSort, setUserSort] = useState<TableSort | null | undefined>(undefined);
  const sort = userSort === undefined ? ordered : userSort;
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<ReadonlyMap<number, ReadonlySet<string>>>(new Map());

  const base = base0;
  const colIndex = (name: string) => base.columns.findIndex((c) => c.name.toLowerCase() === name.toLowerCase());
  const filterCols = names(props.filter).map(colIndex).filter((i) => i >= 0);
  const tagCols = new Set(names(props.tags).map(colIndex).filter((i) => i >= 0));
  const filtered = useMemo(() => filterTable(base, { query, columns: picked }), [base, query, picked]);
  const rowCount = filtered.rows.length;
  // One rule for every renderer (see `tablePageSize`): at most 200 rows on a page.
  const pageSize = tablePageSize(num(props.pageSize), base.rows.length);
  const view = useMemo(() => tableView(filtered, { sort, page, pageSize }), [filtered, sort, page, pageSize]);
  const tagValues = useMemo(() => new Map([...tagCols].map((c) => [c, columnValues(base, c).map((v) => v.value)])), [base, props.tags]);

  if (!base.columns.length) {
    if (streaming && !data) return <Waiting expected="Table" />;
    return <div className="gistui-table gistui-table__empty" data-gistui="Table">No data</div>;
  }

  const toggle = (col: number, value: string) => {
    setPage(0);
    setPicked((m) => {
      const next = new Map(m);
      const set = new Set(next.get(col) ?? []);
      if (set.has(value)) set.delete(value);
      else set.add(value);
      next.set(col, set);
      return next;
    });
  };

  return (
    <div className="gistui-table" data-gistui="Table" data-striped={props.striped === true || undefined}>
      {(searchable || filterCols.length > 0) && (
        <div className="gistui-table__toolbar">
          {searchable && (
            <label className="gistui-table__search" htmlFor={searchId}>
              <IconSvg name="search" />
              <span className="gistui-sr-only">Search</span>
              <input
                id={searchId}
                className="gistui-input"
                type="search"
                placeholder="Search…"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(0);
                }}
              />
            </label>
          )}
          {filterCols.map((c) => (
            <ScrollArea key={c} arrows="none" className="gistui-table__chips-wrap" viewClassName="gistui-table__chips" viewProps={{ role: "group", "aria-label": `Filter by ${base.columns[c]!.name}` }}>
              <span className="gistui-table__filter-label">{base.columns[c]!.name}</span>
              {columnValues(base, c).slice(0, 8).map(({ value, count }) => {
                const on = picked.get(c)?.has(value) ?? false;
                return (
                  <button key={value} type="button" className="gistui-chip" aria-pressed={on} onClick={() => toggle(c, value)}>
                    {value}
                    <span className="gistui-chip__count">{count}</span>
                  </button>
                );
              })}
            </ScrollArea>
          ))}
        </div>
      )}
      <ScrollArea viewClassName="gistui-table__scroll">
        <table>
          <thead>
            <tr>
              {view.columns.map((c) => (
                <th key={c.index} data-align={c.align} aria-sort={c.sort === "asc" ? "ascending" : c.sort === "desc" ? "descending" : undefined}>
                  {sortCols.has(c.index) ? (
                    <button type="button" className="gistui-table__sort" data-sort={c.sort ?? undefined} onClick={() => setUserSort(nextSort(sort, c.index))}>

                      {c.name}
                      <IconSvg name={c.sort ? "arrow-up" : "chevrons-up-down"} />
                    </button>
                  ) : (
                    c.name
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody key={`${page}:${query}:${sort?.column}:${sort?.dir}`}>
            {view.rows.map((r) => (
              <tr key={r.index}>
                {view.columns.map((c) => {
                  const text = displayCell(r.text[c.index] ?? "", c);
                  if (tagCols.has(c.index) && text) {
                    return (
                      <td key={c.index} data-align={c.align}>
                        <span className="gistui-tag" data-tone={toneFor(text, tagValues.get(c.index) ?? [])}>
                          {text}
                        </span>
                      </td>
                    );
                  }
                  return (
                    <td key={c.index} data-align={c.align} data-trend={c.index > 0 ? trendOf(text) : undefined} data-wrap={text.length > WRAP_FROM ? "" : undefined}>
                      {text}
                    </td>
                  );
                })}
              </tr>
            ))}
            {!view.rows.length && (
              <tr>
                <td colSpan={view.columns.length} className="gistui-table__empty">
                  No matching rows
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </ScrollArea>
      {view.pageCount > 1 && (
        <div className="gistui-table__pager">
          <span>
            {view.page * pageSize + 1}–{Math.min(view.total, (view.page + 1) * pageSize)} of {view.total}
            {rowCount !== base.rows.length && ` (filtered from ${base.rows.length})`}
          </span>
          <nav className="gistui-table__pages" aria-label="Pages">
            <button type="button" className="gistui-page-btn" aria-label="Previous page" disabled={view.page === 0} onClick={() => setPage(view.page - 1)}>
              <IconSvg name="chevron-left" />
            </button>
            {pageList(view.page, view.pageCount).map((p, i) =>
              p === null ? (
                <span key={`gap${i}`} className="gistui-page-btn" aria-hidden>
                  …
                </span>
              ) : (
                <button key={p} type="button" className="gistui-page-btn" aria-current={p === view.page ? "page" : undefined} onClick={() => setPage(p)}>
                  {p + 1}
                </button>
              ),
            )}
            <button type="button" className="gistui-page-btn" aria-label="Next page" disabled={view.page >= view.pageCount - 1} onClick={() => setPage(view.page + 1)}>
              <IconSvg name="chevron-right" />
            </button>
          </nav>
        </div>
      )}
    </div>
  );
}

