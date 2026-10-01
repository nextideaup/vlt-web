"use client";

import { useListState, type ListStateConfig } from "@/lib/hooks/useListState";
import { ClearAllButton, SearchField, FilterBar } from "@/components/ListControls";
import { matchesSearch, matchesFilters, FILTER_KEYS, splitMulti } from "@/lib/listFilters";
import { useHideValues } from "@/lib/HideValuesContext";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { itemHref } from "@/lib/itemRoutes";
import { useRowLink } from "@/lib/hooks/useRowLink";
import {
  IoDItem,
  IoDCategory,
  IOD_CATEGORIES,
  IOD_CATEGORY_LABELS,
  CONDITION_COLORS,
} from "@/lib/types";
import SortableHeader from "@/components/forms/SortableHeader";
import { TotalsRow } from "@/components/TotalsRow";
import { compareValues, conditionOrdinal, bestPriceOf, compareBrandThenYear } from "@/lib/sortHelpers";

const fmtRaw = (n: number | null | undefined) => {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Number(n));
};

const COLUMNS: { label: string; field?: string }[] = [
  { label: "Type", field: "item_type" },
  { label: "Brand", field: "brand" },
  { label: "Short Description", field: "short_description" },
  { label: "Condition", field: "condition" },
  { label: "Buy Cost", field: "purchase_price" },
  { label: "AI Est.", field: "latest_ai_price" },
  { label: "My Value", field: "latest_user_price" },
  { label: "Insured", field: "insure" },
  { label: "Insured Value", field: "insurance_value" },
];

const DEFAULT_ASC_FIELDS = new Set(["item_type", "brand", "short_description", "condition"]);

const PAGE_SIZE = 15;

const LIST_CONFIG: ListStateConfig = {
  defaultSort: "short_description",
  defaultDir: "asc",
  ascFields: DEFAULT_ASC_FIELDS,
  filterKeys: FILTER_KEYS,
};

// STD-TBL-005: what the search box matches (substring, case-insensitive).
const SEARCH_FIELDS = ["short_description", "brand", "item_type"];
const SEARCH_PLACEHOLDER = "Search description, brand, item type";

export default function CollectiblesPage() {
  const { hideValues } = useHideValues();
  const fmt = (n: number | null | undefined) => hideValues ? "$•••" : fmtRaw(n);
  const [allItems, setAllItems] = useState<IoDItem[]>([]);
  const openRow = useRowLink();
  const [loading, setLoading] = useState(true);
  const [pages, setPages] = useState<Record<IoDCategory, number>>({
    "fine-art": 0,
    memorabilia: 0,
    collectibles: 0,
    jewelry: 0,
    other: 0,
  });

  // Sort state — shared across all 5 category sections.
  // STD-STATE-001: sort lives in the URL, mirrored per path (lib/hooks/useListState).
  const list = useListState(LIST_CONFIG);
  const { sort: sortBy, dir: sortDir, toggleSort: listToggleSort } = list;

  const toggleSort = useCallback((field: string) => {
    listToggleSort(field);
    setPages({ "fine-art": 0, memorabilia: 0, collectibles: 0, jewelry: 0, other: 0 });
  }, [listToggleSort]);

  // STD-TBL-005: rows the search leaves visible.
  const visibleItems = useMemo(
    () => allItems.filter((i) => matchesSearch(i, list.q, SEARCH_FIELDS) && matchesFilters(i, list.filters)),
    [allItems, list.q, list.filters],
  );

  const sortedItems = useMemo(() => {
    const copy = [...visibleItems];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortBy === "brand") {
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
    fetch("/api/iod")
      .then((r) => r.json())
      .then(setAllItems)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);



  const totalItems = allItems.length;
  // Category filter (overview only) hides whole sections.
  const catFilter = splitMulti(list.filters.cat);

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-text mb-1">Collectibles</h1>
        <p className="text-text-muted text-sm">
          {loading
            ? "Loading…"
            : list.isFiltered
              ? `Showing ${visibleItems.length} of ${totalItems} item${totalItems !== 1 ? "s" : ""}`
              : `${totalItems} item${totalItems !== 1 ? "s" : ""} across all categories`}
        </p>
      </div>

      {/* List controls: search (STD-TBL-005), filters (STD-TBL-004), Clear all */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <SearchField
          value={list.q}
          onChange={(q) => { list.setQ(q); setPages({ "fine-art": 0, memorabilia: 0, collectibles: 0, jewelry: 0, other: 0 }); }}
          placeholder={SEARCH_PLACEHOLDER}
          label="Search collectibles"
        />
        <ClearAllButton onClick={() => { list.reset(); setPages({ "fine-art": 0, memorabilia: 0, collectibles: 0, jewelry: 0, other: 0 }); }} disabled={!list.canReset} />
      </div>
      <div className="mb-6">
        <FilterBar
          filters={list.filters}
          setFilter={(k, v) => { list.setFilter(k, v); setPages({ "fine-art": 0, memorabilia: 0, collectibles: 0, jewelry: 0, other: 0 }); }}
          categoryOptions={IOD_CATEGORIES.map((c) => ({ value: c, label: IOD_CATEGORY_LABELS[c] }))}
        />
      </div>

      {loading ? (
        <div className="space-y-8">
          {IOD_CATEGORIES.map((cat) => (
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
          {IOD_CATEGORIES.filter((c) => catFilter.length === 0 || catFilter.includes(c)).map((cat) => {
            const catItems = sortedItems.filter((i) => i.category === cat);
            const page = pages[cat];
            const totalPages = Math.max(1, Math.ceil(catItems.length / PAGE_SIZE));
            const pageItems = catItems.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
            const start = catItems.length === 0 ? 0 : page * PAGE_SIZE + 1;
            const end = Math.min(page * PAGE_SIZE + PAGE_SIZE, catItems.length);
            const setPage = (p: number) => setPages((prev) => ({ ...prev, [cat]: p }));

            return (
              <div key={cat}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <h2 className="text-base font-semibold text-text">{IOD_CATEGORY_LABELS[cat]}</h2>
                    <span className="text-xs text-text-dim bg-surface-2 border border-border px-2 py-0.5 rounded-full">
                      {catItems.length} {catItems.length === 1 ? "item" : "items"}
                    </span>
                  </div>
                  <Link
                    href={`/collectibles/${cat}`}
                    className="flex items-center gap-1 text-xs text-text-muted hover:text-accent transition-colors"
                  >
                    View category
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                </div>

                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-sm border-collapse min-w-[800px]">
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
                                <Link href={`/collectibles/${cat}`} className="text-accent hover:underline">add one</Link>
                              </>
                            )}
                          </td>
                        </tr>
                      ) : (
                        pageItems.map((item, idx) => (
                          <tr
                            key={item.id}
                            onClick={(e) => openRow(e, itemHref("collectibles", item.id))}
                            className={`cursor-pointer border-b border-border last:border-b-0 hover:bg-surface-2 transition-colors ${
                              idx % 2 === 0 ? "bg-surface" : "bg-surface/60"
                            }`}
                          >
                            <td className="px-4 py-3 text-text-muted whitespace-nowrap">{item.item_type || "—"}</td>
                            <td className="px-4 py-3 text-text font-medium whitespace-nowrap">{item.brand || "—"}</td>
                            <td className="px-4 py-3 text-text max-w-[240px] truncate"><Link href={itemHref("collectibles", item.id)} className="hover:text-accent hover:underline underline-offset-2">{item.short_description}</Link></td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              {item.condition ? (
                                <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border ${CONDITION_COLORS[item.condition]}`}>
                                  {item.condition}
                                </span>
                              ) : "—"}
                            </td>
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
                          </tr>
                        ))
                      )}
                    </tbody>
                    {/* STD-TBL-002: totals over this section's visible rows (all pages). */}
                    {catItems.length > 0 && <TotalsRow columns={COLUMNS} items={catItems} fmt={fmt} />}
                  </table>
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-3 px-1">
                    <span className="text-xs text-text-dim">{start}–{end} of {catItems.length}</span>
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
