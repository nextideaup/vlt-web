"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { itemHref } from "@/lib/itemRoutes";
import {
  GuitarItem,
  GuitarCategory,
  CATEGORY_LABELS,
  GUITAR_CATEGORIES,
} from "@/lib/types";
import GuitarCard from "@/components/GuitarCard";
import GuitarListView from "@/components/GuitarListView";
import AddItemModal from "@/components/AddItemModal";
import ValuationPromptModal from "@/components/ValuationPromptModal";
import CSVImportModal from "@/components/CSVImportModal";
import BulkActionBar from "@/components/BulkActionBar";
import { useRevalue, needsRevalue } from "@/lib/RevalueContext";
import { compareValues, conditionOrdinal, bestPriceOf, compareBrandThenYear } from "@/lib/sortHelpers";

// SortField covers both the existing toolbar buttons (date / brand / value)
// and the per-column keys used by SortableHeader in the list-view table.
// Loosened to `string` so the SortableHeader callback can hand us any of the
// GuitarListView COLUMNS field keys without needing to keep two unions in
// sync. The comparator switch falls through to compareValues for anything
// not explicitly handled.
type SortField = string;
type SortDir = "asc" | "desc";
type ViewMode = "tiles" | "list";

// Per-page default direction when switching to a new sort column. Most
// columns make sense descending (highest value, newest year) but a few are
// more naturally ascending (brand A→Z, condition worst-first).
const DEFAULT_ASC_FIELDS = new Set(["brand", "model", "color_finish", "short_description", "condition"]);

export default function CategoryPage() {
  const params = useParams();
  const category = params.category as GuitarCategory;

  const [items, setItems] = useState<GuitarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [valuationItem, setValuationItem] = useState<GuitarItem | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);

  const [sortBy, setSortBy] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [viewMode, setViewMode] = useState<ViewMode>("tiles");
  // CUR-6: bulk-select state, scoped to this category page.
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

  // Clear stale selections when the underlying item list changes (e.g. after
  // a bulk action) — keeps the BulkActionBar count honest.
  useEffect(() => {
    setSelectedIds((prev) => {
      const validIds = new Set(items.map((i) => i.id));
      const next = new Set<string>();
      prev.forEach((id) => { if (validIds.has(id)) next.add(id); });
      return next.size === prev.size ? prev : next;
    });
  }, [items]);

  const { startRevalue, state: revalueState } = useRevalue();

  const isValidCategory = GUITAR_CATEGORIES.includes(category);

  const fetchItems = useCallback(async () => {
    if (!isValidCategory) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/guitars?category=${category}`);
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
    const copy = [...items];
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
        // Generic field lookup — handles every other column key from the
        // GuitarListView COLUMNS array (year, model, color_finish,
        // short_description, purchase_price, latest_ai_price,
        // latest_user_price, insurance_value, etc.).
        cmp = compareValues(
          (a as unknown as Record<string, unknown>)[sortBy],
          (b as unknown as Record<string, unknown>)[sortBy],
        );
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [items, sortBy, sortDir]);

  const toggleSort = useCallback((field: SortField) => {
    setSortBy((prev) => {
      if (prev === field) {
        // Same column: just flip direction.
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return prev;
      }
      // New column: use the natural default direction for the field.
      setSortDir(DEFAULT_ASC_FIELDS.has(field) ? "asc" : "desc");
      return field;
    });
  }, []);

  const handleItemAdded = useCallback((newItem: GuitarItem, offerValuation?: boolean) => {
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



  const pendingRevalue = useMemo(() => items.filter(needsRevalue).length, [items]);

  const runBatchRevalue = useCallback(() => {
    if (pendingRevalue === 0) return;
    // Patch-style callback: the runner sends a partial ItemPatch per
    // successful item. For an AI revalue, the patch carries
    // latest_ai_price + date and may also include insurance fields (when
    // the item was flagged — CUR-5 auto-trigger). For an insurance-only
    // compute, the patch carries just the three insurance fields.
    startRevalue(items, category, (id, patch) => {
      setItems((prev) =>
        prev.map((it) => (it.id === id ? { ...it, ...patch } : it)),
      );
    });
  }, [items, category, startRevalue, pendingRevalue]);

  if (!isValidCategory) {
    return (
      <div className="p-8 flex flex-col items-center justify-center h-full">
        <div className="text-6xl mb-4">🎸</div>
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
            <Link href="/guitars" className="hover:text-accent transition-colors">Guitars</Link>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            <span className="text-text">{CATEGORY_LABELS[category]}</span>
          </div>
          <h1 className="text-3xl font-bold text-text">{CATEGORY_LABELS[category]}</h1>
          {!loading && (
            <p className="text-text-muted text-sm mt-1">
              {items.length} item{items.length !== 1 ? "s" : ""}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          {items.length > 0 && (
            <button
              onClick={runBatchRevalue}
              disabled={revalueState?.isRunning || pendingRevalue === 0}
              className="flex items-center gap-2 bg-surface-2 hover:bg-surface-3 disabled:opacity-50 disabled:cursor-not-allowed border border-border text-text font-medium px-4 py-2.5 rounded-xl transition-colors duration-150 text-sm"
            >
              <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
              Revalue Collection
              {pendingRevalue > 0 && (
                <span className="bg-accent/20 text-accent text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  {pendingRevalue}
                </span>
              )}
            </button>
          )}
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

      {/* Toolbar: sort + view toggle */}
      {!loading && items.length > 0 && (
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-1">
            <span className="text-xs text-text-dim mr-2">Sort by</span>
            <SortButton field="date" label="Date Added" />
            <SortButton field="brand" label="Brand" />
            <SortButton field="value" label="Value" />
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
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-text mb-2">No {CATEGORY_LABELS[category]} Yet</h2>
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
      ) : viewMode === "tiles" ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
          {sortedItems.map((item) => (
            <GuitarCard
              key={item.id}
              item={item}
              href={itemHref("guitars", item.id)}
              onDelete={handleItemDeleted}
              isSelected={selectedIds.has(item.id)}
              onSelectChange={toggleSelect}
            />
          ))}
        </div>
      ) : (
        <GuitarListView
          items={sortedItems}
          itemHref={(item) => itemHref("guitars", item.id)}
          onDelete={handleItemDeleted}
          selectedIds={selectedIds}
          onSelectChange={toggleSelect}
          onSelectAllToggle={() => {
            // Toggle: all selected → clear; otherwise → select every visible item.
            if (selectedIds.size === items.length && items.length > 0) clearSelection();
            else setSelectedIds(new Set(items.map((i) => i.id)));
          }}
          sortBy={sortBy}
          sortDir={sortDir}
          onSortToggle={toggleSort}
        />
      )}

      {/* CUR-6: bulk-action bar (visible when any items selected). */}
      <BulkActionBar
        module="guitars"
        onSpecsGenerated={fetchItems}
        selectedIds={selectedIds}
        selectedInsuredCount={items.filter((i) => selectedIds.has(i.id) && i.insure).length}
        totalSelectableCount={items.length}
        onClearSelection={clearSelection}
        onSelectAll={() => setSelectedIds(new Set(items.map((i) => i.id)))}
        onActionComplete={(result) => {
          if (result.action === "set_insure") {
            setItems((prev) =>
              prev.map((it) => (result.ids.includes(it.id) ? { ...it, insure: result.value ?? it.insure } : it)),
            );
          } else if (result.action === "archive") {
            // Archived items disappear from the default list view; future
            // Archive view will surface them via ?include_archived=true.
            setItems((prev) => prev.filter((it) => !result.ids.includes(it.id)));
          } else if (result.action === "delete") {
            setItems((prev) => prev.filter((it) => !result.ids.includes(it.id)));
          }
        }}
      />

      {showAddModal && (
        <AddItemModal
          defaultCategory={category}
          onClose={() => setShowAddModal(false)}
          onItemAdded={handleItemAdded}
        />
      )}

      {showImportModal && (
        <CSVImportModal
          defaultCategory={category}
          onClose={() => setShowImportModal(false)}
          onImportComplete={() => {
            setShowImportModal(false);
            fetchItems();
          }}
        />
      )}

      {valuationItem && (
        <ValuationPromptModal
          item={valuationItem}
          onClose={() => setValuationItem(null)}
          onValuationComplete={handleValuationComplete}
        />
      )}
    </div>
  );
}
