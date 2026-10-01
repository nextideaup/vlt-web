"use client";

// Shared controls for the collection list views (STD-STATE-001).

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
