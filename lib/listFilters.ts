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
