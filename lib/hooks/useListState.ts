"use client";

// One home for a collection list's view state (STD-STATE-001, VLT-45): sort
// column + direction, view mode, search text (`q`) and filters. The URL query
// is the source of truth, so refresh, Back from an item page and a shared link
// all restore the list exactly; it is mirrored to sessionStorage per path so
// arriving at the same list from the sidebar (a URL with no query) restores it
// too. `reset()` ("Clear all") returns sort, search and filters to the list's
// defaults in one step; the tiles/list view mode is a display preference and
// is kept.
//
// Only non-default values are written, so an untouched list keeps a clean URL.
// The URL is updated with history.replaceState (Next.js syncs its router with
// it), which never adds history entries: Back always leaves the list.

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export type SortDir = "asc" | "desc";
export type ViewMode = "tiles" | "list";

export interface ListStateConfig {
  defaultSort: string;
  defaultDir: SortDir;
  defaultView?: ViewMode;
  /** Columns whose first click sorts ascending (text columns); others start descending. */
  ascFields?: ReadonlySet<string>;
  /** Filter names this list understands; each is its own query param. */
  filterKeys?: readonly string[];
}

export interface ListState {
  sort: string;
  dir: SortDir;
  view: ViewMode;
  q: string;
  filters: Readonly<Record<string, string>>;
}

const STORAGE_PREFIX = "vlt:list-state:";
const BASE_KEYS = ["sort", "dir", "view", "q"] as const;

function defaultsOf(cfg: ListStateConfig): ListState {
  return { sort: cfg.defaultSort, dir: cfg.defaultDir, view: cfg.defaultView ?? "tiles", q: "", filters: {} };
}

function ownKeys(cfg: ListStateConfig): string[] {
  return [...BASE_KEYS, ...(cfg.filterKeys ?? [])];
}

function parse(search: string, cfg: ListStateConfig): ListState {
  const p = new URLSearchParams(search);
  const d = defaultsOf(cfg);
  const dir = p.get("dir");
  const view = p.get("view");
  const filters: Record<string, string> = {};
  for (const k of cfg.filterKeys ?? []) {
    const v = p.get(k);
    if (v) filters[k] = v;
  }
  return {
    sort: p.get("sort") || d.sort,
    dir: dir === "asc" || dir === "desc" ? dir : d.dir,
    view: view === "tiles" || view === "list" ? view : d.view,
    q: p.get("q") ?? "",
    filters,
  };
}

function serialize(s: ListState, cfg: ListStateConfig): URLSearchParams {
  const d = defaultsOf(cfg);
  const p = new URLSearchParams();
  if (s.sort !== d.sort || s.dir !== d.dir) {
    p.set("sort", s.sort);
    p.set("dir", s.dir);
  }
  if (s.view !== d.view) p.set("view", s.view);
  if (s.q) p.set("q", s.q);
  for (const k of cfg.filterKeys ?? []) if (s.filters[k]) p.set(k, s.filters[k]);
  return p;
}

function hasOwnParams(search: string, cfg: ListStateConfig): boolean {
  const p = new URLSearchParams(search);
  return ownKeys(cfg).some((k) => p.has(k));
}

/** `config` must be a stable (module-level) object. */
export function useListState(config: ListStateConfig) {
  const pathname = usePathname();
  const storageKey = STORAGE_PREFIX + pathname;

  const [state, setState] = useState<ListState>(() => defaultsOf(config));
  // Which path the current state was restored for — nothing is written back
  // until the restore for this path has happened, so a default first render
  // can never overwrite a saved state.
  const [restoredFor, setRestoredFor] = useState<string | null>(null);

  // Restore: the URL wins; with no list params in it, use this path's saved copy.
  useEffect(() => {
    let search = window.location.search;
    if (!hasOwnParams(search, config)) {
      try {
        const saved = window.sessionStorage.getItem(storageKey);
        if (saved) search = saved;
      } catch {
        // storage unavailable (private mode etc.) — URL-only persistence
      }
    }
    setState(parse(search, config));
    setRestoredFor(storageKey);
  }, [storageKey, config]);

  // Mirror: URL (keeping any unrelated params) + sessionStorage.
  useEffect(() => {
    if (restoredFor !== storageKey) return;
    const own = serialize(state, config);
    const url = new URL(window.location.href);
    for (const k of ownKeys(config)) url.searchParams.delete(k);
    own.forEach((v, k) => url.searchParams.set(k, v));
    const next = url.pathname + url.search + url.hash;
    if (next !== window.location.pathname + window.location.search + window.location.hash) {
      window.history.replaceState(null, "", next);
    }
    try {
      const qs = own.toString();
      if (qs) window.sessionStorage.setItem(storageKey, `?${qs}`);
      else window.sessionStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
  }, [state, restoredFor, storageKey, config]);

  const toggleSort = useCallback(
    (field: string) =>
      setState((s) =>
        s.sort === field
          ? { ...s, dir: s.dir === "asc" ? "desc" : "asc" }
          : { ...s, sort: field, dir: config.ascFields?.has(field) ? "asc" : "desc" },
      ),
    [config],
  );
  const setView = useCallback((view: ViewMode) => setState((s) => ({ ...s, view })), []);
  const setQ = useCallback((q: string) => setState((s) => ({ ...s, q })), []);
  const setFilter = useCallback(
    (key: string, value: string | null) =>
      setState((s) => {
        const filters = { ...s.filters };
        if (value) filters[key] = value;
        else delete filters[key];
        return { ...s, filters };
      }),
    [],
  );
  /** "Clear all": sort, search and filters back to the defaults (view mode kept). */
  const reset = useCallback(() => setState((s) => ({ ...defaultsOf(config), view: s.view })), [config]);

  const d = defaultsOf(config);
  const isFiltered = state.q.trim() !== "" || Object.keys(state.filters).length > 0;
  const canReset = isFiltered || state.sort !== d.sort || state.dir !== d.dir;

  return { ...state, toggleSort, setView, setQ, setFilter, reset, isFiltered, canReset };
}
