"use client";

import { useState } from "react";
import { WatchItem, ComparableSale } from "@/lib/types";
import { useHideValues } from "@/lib/HideValuesContext";

interface WatchValuationPromptModalProps {
  item: WatchItem;
  onClose: () => void;
  onValuationComplete?: (price: number) => void;
}

type Step = "prompt" | "loading" | "results" | "error";

interface ValuationResult {
  suggested_price: number;
  price_low: number;
  price_high: number;
  comparable_sales: ComparableSale[];
  analysis: string;
}

const SALES_PER_PAGE = 5;

export default function WatchValuationPromptModal({
  item,
  onClose,
  onValuationComplete,
}: WatchValuationPromptModalProps) {
  const [step, setStep] = useState<Step>("prompt");
  const [result, setResult] = useState<ValuationResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [salesPage, setSalesPage] = useState(0);

  const runValuation = async () => {
    setStep("loading");
    try {
      const res = await fetch(`/api/watches/${item.id}/value`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Valuation failed");
      }
      const data = await res.json();
      setResult(data);
      setStep("results");
      onValuationComplete?.(data.suggested_price);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong");
      setStep("error");
    }
  };

  const { hideValues } = useHideValues();
  const formatPrice = (n: number) =>
    hideValues ? "$•••" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);

  const itemName = [item.year, item.brand, item.model].filter(Boolean).join(" ");

  return (
    <div
      className="modal-backdrop fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto"
      style={{ backgroundColor: "rgba(0,0,0,0.8)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <div
        className="modal-content bg-surface border border-border rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh] my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Prompt Step */}
        {step === "prompt" && (
          <div className="p-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mx-auto mb-5">
              <svg className="w-7 h-7 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-text mb-2">Get AI Value Estimate?</h2>
            <p className="text-text-muted text-sm mb-1">
              <span className="text-text font-medium">{itemName}</span> has been added to your collection.
            </p>
            <p className="text-text-muted text-sm mb-8">
              Would you like an AI-powered resale value estimate? We&apos;ll search Chrono24, WatchBox & eBay for comparable watch sales.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl text-sm font-medium text-text-muted hover:text-text hover:bg-surface-3 transition-colors border border-border"
              >
                Skip for Now
              </button>
              <button
                onClick={runValuation}
                className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white font-medium px-6 py-2.5 rounded-xl transition-colors text-sm"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
                Get Value Estimate
              </button>
            </div>
          </div>
        )}

        {/* Loading Step */}
        {step === "loading" && (
          <div className="p-10 text-center">
            <div className="w-14 h-14 rounded-full border-2 border-accent border-t-transparent animate-spin mx-auto mb-6" />
            <h2 className="text-lg font-bold text-text mb-2">Researching Market Value</h2>
            <p className="text-text-muted text-sm">
              Searching Chrono24 & eBay for comparable watch sales of{" "}
              <span className="text-text">{itemName}</span>…
            </p>
            <p className="text-text-dim text-xs mt-3">This may take 15–30 seconds</p>
          </div>
        )}

        {/* Error Step */}
        {step === "error" && (
          <div className="p-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-5">
              <svg className="w-7 h-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-text mb-2">Valuation Failed</h2>
            <p className="text-text-muted text-sm mb-6">{errorMsg}</p>
            <div className="flex gap-3 justify-center">
              <button onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm font-medium text-text-muted hover:text-text hover:bg-surface-3 transition-colors border border-border">
                Close
              </button>
              <button onClick={runValuation} className="bg-accent hover:bg-accent-hover text-white font-medium px-5 py-2.5 rounded-xl transition-colors text-sm">
                Try Again
              </button>
            </div>
          </div>
        )}

        {/* Results Step */}
        {step === "results" && result && (() => {
          const sales = result.comparable_sales ?? [];
          const totalPages = Math.ceil(sales.length / SALES_PER_PAGE);
          const pageSales = sales.slice(salesPage * SALES_PER_PAGE, (salesPage + 1) * SALES_PER_PAGE);
          return (
            <>
              <div className="px-6 py-5 border-b border-border flex items-start justify-between flex-shrink-0">
                <div>
                  <div className="flex items-center gap-2 text-xs text-text-muted mb-1">
                    <span className="inline-flex items-center gap-1 bg-accent/10 text-accent px-2 py-0.5 rounded-full text-xs font-medium border border-accent/20">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                      </svg>
                      AI Estimate
                    </span>
                  </div>
                  <h2 className="text-xl font-bold text-text">{itemName}</h2>
                </div>
                <button aria-label="Close" onClick={onClose} className="w-9 h-9 rounded-xl hover:bg-surface-3 text-text-muted hover:text-text transition-colors flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="overflow-y-auto flex-1 p-6 space-y-5">
                <div className="bg-surface-2 rounded-xl p-5 border border-border text-center">
                  <p className="text-sm text-text-muted mb-1">Estimated Resale Value</p>
                  <p className="text-4xl font-bold text-text">{formatPrice(result.suggested_price)}</p>
                  <p className="text-sm text-text-muted mt-1">
                    Range: {formatPrice(result.price_low)} – {formatPrice(result.price_high)}
                  </p>
                </div>

                <div className="bg-surface-2 rounded-xl p-4 border border-border">
                  <p className="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">Analysis</p>
                  <p className="text-sm text-text leading-relaxed">{result.analysis}</p>
                </div>

                {sales.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-medium text-text-muted uppercase tracking-wider">Comparable Sales</p>
                      {sales.length > SALES_PER_PAGE && (
                        <span className="text-xs text-text-dim">
                          {salesPage * SALES_PER_PAGE + 1}–{Math.min((salesPage + 1) * SALES_PER_PAGE, sales.length)} of {sales.length}
                        </span>
                      )}
                    </div>
                    <div className="space-y-2">
                      {pageSales.map((sale, i) => (
                        <div key={i} className="flex items-start justify-between gap-3 bg-surface-2 rounded-xl px-4 py-3 border border-border">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className={`text-xs font-medium px-1.5 py-0.5 rounded-md ${
                                sale.source === "eBay" ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
                                : sale.source === "Chrono24" ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                                : "bg-teal-500/10 text-teal-400 border border-teal-500/20"
                              }`}>{sale.source}</span>
                              {sale.listing_type === "for_sale" && <span className="text-xs font-medium px-1.5 py-0.5 rounded-md bg-orange-500/10 text-orange-400 border border-orange-500/20">For Sale</span>}
                              {sale.listing_type === "sold" && <span className="text-xs font-medium px-1.5 py-0.5 rounded-md bg-green-500/10 text-green-400 border border-green-500/20">Sold</span>}
                              {sale.condition && <span className="text-xs text-text-dim">{sale.condition}</span>}
                            </div>
                            {sale.url ? (
                              <a href={sale.url} target="_blank" rel="noopener noreferrer" className="text-sm text-text hover:text-accent transition-colors line-clamp-1">{sale.title}</a>
                            ) : (
                              <p className="text-sm text-text line-clamp-1">{sale.title}</p>
                            )}
                            {sale.date && <p className="text-xs text-text-dim mt-0.5">{sale.date}</p>}
                          </div>
                          <span className="text-sm font-semibold text-text flex-shrink-0">{formatPrice(sale.price)}</span>
                        </div>
                      ))}
                    </div>
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between mt-3">
                        <button onClick={() => setSalesPage(p => p - 1)} disabled={salesPage === 0} className="flex items-center gap-1 text-xs text-text-dim hover:text-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors px-2 py-1 rounded-lg hover:bg-surface-3">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                          Previous
                        </button>
                        <div className="flex gap-1">
                          {Array.from({ length: totalPages }, (_, i) => (
                            <button key={i} onClick={() => setSalesPage(i)} className={`w-6 h-6 rounded text-xs font-medium transition-colors ${i === salesPage ? "bg-accent text-on-primary" : "text-text-dim hover:text-text hover:bg-surface-3"}`}>{i + 1}</button>
                          ))}
                        </div>
                        <button onClick={() => setSalesPage(p => p + 1)} disabled={salesPage >= totalPages - 1} className="flex items-center gap-1 text-xs text-text-dim hover:text-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors px-2 py-1 rounded-lg hover:bg-surface-3">
                          Next
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="px-6 py-4 border-t border-border flex-shrink-0">
                <button onClick={onClose} className="w-full bg-accent hover:bg-accent-hover text-white font-medium py-2.5 rounded-xl transition-colors text-sm">Done</button>
              </div>
            </>
          );
        })()}
      </div>
    </div>
  );
}
