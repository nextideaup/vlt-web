// Client-side narrowing for the collection lists (STD-TBL-005 search). The
// lists already load every item, so search is a filter over loaded rows.

/**
 * Case-insensitive substring search across `fields`. Each whitespace-separated
 * term must match at least one field, so "fender 1962" finds a 1962 Fender
 * even though brand and year are different columns. Empty query matches all.
 */
export function matchesSearch(item: object, q: string, fields: readonly string[]): boolean {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const rec = item as Record<string, unknown>;
  const haystack = fields
    .map((f) => rec[f])
    .filter((v) => v != null && v !== "")
    .map((v) => String(v).toLowerCase());
  return terms.every((t) => haystack.some((h) => h.includes(t)));
}

// ── Column filters (STD-TBL-004, VLT-49) ────────────────────────────────────
// Held in useListState as query params, so they persist with sort/search and
// reset with Clear all. Multi-value filters are comma-separated.

/** Query-param names for the filter bar. */
export const FILTER_KEYS = ["cond", "cat", "ins", "ymin", "ymax", "vmin", "vmax"] as const;

/** The value the Value range filters on: My Value, else the AI estimate. */
export function filterValueOf(item: { latest_user_price?: number | null; latest_ai_price?: number | null }): number | null {
  const v = item.latest_user_price ?? item.latest_ai_price;
  return v == null ? null : Number(v);
}

export function splitMulti(v: string | undefined): string[] {
  return v ? v.split(",").filter(Boolean) : [];
}

function num(v: string | undefined): number | null {
  if (v == null || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

interface Filterable {
  condition?: string | null;
  category?: string;
  insure?: boolean | null;
  year?: number | null;
  latest_user_price?: number | null;
  latest_ai_price?: number | null;
}

/**
 * Does the item pass every active filter? An item with no value for a bounded
 * field (no year, no valuation) is excluded once that bound is set.
 */
export function matchesFilters(item: Filterable, filters: Readonly<Record<string, string>>): boolean {
  const conds = splitMulti(filters.cond);
  if (conds.length && !conds.includes(item.condition ?? "")) return false;
  const cats = splitMulti(filters.cat);
  if (cats.length && !cats.includes(item.category ?? "")) return false;
  if (filters.ins === "yes" && !item.insure) return false;
  if (filters.ins === "no" && item.insure) return false;
  const ymin = num(filters.ymin), ymax = num(filters.ymax);
  if (ymin != null || ymax != null) {
    const y = item.year == null ? null : Number(item.year);
    if (y == null) return false;
    if (ymin != null && y < ymin) return false;
    if (ymax != null && y > ymax) return false;
  }
  const vmin = num(filters.vmin), vmax = num(filters.vmax);
  if (vmin != null || vmax != null) {
    const v = filterValueOf(item);
    if (v == null) return false;
    if (vmin != null && v < vmin) return false;
    if (vmax != null && v > vmax) return false;
  }
  return true;
}
