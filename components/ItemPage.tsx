"use client";

// Shared frame for the item detail pages (STD-NAV-002, VLT-43):
// /guitars/item/[id], /watches/item/[id], /automobiles/item/[id],
// /collectibles/item/[id]. Loads the item by id from the module's API (which
// enforces session + ownership and 404s anything that is not the caller's),
// renders the clickable breadcrumb (module › category › item) and a back link,
// and hands the loaded item to the module's detail component.

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  MODULE_API_BASE,
  MODULE_LABELS,
  categoryHref,
  type ModuleSlug,
} from "@/lib/itemRoutes";

interface ItemBase {
  id: string;
  category: string;
  latest_ai_price?: number | null;
  latest_ai_price_date?: string | null;
  latest_user_price?: number | null;
  latest_user_price_date?: string | null;
}

export interface ItemPageRenderArgs<T> {
  item: T;
  /** Item was deleted — leave the page for its category list. */
  onDelete: () => void;
  /** Merge an edited item (PATCH responses carry no valuation columns). */
  onItemUpdated: (updated: T) => void;
  onValuationSaved: (price: number, type: "ai" | "user") => void;
}

interface ItemPageProps<T extends ItemBase> {
  module: ModuleSlug;
  categoryLabels: Record<string, string>;
  /** Text for the breadcrumb's last segment and the document title. */
  titleOf: (item: T) => string;
  children: (args: ItemPageRenderArgs<T>) => ReactNode;
}

type LoadState = "loading" | "loaded" | "not-found" | "error";

export default function ItemPage<T extends ItemBase>({
  module,
  categoryLabels,
  titleOf,
  children,
}: ItemPageProps<T>) {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id ?? "");
  const [item, setItem] = useState<T | null>(null);
  const [state, setState] = useState<LoadState>("loading");

  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await fetch(`${MODULE_API_BASE[module]}/${encodeURIComponent(id)}`);
      if (res.status === 404 || res.status === 400) {
        setState("not-found");
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setItem((await res.json()) as T);
      setState("loaded");
    } catch (err) {
      console.error(err);
      setState("error");
    }
  }, [module, id]);

  useEffect(() => {
    load();
  }, [load]);

  const title = item ? titleOf(item) : "";
  useEffect(() => {
    if (title) document.title = `${title} · Vault 1`;
  }, [title]);

  const moduleLabel = MODULE_LABELS[module];
  const category = item?.category;
  const categoryLabel = category ? categoryLabels[category] ?? category : null;
  const listHref = category ? categoryHref(module, category) : `/${module}`;

  const onDelete = useCallback(() => {
    // replace, not push: Back must not land on the deleted item.
    router.replace(listHref);
  }, [router, listHref]);

  const onItemUpdated = useCallback((updated: T) => {
    setItem((prev) =>
      prev
        ? {
            ...updated,
            latest_ai_price: prev.latest_ai_price,
            latest_ai_price_date: prev.latest_ai_price_date,
            latest_user_price: prev.latest_user_price,
            latest_user_price_date: prev.latest_user_price_date,
          }
        : updated,
    );
  }, []);

  const onValuationSaved = useCallback((price: number, type: "ai" | "user") => {
    const now = new Date().toISOString();
    setItem((prev) => {
      if (!prev) return prev;
      return type === "ai"
        ? { ...prev, latest_ai_price: price, latest_ai_price_date: now }
        : { ...prev, latest_user_price: price, latest_user_price_date: now };
    });
  }, []);

  return (
    <div className="p-8 max-w-5xl">
      {/* Breadcrumb: module › category › item — every segment but the last navigates. */}
      <nav aria-label="Breadcrumb" className="mb-2">
        <ol className="flex flex-wrap items-center gap-2 text-sm text-text-muted">
          <li>
            <Link href={`/${module}`} className="hover:text-accent transition-colors">
              {moduleLabel}
            </Link>
          </li>
          {categoryLabel && category && (
            <>
              <Chevron />
              <li>
                <Link href={categoryHref(module, category)} className="hover:text-accent transition-colors">
                  {categoryLabel}
                </Link>
              </li>
            </>
          )}
          {title && (
            <>
              <Chevron />
              <li aria-current="page" className="text-text truncate max-w-[40ch]">
                {title}
              </li>
            </>
          )}
        </ol>
      </nav>

      <Link
        href={listHref}
        className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text transition-colors mb-5"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back to {categoryLabel ?? moduleLabel}
      </Link>

      {state === "loading" && (
        <div className="bg-surface border border-border rounded-2xl p-6 animate-pulse" aria-busy="true">
          <div className="h-7 bg-surface-3 rounded w-1/2 mb-6" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="aspect-[4/3] bg-surface-2 rounded-xl" />
            <div className="space-y-3">
              <div className="h-4 bg-surface-3 rounded w-3/4" />
              <div className="h-4 bg-surface-3 rounded w-1/2" />
              <div className="h-4 bg-surface-3 rounded w-2/3" />
            </div>
          </div>
        </div>
      )}

      {state === "not-found" && (
        <div className="bg-surface border border-border rounded-2xl p-10 text-center">
          <h1 className="text-xl font-semibold text-text mb-2">Item not found</h1>
          <p className="text-sm text-text-muted mb-6">
            This item doesn&apos;t exist, was deleted, or isn&apos;t in your vault.
          </p>
          <Link href={`/${module}`} className="text-sm text-accent hover:underline">
            Go to {moduleLabel}
          </Link>
        </div>
      )}

      {state === "error" && (
        <div role="alert" className="bg-surface border border-red-400/40 rounded-2xl p-10 text-center">
          <h1 className="text-xl font-semibold text-text mb-2">Couldn&apos;t load this item</h1>
          <p className="text-sm text-text-muted mb-6">Something went wrong. Check your connection and try again.</p>
          <button
            type="button"
            onClick={load}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-accent hover:bg-accent-hover text-white transition-colors"
          >
            Try again
          </button>
        </div>
      )}

      {state === "loaded" && item &&
        children({ item, onDelete, onItemUpdated, onValuationSaved })}
    </div>
  );
}

function Chevron() {
  return (
    <li aria-hidden="true">
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </li>
  );
}
