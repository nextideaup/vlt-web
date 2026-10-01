"use client";

// CUR-7: client view of the Insurance schedule. Fetches /api/paperwork/insurance
// and renders an itemized schedule grouped by module. Respects useHideValues()
// for screen rendering; print view always shows real values (with a warning
// next to the Print button).
//
// "Export PDF" button is a disabled placeholder here — wired by CUR-8.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useHideValues } from "@/lib/HideValuesContext";
import { itemHref, type ModuleSlug as ItemModuleSlug } from "@/lib/itemRoutes";

type ModuleSlug = "guitars" | "watches" | "automobiles" | "iod";
type InsuranceSource = "ai" | "alternate_from_user" | "user_override";

interface ScheduleItem {
  id: string;
  module: ModuleSlug;
  category: string;
  year: number | null;
  brand: string | null;
  model: string | null;
  description: string | null;
  condition: string | null;
  serial: string | null;
  insurance_value: number | null;
  insurance_value_source: InsuranceSource | null;
  insurance_value_date: string | null;
  primary_image_path: string | null;
  needs_valuation: boolean;
}

interface ModuleSummary {
  count: number;
  total: number;
}

interface ScheduleResponse {
  user: { name: string | null; email: string | null };
  generated_at: string;
  items: ScheduleItem[];
  summary: {
    item_count: number;
    total_insured_value: number;
    by_module: Record<ModuleSlug, ModuleSummary>;
  };
}

const MODULE_LABELS: Record<ModuleSlug, string> = {
  guitars: "Guitars",
  watches: "Watches",
  automobiles: "Automobiles",
  iod: "Collectibles",
};

const MODULE_ORDER: ModuleSlug[] = ["guitars", "watches", "automobiles", "iod"];

const SOURCE_LABELS: Record<InsuranceSource, string> = {
  ai: "AI",
  alternate_from_user: "Alt",
  user_override: "User-set",
};

const SOURCE_BADGE: Record<InsuranceSource, string> = {
  ai: "bg-accent/10 text-accent border-accent/30",
  alternate_from_user: "bg-amber-900/30 text-amber-300 border-amber-700/40",
  user_override: "bg-sky-900/30 text-sky-300 border-sky-700/40",
};

// Item references link to the item's page (STD-NAV-001): the item name, and
// the "Needs valuation" prompt (valuing happens on the item page). The API's
// module slug for collectibles is "iod"; its pages live under /collectibles.
const ITEM_MODULE: Record<ModuleSlug, ItemModuleSlug> = {
  guitars: "guitars",
  watches: "watches",
  automobiles: "automobiles",
  iod: "collectibles",
};

function formatMoney(value: number | null): string {
  if (value == null) return "—";
  return `$${Number(value).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default function InsuranceScheduleView() {
  const { hideValues } = useHideValues();
  const [data, setData] = useState<ScheduleResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/paperwork/insurance");
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to load schedule");
        const json: ScheduleResponse = await res.json();
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load schedule");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const handlePrint = () => window.print();

  async function handleExportPdf() {
    if (!data || data.items.length === 0) return;
    if (!confirm("This PDF will contain real dollar values for every insured item. Continue?")) return;
    setExporting(true);
    try {
      const res = await fetch("/api/paperwork/insurance/export", { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "PDF export failed");
      }
      const json: { pdf_url: string } = await res.json();
      // Open in a new tab; the URL is a 1-hour presigned R2 link (or a local
      // path in dev). The browser handles download / inline view based on
      // Content-Type.
      window.open(json.pdf_url, "_blank", "noopener,noreferrer");
    } catch (err) {
      console.error("PDF export failed", err);
      alert(err instanceof Error ? err.message : "PDF export failed");
    } finally {
      setExporting(false);
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="h-8 w-64 bg-surface-3 rounded animate-pulse mb-2" />
        <div className="h-4 w-96 bg-surface-3 rounded animate-pulse" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-text mb-2">Insurance Schedule</h1>
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    );
  }
  if (!data) return null;

  const empty = data.items.length === 0;

  // mask helper for screen rendering. Print view always shows real values.
  const maskValue = (n: number | null) => (hideValues ? "$•••" : formatMoney(n));

  // Group by module preserving the canonical order (guitars → watches → autos → iod).
  const grouped: Record<ModuleSlug, ScheduleItem[]> = {
    guitars: [],
    watches: [],
    automobiles: [],
    iod: [],
  };
  for (const item of data.items) grouped[item.module].push(item);

  return (
    <div className="p-8 max-w-5xl mx-auto print:p-0 print:max-w-none">
      {/* Header */}
      <div className="mb-6 print:mb-3">
        <p className="text-xs text-text-dim uppercase tracking-widest mb-1 print:hidden">The Paperwork</p>
        <h1 className="text-3xl font-bold text-text mb-1 print:text-2xl print:text-black">Insurance Schedule</h1>
        <p className="text-sm text-text-muted print:text-black">
          {data.user.name ?? data.user.email ?? "—"} · as of {formatDate(data.generated_at)}
        </p>
      </div>

      {/* Summary + actions */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3 print:hidden">
        <div className="flex items-center gap-6 text-sm">
          <div>
            <span className="text-text-dim">Items insured</span>{" "}
            <span className="font-mono font-semibold text-text">{data.summary.item_count}</span>
          </div>
          <div>
            <span className="text-text-dim">Total insured value</span>{" "}
            <span className="font-mono font-semibold text-text">{maskValue(data.summary.total_insured_value)}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-amber-400" title="Print view always shows real values regardless of the Hide Values toggle">
            ⓘ Print shows real values
          </span>
          <button
            onClick={handlePrint}
            disabled={empty}
            className="flex items-center gap-2 bg-surface-2 hover:bg-surface-3 border border-border text-text font-medium px-4 py-2 rounded-xl transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
            </svg>
            Print
          </button>
          <button
            onClick={handleExportPdf}
            disabled={empty || exporting}
            className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white font-medium px-4 py-2 rounded-xl text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {exporting ? (
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            )}
            {exporting ? "Generating…" : "Export PDF"}
          </button>
        </div>
      </div>

      {/* Empty state */}
      {empty && (
        <div className="border border-border rounded-2xl bg-surface-2 p-12 text-center print:hidden">
          <h2 className="text-lg font-semibold text-text mb-2">No items flagged for insurance yet</h2>
          <p className="text-sm text-text-muted max-w-md mx-auto mb-4">
            Open an item in any collection, edit it, and tick &ldquo;Include in insurance schedule.&rdquo; The next time you run an
            AI value on that item, an insurance value is computed automatically.
          </p>
          <div className="flex items-center gap-2 justify-center text-sm">
            <Link href="/guitars" className="text-accent hover:underline">Guitars</Link>
            <span className="text-text-dim">·</span>
            <Link href="/watches" className="text-accent hover:underline">Watches</Link>
            <span className="text-text-dim">·</span>
            <Link href="/automobiles" className="text-accent hover:underline">Automobiles</Link>
            <span className="text-text-dim">·</span>
            <Link href="/collectibles" className="text-accent hover:underline">Collectibles</Link>
          </div>
        </div>
      )}

      {/* Module groups */}
      {!empty &&
        MODULE_ORDER.map((mod) => {
          const items = grouped[mod];
          if (items.length === 0) return null;
          const sub = data.summary.by_module[mod];
          return (
            <section key={mod} className="mb-6 print:break-before-page first:print:break-before-auto">
              <div className="flex items-baseline justify-between border-b border-border pb-2 mb-3 print:border-black">
                <h2 className="text-lg font-semibold text-text print:text-black">{MODULE_LABELS[mod]}</h2>
                <div className="text-sm text-text-muted print:text-black">
                  {sub.count} item{sub.count !== 1 ? "s" : ""} · {maskValue(sub.total)}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wider text-text-muted border-b border-border print:text-black">
                      <th className="py-2 pr-3 print:py-1">Item</th>
                      <th className="py-2 px-3 print:py-1">Year</th>
                      <th className="py-2 px-3 print:py-1">Condition</th>
                      <th className="py-2 px-3 print:py-1">Serial</th>
                      <th className="py-2 px-3 text-right print:py-1">Insurance Value</th>
                      <th className="py-2 pl-3 text-right print:py-1">Last Valued</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id} className="border-b border-border last:border-b-0 align-top print:border-black/30">
                        <td className="py-2 pr-3 print:py-1">
                          <div className="flex items-start gap-3">
                            {/* thumbnail (small) */}
                            {item.primary_image_path ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={item.primary_image_path}
                                alt=""
                                className="w-10 h-10 rounded object-cover bg-surface-3 flex-shrink-0 print:hidden"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded bg-surface-3 flex-shrink-0 print:hidden" />
                            )}
                            <div className="min-w-0">
                              {/* Prints as plain text: black, no underline. */}
                              <Link
                                href={itemHref(ITEM_MODULE[item.module], item.id)}
                                className="block font-medium text-text hover:text-accent hover:underline underline-offset-2 truncate print:text-black print:no-underline"
                              >
                                {[item.brand, item.model].filter(Boolean).join(" ") || "—"}
                              </Link>
                              {item.description && (
                                <div className="text-xs text-text-muted truncate print:text-black">{item.description}</div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-2 px-3 text-text-muted print:text-black print:py-1">{item.year ?? "—"}</td>
                        <td className="py-2 px-3 text-text-muted print:text-black print:py-1">{item.condition || "—"}</td>
                        <td className="py-2 px-3 text-text-muted print:text-black font-mono text-xs print:py-1">{item.serial || "—"}</td>
                        <td className="py-2 px-3 text-right print:py-1">
                          {item.needs_valuation ? (
                            <Link
                              href={itemHref(ITEM_MODULE[item.module], item.id)}
                              className="inline-flex items-center text-xs text-amber-400 hover:text-amber-300 underline-offset-2 hover:underline print:text-black print:no-underline"
                            >
                              Needs valuation
                            </Link>
                          ) : (
                            <div className="inline-flex items-center gap-2">
                              {item.insurance_value_source && (
                                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${SOURCE_BADGE[item.insurance_value_source]} print:border-black print:bg-transparent print:text-black`}>
                                  {SOURCE_LABELS[item.insurance_value_source]}
                                </span>
                              )}
                              <span className="font-mono font-semibold text-text print:text-black">{maskValue(item.insurance_value)}</span>
                            </div>
                          )}
                        </td>
                        <td className="py-2 pl-3 text-right text-text-dim text-xs print:text-black print:py-1">
                          {formatDate(item.insurance_value_date) || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}

      {/* Footer / total */}
      {!empty && (
        <div className="mt-6 flex items-baseline justify-end gap-4 border-t border-border pt-4 print:border-black">
          <span className="text-sm text-text-muted print:text-black">Total Insured Value</span>
          <span className="text-2xl font-bold font-mono text-text print:text-black">
            {maskValue(data.summary.total_insured_value)}
          </span>
        </div>
      )}

      {/* Print-only CSS: hide everything outside the page; print background-free */}
      <style jsx global>{`
        @media print {
          body { background: white !important; color: black !important; }
          aside, header, nav { display: none !important; }
        }
      `}</style>
    </div>
  );
}
