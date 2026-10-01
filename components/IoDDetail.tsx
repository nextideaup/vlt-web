"use client";

import { useState, useEffect, useCallback } from "react";
import { IoDItem, IoDImage, ComparableSale, CONDITION_COLORS, IOD_CATEGORY_LABELS } from "@/lib/types";
import { useHideValues } from "@/lib/HideValuesContext";
import EditIoDModal from "@/components/EditIoDModal";
import InsuranceValueRow from "@/components/InsuranceValueRow";
import SpecsSection from "@/components/forms/SpecsSection";
import ListForSaleSection from "@/components/ListForSaleSection";
import { iodConfig } from "@/lib/collections/iod";
import { useConfirm, permanentDeleteOptions } from "@/components/forms/ConfirmDialog";

interface IoDDetailProps {
  item: IoDItem;
  onDelete: (id: string) => void;
  onValuationSaved?: (price: number, type: "ai" | "user") => void;
  onItemUpdated?: (item: IoDItem) => void;
}

type ValuationStep = "idle" | "loading" | "results" | "error" | "manual";

interface IoDValuation {
  id: string;
  iod_id: string;
  valuation_type: "ai" | "user";
  price: number;
  notes: string | null;
  comparable_sales: ComparableSale[] | null;
  created_at: string;
}

interface AIResult {
  suggested_price: number;
  price_low: number;
  price_high: number;
  comparable_sales: ComparableSale[];
  analysis: string;
}

const fmtRaw = (v: number | null | undefined) => {
  if (v == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(Number(v));
};

const fmtDate = (d: string | null | undefined) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

export default function IoDDetail({
  item,
  onDelete,
  onValuationSaved,
  onItemUpdated,
}: IoDDetailProps) {
  const { hideValues } = useHideValues();
  const confirmDialog = useConfirm();
  const fmt = (v: number | null | undefined) => hideValues ? "$•••" : fmtRaw(v);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [imgErrors, setImgErrors] = useState<Record<number, boolean>>({});
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [showEditModal, setShowEditModal] = useState(false);

  const [valuations, setValuations] = useState<IoDValuation[]>([]);
  const [valuationsLoaded, setValuationsLoaded] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [valuationStep, setValuationStep] = useState<ValuationStep>("idle");
  const [aiResult, setAiResult] = useState<AIResult | null>(null);
  const [aiError, setAiError] = useState("");
  const [manualPrice, setManualPrice] = useState("");
  const [manualNotes, setManualNotes] = useState("");
  const [savingManual, setSavingManual] = useState(false);

  const images: IoDImage[] = item.images ?? [];
  const activeImage = images[activeImageIndex];

  const openLightbox = (index: number) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
  };

  const lightboxPrev = useCallback(() => {
    setLightboxIndex((i) => (i - 1 + images.length) % images.length);
  }, [images.length]);

  const lightboxNext = useCallback(() => {
    setLightboxIndex((i) => (i + 1) % images.length);
  }, [images.length]);

  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxOpen(false);
      if (e.key === "ArrowLeft") lightboxPrev();
      if (e.key === "ArrowRight") lightboxNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxOpen, lightboxPrev, lightboxNext]);

  useEffect(() => {
    async function loadValuations() {
      try {
        const res = await fetch(`/api/iod/${item.id}/valuations`);
        if (res.ok) {
          const data = await res.json();
          setValuations(data);
        }
      } catch {
        // non-critical
      } finally {
        setValuationsLoaded(true);
      }
    }
    loadValuations();
  }, [item.id]);

  const latestAI = valuations.find((v) => v.valuation_type === "ai");
  const latestUser = valuations.find((v) => v.valuation_type === "user");

  const handleDelete = async () => {
    if (!(await confirmDialog(permanentDeleteOptions(`"${item.short_description}"`)))) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/iod/${item.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      onDelete(item.id);
    } catch (err) {
      console.error(err);
      alert("Failed to delete item.");
      setDeleting(false);
    }
  };

  const runAIValuation = async () => {
    setValuationStep("loading");
    setAiError("");
    try {
      const res = await fetch(`/api/iod/${item.id}/value`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Valuation failed");
      }
      const data = await res.json();
      setAiResult(data);
      setValuations((prev) => [data.valuation, ...prev]);
      setValuationStep("results");
      onValuationSaved?.(data.suggested_price, "ai");
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Something went wrong");
      setValuationStep("error");
    }
  };

  const saveManualValuation = async () => {
    const price = parseFloat(manualPrice);
    if (!manualPrice || isNaN(price) || price <= 0) return;
    setSavingManual(true);
    try {
      const res = await fetch(`/api/iod/${item.id}/valuations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ price, notes: manualNotes || null }),
      });
      if (!res.ok) throw new Error("Failed to save");
      const saved: IoDValuation = await res.json();
      setValuations((prev) => [saved, ...prev]);
      setValuationStep("idle");
      setManualPrice("");
      setManualNotes("");
      onValuationSaved?.(price, "user");
    } catch (err) {
      console.error(err);
      alert("Failed to save valuation.");
    } finally {
      setSavingManual(false);
    }
  };

  return (
    <>
      <section
          className="bg-surface border border-border rounded-2xl w-full"
          aria-labelledby="item-detail-title"
      >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-surface z-10">
            <div>
              <p className="text-xs text-text-dim uppercase tracking-widest mb-0.5">
                {IOD_CATEGORY_LABELS[item.category]}
              </p>
              <h1 id="item-detail-title" className="text-lg font-bold text-text leading-snug max-w-[480px]">{item.short_description}</h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowEditModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-text-muted hover:text-text hover:bg-surface-3 border border-border transition-colors"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                </svg>
                Edit
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-400 hover:bg-red-900/20 border border-red-900/30 transition-colors disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>

          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left: Images */}
            <div>
              {images.length > 0 ? (
                <div>
                  <div
                    className="relative aspect-[4/3] bg-surface-2 rounded-xl overflow-hidden cursor-zoom-in"
                    onClick={() => openLightbox(activeImageIndex)}
                  >
                    {!imgErrors[activeImageIndex] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={activeImage?.path}
                        alt={item.short_description}
                        className="w-full h-full object-cover"
                        onError={() => setImgErrors((prev) => ({ ...prev, [activeImageIndex]: true }))}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center image-placeholder">
                        <svg className="w-12 h-12 text-text-dim" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 2l3 7h6l-5 4 2 7-6-4-6 4 2-7-5-4h6z" />
                        </svg>
                      </div>
                    )}
                  </div>
                  {images.length > 1 && (
                    <div className="flex gap-2 mt-2 overflow-x-auto pb-1">
                      {images.map((img, i) => (
                        <button
                          key={img.id}
                          onClick={() => setActiveImageIndex(i)}
                          className={`flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 transition-all ${
                            i === activeImageIndex ? "border-accent" : "border-transparent hover:border-border"
                          }`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={img.path} alt="" className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="aspect-[4/3] bg-surface-2 rounded-xl flex items-center justify-center image-placeholder">
                  <svg className="w-16 h-16 text-text-dim" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 2l3 7h6l-5 4 2 7-6-4-6 4 2-7-5-4h6z" />
                  </svg>
                </div>
              )}
            </div>

            {/* Right: Details */}
            <div className="space-y-4">
              {/* Condition + Insured badge */}
              <div className="flex items-center gap-2 flex-wrap">
                {item.condition && (
                  <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full border ${CONDITION_COLORS[item.condition]}`}>
                    {item.condition}
                  </span>
                )}
                {item.insure && (
                  <span
                    className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border bg-accent/10 text-accent border-accent/30"
                    title="Included in The Paperwork → Insurance schedule"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
                    </svg>
                    Insured
                  </span>
                )}
              </div>

              {/* Core details */}
              <div className="bg-surface-2 rounded-xl p-4 border border-border space-y-2.5">
                {item.brand && (
                  <div className="flex justify-between text-sm">
                    <span className="text-text-muted">Brand / Artist</span>
                    <span className="text-text font-medium">{item.brand}</span>
                  </div>
                )}
                {item.item_type && (
                  <div className="flex justify-between text-sm">
                    <span className="text-text-muted">Item Type</span>
                    <span className="text-text">{item.item_type}</span>
                  </div>
                )}
                {item.year != null && (
                  <div className="flex justify-between text-sm">
                    <span className="text-text-muted">Year</span>
                    <span className="text-text">{item.year}</span>
                  </div>
                )}
                {item.purchase_price != null && (
                  <div className="flex justify-between text-sm">
                    <span className="text-text-muted">Purchase Price</span>
                    <span className="text-text font-mono">{fmt(item.purchase_price)}</span>
                  </div>
                )}
                {item.purchase_source && (
                  <div className="flex justify-between text-sm">
                    <span className="text-text-muted">Source</span>
                    <span className="text-text">{item.purchase_source}</span>
                  </div>
                )}
                {item.purchase_date && (
                  <div className="flex justify-between text-sm">
                    <span className="text-text-muted">Purchase Date</span>
                    <span className="text-text">{fmtDate(item.purchase_date)}</span>
                  </div>
                )}
              </div>

              {item.long_description && (
                <p className="text-sm text-text-muted leading-relaxed">{item.long_description}</p>
              )}

              {item.provenance && (
                <div className="bg-surface-2 rounded-xl p-3 border border-border">
                  <p className="text-xs text-text-dim uppercase tracking-wider mb-1">Provenance</p>
                  <p className="text-sm text-text leading-relaxed">{item.provenance}</p>
                </div>
              )}

              {item.notes && (
                <div className="bg-surface-2 rounded-xl p-3 border border-border">
                  <p className="text-xs text-text-dim uppercase tracking-wider mb-1">Notes</p>
                  <p className="text-sm text-text leading-relaxed">{item.notes}</p>
                </div>
              )}
            </div>
          </div>

          {/* ── Specs Section ── */}
          <div className="mt-6 pt-6 border-t border-border px-6">
            <SpecsSection
              module="iod"
              itemId={item.id}
              specs={item.specs}
              specsUpdatedAt={item.specs_updated_at}
              template={iodConfig.specTemplate}
              onUpdated={(specs, specs_updated_at) =>
                onItemUpdated?.({ ...item, specs, specs_updated_at })
              }
            />
          </div>

          {/* ── Sell Section ── */}
          <div className="mt-6 pt-6 border-t border-border px-6">
            <ListForSaleSection module="iod" itemId={item.id} condition={item.condition} initialIntro={item.listing_intro} initialFooter={item.listing_footer} onIntroSaved={(v) => onItemUpdated?.({ ...item, listing_intro: v })} onFooterSaved={(v) => onItemUpdated?.({ ...item, listing_footer: v })} initialPackage={{ weight: item.package_weight_lb, length: item.package_length_in, width: item.package_width_in, height: item.package_height_in }} onPackageSaved={(p) => onItemUpdated?.({ ...item, package_weight_lb: p.weight, package_length_in: p.length, package_width_in: p.width, package_height_in: p.height })} initialSellPrice={item.listing_price} userPrice={item.latest_user_price} aiPrice={item.latest_ai_price} onSellPriceSaved={(v) => onItemUpdated?.({ ...item, listing_price: v })} />
          </div>

          {/* Valuation section */}
          <div className="px-6 pb-6 space-y-4 border-t border-border pt-5">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-text text-sm">Valuation</h3>
              <div className="flex items-center gap-2">
                {valuationsLoaded && valuations.length > 0 && (
                  <button
                    onClick={() => setShowHistory(!showHistory)}
                    className="text-xs text-text-dim hover:text-text transition-colors"
                  >
                    {showHistory ? "Hide History" : `Show History (${valuations.length})`}
                  </button>
                )}
              </div>
            </div>

            {/* Current values */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-surface-2 rounded-xl p-3 border border-border">
                <p className="text-xs text-text-dim mb-1">AI Estimate</p>
                <p className="text-lg font-bold text-accent">{fmt(latestAI?.price)}</p>
                {latestAI && (
                  <p className="text-xs text-text-dim mt-0.5">{fmtDate(latestAI.created_at)}</p>
                )}
              </div>
              <div className="bg-surface-2 rounded-xl p-3 border border-border">
                <p className="text-xs text-text-dim mb-1">My Value</p>
                <p className="text-lg font-bold text-text">{fmt(latestUser?.price)}</p>
                {latestUser && (
                  <p className="text-xs text-text-dim mt-0.5">{fmtDate(latestUser.created_at)}</p>
                )}
              </div>
            </div>

            {/* Insurance value (CUR-3) — renders only when item.insure is true. */}
            <InsuranceValueRow
              item={item}
              module="iod"
              onComputed={(fields) => onItemUpdated?.({ ...item, ...fields })}
            />

            {/* Valuation actions */}
            {valuationStep === "idle" && (
              <div className="flex gap-2">
                <button
                  onClick={runAIValuation}
                  className="flex-1 flex items-center justify-center gap-2 bg-accent hover:bg-accent-hover text-white font-medium px-4 py-2.5 rounded-xl transition-colors text-sm"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                  Get AI Estimate
                </button>
                <button
                  onClick={() => setValuationStep("manual")}
                  className="flex-1 bg-surface-2 hover:bg-surface-3 border border-border text-text font-medium px-4 py-2.5 rounded-xl transition-colors text-sm"
                >
                  Enter My Value
                </button>
              </div>
            )}

            {valuationStep === "loading" && (
              <div className="text-center py-6">
                <div className="w-10 h-10 rounded-full border-2 border-accent border-t-transparent animate-spin mx-auto mb-3" />
                <p className="text-sm text-text-muted">Researching market value...</p>
                <p className="text-xs text-text-dim mt-1">This may take 15–30 seconds</p>
              </div>
            )}

            {valuationStep === "error" && (
              <div className="bg-red-900/20 border border-red-700/30 rounded-xl p-4">
                <p className="text-sm text-red-400 mb-2">{aiError}</p>
                <div className="flex gap-2">
                  <button onClick={() => setValuationStep("idle")} className="text-xs text-text-dim hover:text-text">Cancel</button>
                  <button onClick={runAIValuation} className="text-xs text-accent hover:underline">Try Again</button>
                </div>
              </div>
            )}

            {valuationStep === "manual" && (
              <div className="space-y-3">
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted text-sm">$</span>
                  <input
                    type="number"
                    value={manualPrice}
                    onChange={(e) => setManualPrice(e.target.value)}
                    placeholder="Enter value"
                    min={0}
                    className="w-full bg-surface-2 border border-border text-text rounded-xl pl-8 pr-4 py-2.5 text-sm focus:border-accent focus:ring-1 focus:ring-accent outline-none"
                  />
                </div>
                <input
                  type="text"
                  value={manualNotes}
                  onChange={(e) => setManualNotes(e.target.value)}
                  placeholder="Notes (optional)"
                  className="w-full bg-surface-2 border border-border text-text rounded-xl px-4 py-2.5 text-sm focus:border-accent focus:ring-1 focus:ring-accent outline-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setValuationStep("idle")}
                    className="flex-1 bg-surface-2 border border-border text-text-muted font-medium px-4 py-2 rounded-xl text-sm hover:bg-surface-3 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveManualValuation}
                    disabled={savingManual || !manualPrice}
                    className="flex-1 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white font-medium px-4 py-2 rounded-xl text-sm transition-colors"
                  >
                    {savingManual ? "Saving..." : "Save Value"}
                  </button>
                </div>
              </div>
            )}

            {valuationStep === "results" && aiResult && (
              <div className="space-y-3">
                <div className="bg-surface-2 rounded-xl p-4 border border-border text-center">
                  <p className="text-xs text-text-dim mb-1">AI Estimate</p>
                  <p className="text-3xl font-bold text-accent">{fmt(aiResult.suggested_price)}</p>
                  <p className="text-xs text-text-dim mt-1">Range: {fmt(aiResult.price_low)} – {fmt(aiResult.price_high)}</p>
                </div>
                {aiResult.analysis && (
                  <p className="text-xs text-text-muted leading-relaxed">{aiResult.analysis}</p>
                )}
                <button
                  onClick={() => setValuationStep("idle")}
                  className="w-full bg-surface-2 border border-border text-text font-medium py-2 rounded-xl text-sm hover:bg-surface-3 transition-colors"
                >
                  Done
                </button>
              </div>
            )}

            {/* History */}
            {showHistory && valuations.length > 0 && (
              <div className="space-y-2 pt-2">
                <p className="text-xs text-text-dim uppercase tracking-wider">History</p>
                {valuations.map((v) => (
                  <div key={v.id} className="flex items-center justify-between bg-surface-2 rounded-lg px-3 py-2 border border-border">
                    <div>
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                        v.valuation_type === "ai"
                          ? "bg-accent/10 text-accent"
                          : "bg-surface-3 text-text-dim"
                      }`}>
                        {v.valuation_type === "ai" ? "AI" : "Manual"}
                      </span>
                      <span className="text-xs text-text-dim ml-2">{fmtDate(v.created_at)}</span>
                    </div>
                    <span className="text-sm font-mono font-medium text-text">{fmt(v.price)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

      {showEditModal && (
        <EditIoDModal
          item={item}
          onClose={() => setShowEditModal(false)}
          onItemUpdated={(updated) => {
            setShowEditModal(false);
            onItemUpdated?.(updated);
          }}
        />
      )}

      {/* Lightbox */}
      {lightboxOpen && images.length > 0 && (
        <div
          className="fixed inset-0 z-[60] bg-black/95 flex items-center justify-center"
          onClick={() => setLightboxOpen(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={images[lightboxIndex]?.path}
            alt={item.short_description}
            className="max-w-[90vw] max-h-[90vh] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          {images.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); lightboxPrev(); }}
                className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/60 hover:bg-black/80 text-white rounded-full flex items-center justify-center"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); lightboxNext(); }}
                className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/60 hover:bg-black/80 text-white rounded-full flex items-center justify-center"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </button>
            </>
          )}
          <button
            aria-label="Close"
            onClick={() => setLightboxOpen(false)}
            className="absolute top-4 right-4 w-10 h-10 bg-black/60 hover:bg-black/80 text-white rounded-full flex items-center justify-center"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </>
  );
}
