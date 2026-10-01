"use client";

import { useHideValues } from "@/lib/HideValuesContext";

// Totals for the money columns of the collection tables (STD-TBL-002, VLT-46).
// Callers pass the rows the user can currently see — after search and filters;
// archived items are never in the list — so the totals always describe what is
// on screen. The caller's `fmt` is the same formatter its cells use, so totals
// look like the cells and are masked by the Hide-values toggle.

/** Columns that meaningfully sum. Year, condition, mileage etc. do not. */
export const MONEY_FIELDS: ReadonlySet<string> = new Set([
  "purchase_price",
  "latest_ai_price",
  "latest_user_price",
  "insurance_value",
]);

/** Sum of a column over `items`; null when no row has a value. */
export function sumField(items: readonly object[], field: string): number | null {
  let total = 0;
  let any = false;
  for (const it of items) {
    const v = (it as Record<string, unknown>)[field];
    if (v == null || v === "") continue;
    const n = Number(v);
    if (Number.isFinite(n)) {
      total += n;
      any = true;
    }
  }
  return any ? total : null;
}

type Fmt = (n: number | null | undefined) => string;
const show = (fmt: Fmt, n: number | null) => (n == null ? "—" : fmt(n));

/**
 * `<tfoot>` for a table whose body columns are `leadingCells` unlabelled cells
 * (select checkbox, thumbnail) followed by `columns`.
 */
export function TotalsRow({
  columns,
  items,
  fmt,
  leadingCells = 0,
}: {
  columns: readonly { label: string; field?: string }[];
  items: readonly object[];
  fmt: Fmt;
  leadingCells?: number;
}) {
  const firstMoney = columns.findIndex((c) => c.field && MONEY_FIELDS.has(c.field));
  if (firstMoney < 0) return null;
  return (
    <tfoot>
      <tr className="bg-surface-2 border-t-2 border-border" data-totals-row="">
        <td
          colSpan={Math.max(1, leadingCells + firstMoney)}
          className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted whitespace-nowrap"
        >
          Total · {items.length} {items.length === 1 ? "item" : "items"}
        </td>
        {columns.slice(firstMoney).map((c) =>
          c.field && MONEY_FIELDS.has(c.field) ? (
            <td key={c.label} data-total={c.field} className="px-4 py-3 font-mono font-semibold text-text whitespace-nowrap">
              {show(fmt, sumField(items, c.field))}
            </td>
          ) : (
            <td key={c.label} />
          ),
        )}
      </tr>
    </tfoot>
  );
}

/** The money columns as every collection table labels them. */
const MONEY_COLUMNS = [
  { label: "Buy Cost", field: "purchase_price" },
  { label: "AI Est.", field: "latest_ai_price" },
  { label: "My Value", field: "latest_user_price" },
  { label: "Insured Value", field: "insurance_value" },
] as const;

const usd = (n: number | null | undefined) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Number(n));

/** The same totals as a strip, for the tile view (which has no table). */
export function TotalsSummary({ items }: { items: readonly object[] }) {
  const { hideValues } = useHideValues();
  const fmt: Fmt = (n) => (hideValues ? "$•••" : usd(n));
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mb-4 px-4 py-2.5 rounded-xl bg-surface-2 border border-border text-xs" data-totals-row="">
      <span className="font-semibold uppercase tracking-wider text-text-muted">
        Total · {items.length} {items.length === 1 ? "item" : "items"}
      </span>
      {MONEY_COLUMNS.map((c) => (
        <span key={c.field} className="text-text-muted">
          {c.label} <span data-total={c.field} className="font-mono font-semibold text-text ml-1">{show(fmt, sumField(items, c.field))}</span>
        </span>
      ))}
    </div>
  );
}
