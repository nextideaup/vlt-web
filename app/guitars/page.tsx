"use client";

import { useListState, type ListStateConfig } from "@/lib/hooks/useListState";
import { ClearAllButton, SearchField } from "@/components/ListControls";
import { matchesSearch } from "@/lib/listFilters";
import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { itemHref } from "@/lib/itemRoutes";
import { useRowLink } from "@/lib/hooks/useRowLink";
import { GuitarItem, GuitarCategory, CATEGORY_LABELS, GUITAR_CATEGORIES, CONDITION_COLORS } from "@/lib/types";
import SortableHeader from "@/components/forms/SortableHeader";
import { compareValues, conditionOrdinal, bestPriceOf, compareBrandThenYear } from "@/lib/sortHelpers";

const fmt = (price: number | null | undefined) => {
  if (price == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(price));
};

const COLUMNS: { label: string; field?: string }[] = [
  { label: "Year", field: "year" },
  { label: "Brand", field: "brand" },
  { label: "Model", field: "model" },
  { label: "Color / Finish", field: "color_finish" },
  { label: "Condition", field: "condition" },
  { label: "Short Description", field: "short_description" },
  { label: "Buy Cost", field: "purchase_price" },
  { label: "AI Est.", field: "latest_ai_price" },
  { label: "My Value", field: "latest_user_price" },
  { label: "Insured", field: "insure" },
  { label: "Insured Value", field: "insurance_value" },
  // "Open to Sell" is a placeholder for the future Sell flow — not sortable.
  { label: "Open to Sell" },
];

// Default-ascending columns when switching to a new sort. Matches the
// pattern in the category-page tables: strings A→Z; numerics/dates
// highest/newest first.
const DEFAULT_ASC_FIELDS = new Set(["brand", "model", "color_finish", "short_description", "condition"]);

const PAGE_SIZE = 15;

const LIST_CONFIG: ListStateConfig = {
  defaultSort: "brand",
  defaultDir: "asc",
  ascFields: DEFAULT_ASC_FIELDS,
};

// STD-TBL-005: what the search box matches (substring, case-insensitive).
const SEARCH_FIELDS = ["brand", "model", "serial_number", "color_finish", "short_description"];
const SEARCH_PLACEHOLDER = "Search brand, model, serial, finish, description";

export default function GuitarsPage() {
  const [allItems, setAllItems] = useState<GuitarItem[]>([]);
  const openRow = useRowLink();
  const [loading, setLoading] = useState(true);
  const [pages, setPages] = useState<Record<GuitarCategory, number>>({
    "electric-guitars": 0,
    "acoustic-guitars": 0,
    amplifiers: 0,
    pedals: 0,
  });

  // Sort state — shared across all category sections on this page. Clicking
  // a header in any section re-sorts every section the same way.
  // Default: Brand ASC with Year ASC as a within-brand tiebreak. See the
  // "brand" branch in sortedItems below + compareBrandThenYear helper.
  // STD-STATE-001: sort lives in the URL, mirrored per path (lib/hooks/useListState).
  const list = useListState(LIST_CONFIG);
  const { sort: sortBy, dir: sortDir, toggleSort: listToggleSort } = list;

  const toggleSort = useCallback((field: string) => {
    listToggleSort(field);
    // Reset pagination on every category section when sort changes so the
    // user always sees the new top of the list rather than a stale page.
    setPages({ "electric-guitars": 0, "acoustic-guitars": 0, amplifiers: 0, pedals: 0 });
  }, [listToggleSort]);

  // STD-TBL-005: rows the search leaves visible.
  const visibleItems = useMemo(
    () => allItems.filter((i) => matchesSearch(i, list.q, SEARCH_FIELDS)),
    [allItems, list.q],
  );

  const sortedItems = useMemo(() => {
    const copy = [...visibleItems];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortBy === "brand") {
        // Brand asc with Year asc as a within-brand tiebreak.
        cmp = compareBrandThenYear(a, b);
      } else if (sortBy === "value") {
        cmp = bestPriceOf(a) - bestPriceOf(b);
      } else if (sortBy === "condition") {
        cmp = conditionOrdinal(a.condition) - conditionOrdinal(b.condition);
      } else if (sortBy === "insure") {
        cmp = (a.insure ? 1 : 0) - (b.insure ? 1 : 0);
      } else {
        cmp = compareValues(
          (a as unknown as Record<string, unknown>)[sortBy],
          (b as unknown as Record<string, unknown>)[sortBy],
        );
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [visibleItems, sortBy, sortDir]);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch("/api/guitars");
        if (!res.ok) throw new Error("Failed to fetch");
        const items: GuitarItem[] = await res.json();
        setAllItems(items);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);




  const totalItems = allItems.length;

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-text mb-1">Guitars</h1>
        <p className="text-text-muted text-sm">
          {loading
            ? "Loading…"
            : list.isFiltered
              ? `Showing ${visibleItems.length} of ${totalItems} item${totalItems !== 1 ? "s" : ""}`
              : `${totalItems} item${totalItems !== 1 ? "s" : ""} across all categories`}
        </p>
      </div>

      {/* List controls */}
      <div className="flex items-center justify-between gap-3 mb-6">
        <SearchField
          value={list.q}
          onChange={(q) => { list.setQ(q); setPages({ "electric-guitars": 0, "acoustic-guitars": 0, amplifiers: 0, pedals: 0 }); }}
          placeholder={SEARCH_PLACEHOLDER}
          label="Search guitars"
        />
        <ClearAllButton onClick={() => { list.reset(); setPages({ "electric-guitars": 0, "acoustic-guitars": 0, amplifiers: 0, pedals: 0 }); }} disabled={!list.canReset} />
      </div>

      {/* Sections */}
      {loading ? (
        <div className="space-y-8">
          {GUITAR_CATEGORIES.map((cat) => (
            <div key={cat}>
              <div className="h-6 w-40 bg-surface-3 rounded animate-pulse mb-3" />
              <div className="rounded-xl border border-border overflow-hidden">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-10 bg-surface-2 border-b border-border last:border-b-0 animate-pulse" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-10">
          {GUITAR_CATEGORIES.map((cat) => {
            // Use the page-level sorted list, then filter to this section.
            const catItems = sortedItems.filter((i) => i.category === cat);
            const page = pages[cat];
            const totalPages = Math.max(1, Math.ceil(catItems.length / PAGE_SIZE));
            const pageItems = catItems.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
            const start = catItems.length === 0 ? 0 : page * PAGE_SIZE + 1;
            const end = Math.min(page * PAGE_SIZE + PAGE_SIZE, catItems.length);

            const setPage = (p: number) => setPages((prev) => ({ ...prev, [cat]: p }));

            return (
              <div key={cat}>
                {/* Section header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <h2 className="text-base font-semibold text-text">{CATEGORY_LABELS[cat]}</h2>
                    <span className="text-xs text-text-dim bg-surface-2 border border-border px-2 py-0.5 rounded-full">
                      {catItems.length} {catItems.length === 1 ? "item" : "items"}
                    </span>
                  </div>
                  <Link
                    href={`/guitars/${cat}`}
                    className="flex items-center gap-1 text-xs text-text-muted hover:text-accent transition-colors"
                  >
                    View category
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                </div>

                {/* Table */}
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-sm border-collapse min-w-[900px]">
                    <thead>
                      <tr className="bg-surface-2 border-b border-border">
                        {COLUMNS.map((col) => (
                          <SortableHeader
                            key={col.label}
                            label={col.label}
                            field={col.field}
                            currentSort={sortBy}
                            currentDir={sortDir}
                            onToggle={toggleSort}
                          />
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {catItems.length === 0 ? (
                        <tr>
                          <td colSpan={COLUMNS.length} className="px-4 py-5 text-sm text-text-dim text-center italic">
                            {list.isFiltered ? (
                              "No matches in this category"
                            ) : (
                              <>
                                No items yet —{" "}
                                <Link href={`/guitars/${cat}`} className="text-accent hover:underline">add one</Link>
                              </>
                            )}
                          </td>
                        </tr>
                      ) : (
                        pageItems.map((item, idx) => (
                          <tr
                            key={item.id}
                            onClick={(e) => openRow(e, itemHref("guitars", item.id))}
                            className={`cursor-pointer border-b border-border last:border-b-0 hover:bg-surface-2 transition-colors ${
                              idx % 2 === 0 ? "bg-surface" : "bg-surface/60"
                            }`}
                          >
                            <td className="px-4 py-3 text-text-muted whitespace-nowrap">{item.year ?? "—"}</td>
                            <td className="px-4 py-3 text-text font-medium whitespace-nowrap">{item.brand}</td>
                            <td className="px-4 py-3 text-text whitespace-nowrap"><Link href={itemHref("guitars", item.id)} className="hover:text-accent hover:underline underline-offset-2">{item.model}</Link></td>
                            <td className="px-4 py-3 text-text-muted whitespace-nowrap">{item.color_finish || "—"}</td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border ${CONDITION_COLORS[item.condition]}`}>
                                {item.condition}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-text-muted max-w-[180px] truncate">{item.short_description || "—"}</td>
                            <td className="px-4 py-3 text-text font-mono whitespace-nowrap">{fmt(item.purchase_price)}</td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              {item.latest_ai_price != null
                                ? <span className="text-accent font-mono font-medium">{fmt(item.latest_ai_price)}</span>
                                : <span className="text-text-dim">—</span>}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              {item.latest_user_price != null
                                ? <span className="text-text font-mono font-medium">{fmt(item.latest_user_price)}</span>
                                : <span className="text-text-dim">—</span>}
                            </td>
                            {/* Insured */}
                            <td className="px-4 py-3 whitespace-nowrap">
                              {item.insure
                                ? <span className="text-accent text-xs font-medium">Yes</span>
                                : <span className="text-text-dim">—</span>}
                            </td>
                            {/* Insured Value */}
                            <td className="px-4 py-3 whitespace-nowrap font-mono">
                              {item.insurance_value != null
                                ? <span className="text-text font-medium">{fmt(item.insurance_value)}</span>
                                : <span className="text-text-dim">—</span>}
                            </td>
                            {/* Open to Sell — future Sell flow placeholder */}
                            <td className="px-4 py-3 text-text-dim">—</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-3 px-1">
                    <span className="text-xs text-text-dim">
                      {start}–{end} of {catItems.length}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setPage(page - 1)}
                        disabled={page === 0}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:text-text hover:bg-surface-3 disabled:opacity-30 disabled:cursor-not-allowed transition-colors border border-transparent hover:border-border"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                        </svg>
                      </button>
                      {Array.from({ length: totalPages }).map((_, i) => (
                        <button
                          key={i}
                          onClick={() => setPage(i)}
                          className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
                            i === page
                              ? "bg-accent text-white"
                              : "text-text-muted hover:text-text hover:bg-surface-3 border border-transparent hover:border-border"
                          }`}
                        >
                          {i + 1}
                        </button>
                      ))}
                      <button
                        onClick={() => setPage(page + 1)}
                        disabled={page === totalPages - 1}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:text-text hover:bg-surface-3 disabled:opacity-30 disabled:cursor-not-allowed transition-colors border border-transparent hover:border-border"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
