"use client";

// Shared controls for the collection list views (STD-STATE-001).

import { useEffect, useRef } from "react";
import { CONDITIONS } from "@/lib/types";
import { splitMulti } from "@/lib/listFilters";

/** "Clear all": resets the list's sort, search and filters in one action. */
export function ClearAllButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? "Sort, search and filters are already at their defaults" : "Reset sort, search and filters"}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-text-muted hover:text-text hover:bg-surface-3 border border-border transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-text-muted"
    >
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
      Clear all
    </button>
  );
}

/**
 * Free-text search above a collection list (STD-TBL-005). The placeholder
 * names the columns it searches; matching is substring, no wildcards needed.
 */
export function SearchField({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (q: string) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <div className="relative w-full max-w-md">
      <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-dim pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
        <circle cx="11" cy="11" r="8" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35" />
      </svg>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="w-full bg-surface-2 border border-border text-text text-sm rounded-xl pl-9 pr-9 py-2 placeholder-text-dim focus:border-accent focus:ring-1 focus:ring-accent outline-none [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md text-text-dim hover:text-text hover:bg-surface-3 flex items-center justify-center"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

/** Shown in place of the rows when search/filters leave nothing visible. */
export function NoMatches({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <p className="text-text font-medium mb-1">No items match</p>
      <p className="text-text-muted text-sm mb-4">Try a different search or clear the filters.</p>
      <button type="button" onClick={onClear} className="text-sm text-accent hover:underline">
        Clear all
      </button>
    </div>
  );
}

// ── Filter bar (STD-TBL-004, VLT-49) ────────────────────────────────────────

const fieldClass =
  "bg-surface-2 border border-border text-text text-xs rounded-lg px-2.5 py-1.5 focus:border-accent focus:ring-1 focus:ring-accent outline-none";

/** Dropdown of checkboxes; the value is a comma-separated list in the URL. */
function MultiSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string | undefined;
  onChange: (v: string | null) => void;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const selected = splitMulti(value);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current?.open && !ref.current.contains(e.target as Node)) ref.current.open = false;
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);
  const toggle = (v: string) => {
    const next = selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v];
    // Keep the option order stable in the URL.
    const ordered = options.map((o) => o.value).filter((o) => next.includes(o));
    onChange(ordered.length ? ordered.join(",") : null);
  };
  return (
    <details ref={ref} className="relative">
      <summary
        className={`${fieldClass} list-none cursor-pointer select-none flex items-center gap-1.5 [&::-webkit-details-marker]:hidden ${selected.length ? "border-accent/50 text-accent" : ""}`}
        aria-label={`${label} filter`}
      >
        {label}
        {selected.length > 0 && (
          <span className="bg-accent/20 text-accent text-[10px] font-bold px-1.5 rounded-full">{selected.length}</span>
        )}
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </summary>
      <div className="absolute z-30 mt-1 min-w-[11rem] bg-surface border border-border rounded-xl shadow-2xl p-2 space-y-0.5">
        {options.map((o) => (
          <label key={o.value} className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-text hover:bg-surface-3 cursor-pointer">
            <input
              type="checkbox"
              checked={selected.includes(o.value)}
              onChange={() => toggle(o.value)}
              className="accent-accent"
            />
            {o.label}
          </label>
        ))}
      </div>
    </details>
  );
}

function RangeInputs({
  label,
  minKey,
  maxKey,
  filters,
  setFilter,
  prefix,
  minPlaceholder,
  maxPlaceholder,
}: {
  label: string;
  minKey: string;
  maxKey: string;
  filters: Readonly<Record<string, string>>;
  setFilter: (key: string, value: string | null) => void;
  prefix?: string;
  minPlaceholder: string;
  maxPlaceholder: string;
}) {
  const input = (key: string, placeholder: string, aria: string) => (
    <div className="relative">
      {prefix && <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-text-dim">{prefix}</span>}
      <input
        type="number"
        inputMode="numeric"
        value={filters[key] ?? ""}
        onChange={(e) => setFilter(key, e.target.value || null)}
        placeholder={placeholder}
        aria-label={aria}
        className={`${fieldClass} w-24 ${prefix ? "pl-5" : ""}`}
      />
    </div>
  );
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-text-dim">{label}</span>
      {input(minKey, minPlaceholder, `${label} from`)}
      <span className="text-xs text-text-dim">–</span>
      {input(maxKey, maxPlaceholder, `${label} to`)}
    </div>
  );
}

/**
 * Condition (multi), Category (multi, overview pages only), Insured
 * (any/yes/no), Year range and Value range (My Value, else AI Est.).
 */
export function FilterBar({
  filters,
  setFilter,
  categoryOptions,
}: {
  filters: Readonly<Record<string, string>>;
  setFilter: (key: string, value: string | null) => void;
  categoryOptions?: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filters">
      <span className="text-xs text-text-dim mr-1">Filter</span>
      {categoryOptions && (
        <MultiSelect label="Category" options={categoryOptions} value={filters.cat} onChange={(v) => setFilter("cat", v)} />
      )}
      <MultiSelect
        label="Condition"
        options={CONDITIONS.map((c) => ({ value: c, label: c }))}
        value={filters.cond}
        onChange={(v) => setFilter("cond", v)}
      />
      <select
        value={filters.ins ?? ""}
        onChange={(e) => setFilter("ins", e.target.value || null)}
        aria-label="Insured filter"
        className={`${fieldClass} ${filters.ins ? "border-accent/50 text-accent" : ""}`}
      >
        <option value="">Insured: any</option>
        <option value="yes">Insured: yes</option>
        <option value="no">Insured: no</option>
      </select>
      <RangeInputs label="Year" minKey="ymin" maxKey="ymax" filters={filters} setFilter={setFilter} minPlaceholder="from" maxPlaceholder="to" />
      <RangeInputs label="Value" minKey="vmin" maxKey="vmax" filters={filters} setFilter={setFilter} prefix="$" minPlaceholder="min" maxPlaceholder="max" />
    </div>
  );
}
