"use client";

import { useListState, type ListStateConfig } from "@/lib/hooks/useListState";
import { TotalsSummary } from "@/components/TotalsRow";
import { ClearAllButton, SearchField, NoMatches, FilterBar } from "@/components/ListControls";
import { matchesSearch, matchesFilters, FILTER_KEYS } from "@/lib/listFilters";
import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { itemHref } from "@/lib/itemRoutes";
import {
  AutoItem,
  AutoCategory,
  AUTO_CATEGORIES,
  AUTO_CATEGORY_LABELS,
} from "@/lib/types";
import AutomobileCard from "@/components/AutomobileCard";
import AutomobileListView from "@/components/AutomobileListView";
import AddAutomobileModal from "@/components/AddAutomobileModal";
import AutoValuationPromptModal from "@/components/AutoValuationPromptModal";
import AutoCSVImportModal from "@/components/AutoCSVImportModal";
import BulkActionBar from "@/components/BulkActionBar";
import { compareValues, conditionOrdinal, bestPriceOf, compareBrandThenYear } from "@/lib/sortHelpers";

type SortField = string;

const DEFAULT_ASC_FIELDS = new Set([
  "brand", "model", "trim_level", "body_style", "color", "condition",
]);

const LIST_CONFIG: ListStateConfig = {
  defaultSort: "date",
  defaultDir: "desc",
  defaultView: "tiles",
  ascFields: DEFAULT_ASC_FIELDS,
  filterKeys: FILTER_KEYS,
};

// STD-TBL-005: what the search box matches (substring, case-insensitive).
const SEARCH_FIELDS = ["brand", "model", "trim_level", "vin", "description"];
const SEARCH_PLACEHOLDER = "Search brand, model, trim, VIN, description";

export default function AutoCategoryPage() {
  const params = useParams();
  const category = params.category as AutoCategory;

  const [items, setItems] = useState<AutoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [valuationItem, setValuationItem] = useState<AutoItem | null>(null);

  // STD-STATE-001: sort + view mode live in the URL, mirrored per path (lib/hooks/useListState).
  const list = useListState(LIST_CONFIG);
  const { sort: sortBy, dir: sortDir, view: viewMode, setView: setViewMode, toggleSort } = list;
  // CUR-6: bulk-select state.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelect = useCallback((id: string, selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (selected) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  // STD-TBL-005: rows the search leaves visible. Sorting, select-all and the
  // bulk bar all work on these, never on rows the user can't see.
  const visibleItems = useMemo(
    () => items.filter((i) => matchesSearch(i, list.q, SEARCH_FIELDS) && matchesFilters(i, list.filters)),
    [items, list.q, list.filters],
  );

  // Drop selections that are no longer visible (after a bulk action, or when
  // search hides them).
  useEffect(() => {
    setSelectedIds((prev) => {
      const validIds = new Set(visibleItems.map((i) => i.id));
      const next = new Set<string>();
      prev.forEach((id) => { if (validIds.has(id)) next.add(id); });
      return next.size === prev.size ? prev : next;
    });
  }, [visibleItems]);

  const isValidCategory = AUTO_CATEGORIES.includes(category);

  const fetchItems = useCallback(async () => {
    if (!isValidCategory) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/automobiles?category=${category}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setItems(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [category, isValidCategory]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const sortedItems = useMemo(() => {
    const copy = [...visibleItems];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortBy === "date") {
        cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      } else if (sortBy === "brand") {
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


  const handleItemAdded = useCallback((newItem: AutoItem, offerValuation?: boolean) => {
    setItems((prev) => [newItem, ...prev]);
    setShowAddModal(false);
    if (offerValuation) setValuationItem(newItem);
  }, []);

  const handleItemDeleted = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);


  const handleValuationComplete = useCallback((price: number) => {
    if (!valuationItem) return;
    setItems((prev) =>
      prev.map((item) =>
        item.id === valuationItem.id
          ? { ...item, latest_ai_price: price, latest_ai_price_date: new Date().toISOString() }
          : item
      )
    );
  }, [valuationItem]);


  if (!isValidCategory) {
    return (
      <div className="p-8 flex flex-col items-center justify-center h-full">
        <div className="w-20 h-20 rounded-2xl bg-surface-2 border border-border flex items-center justify-center mb-5">
          <svg className="w-10 h-10 text-text-dim" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16l2-6h14l2 6M1 16h22M5 16v2M19 16v2M8 10h8" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-text mb-2">Category Not Found</h1>
        <p className="text-text-muted">The category &quot;{category}&quot; does not exist.</p>
      </div>
    );
  }

  const SortButton = ({ field, label }: { field: SortField; label: string }) => (
    <button
      onClick={() => toggleSort(field)}
      className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
        sortBy === field
          ? "bg-accent/10 text-accent border border-accent/20"
          : "text-text-muted hover:text-text hover:bg-surface-3 border border-transparent"
      }`}
    >
      {label}
      {sortBy === field && (
        <svg
          className={`w-3 h-3 transition-transform ${sortDir === "asc" ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      )}
    </button>
  );

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 text-text-muted text-sm mb-1">
            <Link href="/automobiles" className="hover:text-accent transition-colors">Automobiles</Link>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            <span className="text-text">{AUTO_CATEGORY_LABELS[category]}</span>
          </div>
          <h1 className="text-3xl font-bold text-text">{AUTO_CATEGORY_LABELS[category]}</h1>
          {!loading && (
            <p className="text-text-muted text-sm mt-1">
              {list.isFiltered
                ? `Showing ${visibleItems.length} of ${items.length} item${items.length !== 1 ? "s" : ""}`
                : `${items.length} item${items.length !== 1 ? "s" : ""}`}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-2 bg-surface-2 hover:bg-surface-3 border border-border text-text font-medium px-4 py-2.5 rounded-xl transition-colors duration-150 text-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            Import CSV
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white font-medium px-5 py-2.5 rounded-xl transition-colors duration-150 shadow-lg shadow-accent/20"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add New Item
          </button>
        </div>
      </div>

      {/* Search (STD-TBL-005) + filters (STD-TBL-004) */}
      {!loading && items.length > 0 && (
        <div className="mb-3 space-y-3">
          <SearchField value={list.q} onChange={list.setQ} placeholder={SEARCH_PLACEHOLDER} label="Search vehicles" />
          <FilterBar filters={list.filters} setFilter={list.setFilter} />
        </div>
      )}

      {/* Toolbar: sort + view toggle */}
      {!loading && items.length > 0 && (
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-1">
            <span className="text-xs text-text-dim mr-2">Sort by</span>
            <SortButton field="date" label="Date Added" />
            <SortButton field="brand" label="Brand" />
            <SortButton field="value" label="Value" />
            <span className="ml-2" />
            <ClearAllButton onClick={list.reset} disabled={!list.canReset} />
          </div>

          <div className="flex items-center gap-1 bg-surface-2 border border-border rounded-xl p-1">
            <button
              onClick={() => setViewMode("tiles")}
              title="Tile view"
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                viewMode === "tiles" ? "bg-surface-3 text-text" : "text-text-dim hover:text-text"
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
              </svg>
            </button>
            <button
              onClick={() => setViewMode("list")}
              title="List view"
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                viewMode === "list" ? "bg-surface-3 text-text" : "text-text-dim hover:text-text"
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 5.25h16.5m-16.5 4.5h16.5m-16.5 4.5h16.5m-16.5 4.5h16.5" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-surface border border-border rounded-2xl overflow-hidden animate-pulse">
              <div className="aspect-[4/3] bg-surface-2" />
              <div className="p-4 space-y-2">
                <div className="h-4 bg-surface-3 rounded w-3/4" />
                <div className="h-3 bg-surface-3 rounded w-1/2" />
                <div className="h-6 bg-surface-3 rounded w-1/3 mt-3" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-20 h-20 rounded-2xl bg-surface-2 border border-border flex items-center justify-center mb-5">
            <svg className="w-10 h-10 text-text-dim" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16l2-6h14l2 6M1 16h22M5 16v2M19 16v2M8 10h8" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-text mb-2">No {AUTO_CATEGORY_LABELS[category]} Yet</h2>
          <p className="text-text-muted text-sm mb-6 max-w-xs">Start building your collection by adding your first item.</p>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white font-medium px-5 py-2.5 rounded-xl transition-colors duration-150"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add First Item
          </button>
        </div>
      ) : sortedItems.length === 0 ? (
        <NoMatches onClear={list.reset} />
      ) : viewMode === "tiles" ? (
        <>
        {/* STD-TBL-002: totals over the tiles shown (post search/filter). */}
        <TotalsSummary items={sortedItems} />
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
          {sortedItems.map((item) => (
            <AutomobileCard
              key={item.id}
              item={item}
              href={itemHref("automobiles", item.id)}
              onDelete={handleItemDeleted}
              isSelected={selectedIds.has(item.id)}
              onSelectChange={toggleSelect}
            />
          ))}
        </div>
        </>
      ) : (
        <AutomobileListView
          items={sortedItems}
          itemHref={(item) => itemHref("automobiles", item.id)}
          onDelete={handleItemDeleted}
          selectedIds={selectedIds}
          onSelectChange={toggleSelect}
          onSelectAllToggle={() => {
            if (selectedIds.size === visibleItems.length && visibleItems.length > 0) clearSelection();
            else setSelectedIds(new Set(visibleItems.map((i) => i.id)));
          }}
          sortBy={sortBy}
          sortDir={sortDir}
          onSortToggle={toggleSort}
        />
      )}

      {/* CUR-6: bulk-action bar. */}
      <BulkActionBar
        module="automobiles"
        onSpecsGenerated={fetchItems}
        selectedIds={selectedIds}
        selectedInsuredCount={items.filter((i) => selectedIds.has(i.id) && i.insure).length}
        totalSelectableCount={visibleItems.length}
        onClearSelection={clearSelection}
        onSelectAll={() => setSelectedIds(new Set(visibleItems.map((i) => i.id)))}
        onActionComplete={(result) => {
          if (result.action === "set_insure") {
            setItems((prev) =>
              prev.map((it) => (result.ids.includes(it.id) ? { ...it, insure: result.value ?? it.insure } : it)),
            );
          } else if (result.action === "archive" || result.action === "delete") {
            setItems((prev) => prev.filter((it) => !result.ids.includes(it.id)));
          }
        }}
      />

      {showImportModal && (
        <AutoCSVImportModal
          defaultCategory={category}
          onClose={() => setShowImportModal(false)}
          onImportComplete={() => { setShowImportModal(false); fetchItems(); }}
        />
      )}

      {showAddModal && (
        <AddAutomobileModal
          defaultCategory={category}
          onClose={() => setShowAddModal(false)}
          onItemAdded={handleItemAdded}
        />
      )}

      {valuationItem && (
        <AutoValuationPromptModal
          item={valuationItem}
          onClose={() => setValuationItem(null)}
          onValuationComplete={handleValuationComplete}
        />
      )}
    </div>
  );
}
