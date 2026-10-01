"use client";

import { useState, useEffect, useCallback } from "react";
import { GuitarItem, GuitarImage, GuitarValuation, ComparableSale, CONDITION_COLORS, CATEGORY_LABELS } from "@/lib/types";
import { useHideValues } from "@/lib/HideValuesContext";
import EditItemModal from "@/components/EditItemModal";
import InsuranceValueRow from "@/components/InsuranceValueRow";
import SpecsSection from "@/components/forms/SpecsSection";
import ListForSaleSection from "@/components/ListForSaleSection";
import { guitarConfig } from "@/lib/collections/guitar";
import { useConfirm, permanentDeleteOptions } from "@/components/forms/ConfirmDialog";

interface GuitarDetailProps {
  item: GuitarItem;
  onDelete: (id: string) => void;
  onValuationSaved?: (price: number, type: "ai" | "user") => void;
  onItemUpdated?: (item: GuitarItem) => void;
}

type ValuationStep = "idle" | "loading" | "results" | "error" | "manual";

interface AIResult {
  suggested_price: number;
  price_low: number;
  price_high: number;
  comparable_sales: ComparableSale[];
  analysis: string;
}

export default function GuitarDetail({
  item,
  onDelete,
  onValuationSaved,
  onItemUpdated,
}: GuitarDetailProps) {
  const { hideValues } = useHideValues();
  const confirmDialog = useConfirm();
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [imgErrors, setImgErrors] = useState<Record<number, boolean>>({});
  const [showEditModal, setShowEditModal] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // Valuations state
  const [valuations, setValuations] = useState<GuitarValuation[]>([]);
  const [valuationsLoaded, setValuationsLoaded] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [valuationStep, setValuationStep] = useState<ValuationStep>("idle");
  const [aiResult, setAiResult] = useState<AIResult | null>(null);
  const [aiError, setAiError] = useState("");
  const [manualPrice, setManualPrice] = useState("");
  const [manualNotes, setManualNotes] = useState("");
  const [savingManual, setSavingManual] = useState(false);

  const images: GuitarImage[] = item.images ?? [];
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
        const res = await fetch(`/api/guitars/${item.id}/valuations`);
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
    if (!(await confirmDialog(permanentDeleteOptions(`"${item.brand} ${item.model}"`)))) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/guitars/${item.id}`, { method: "DELETE" });
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
      const res = await fetch(`/api/guitars/${item.id}/value`, { method: "POST" });
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
      const res = await fetch(`/api/guitars/${item.id}/valuations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ price, notes: manualNotes || null }),
      });
      if (!res.ok) throw new Error("Failed to save");
      const saved: GuitarValuation = await res.json();
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

  const formatPrice = (price: number | null) => {
    if (price == null) return null;
    if (hideValues) return "$•••";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(price);
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

  const formatDateShort = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

  return (
    <>
    <section
        className="bg-surface border border-border rounded-2xl w-full"
        aria-labelledby="item-detail-title"
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-border">
          <div>
            <div className="flex items-center gap-2 text-sm text-text-muted mb-1">
              <span>{CATEGORY_LABELS[item.category]}</span>
            </div>
            <h1 id="item-detail-title" className="text-2xl font-bold text-text">
              {[item.year, item.brand, item.model].filter(Boolean).join(" ")}
            </h1>
            {(item.color_finish || item.short_description) && (
              <p className="text-text-muted text-sm mt-0.5">
                {[item.color_finish, item.short_description].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 ml-4 flex-shrink-0">
            <button
              onClick={() => setShowEditModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm text-text-muted hover:text-text hover:bg-surface-3 border border-transparent hover:border-border transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
              </svg>
              Edit
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-colors disabled:opacity-50"
            >
              {deleting ? (
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              ) : (
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
              )}
              Delete
            </button>
          </div>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Images */}
            <div>
              <div
                className={`aspect-[4/3] bg-surface-2 rounded-xl overflow-hidden border border-border relative group ${activeImage && !imgErrors[activeImageIndex] ? "cursor-zoom-in" : ""}`}
                onClick={() => activeImage && !imgErrors[activeImageIndex] && openLightbox(activeImageIndex)}
              >
                {activeImage && !imgErrors[activeImageIndex] ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={activeImage.path}
                      alt={`${item.brand} ${item.model}`}
                      className="absolute inset-0 w-full h-full object-contain"
                      onError={() => setImgErrors((prev) => ({ ...prev, [activeImageIndex]: true }))}
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                      <svg className="w-8 h-8 text-white opacity-0 group-hover:opacity-80 transition-opacity drop-shadow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM10.5 7.5v6m3-3h-6" />
                      </svg>
                    </div>
                  </>
                ) : (
                  <div className="image-placeholder absolute inset-0 flex flex-col items-center justify-center gap-2">
                    <svg className="w-16 h-16 text-text-dim" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
                    </svg>
                    <p className="text-sm text-text-dim">No image</p>
                  </div>
                )}
              </div>

              {images.length > 1 && (
                <div className="flex gap-2 mt-3 flex-wrap">
                  {images.map((img, i) => (
                    <button
                      key={img.id}
                      onClick={() => setActiveImageIndex(i)}
                      className={`w-14 h-14 rounded-lg overflow-hidden border-2 transition-colors flex-shrink-0 relative ${
                        activeImageIndex === i ? "border-accent" : "border-border hover:border-border-2"
                      }`}
                    >
                      {!imgErrors[i] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={img.path}
                          alt={`Thumbnail ${i + 1}`}
                          className="absolute inset-0 w-full h-full object-cover"
                          onError={() => setImgErrors((prev) => ({ ...prev, [i]: true }))}
                        />
                      ) : (
                        <div className="w-full h-full bg-surface-3 flex items-center justify-center">
                          <svg className="w-5 h-5 text-text-dim" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                          </svg>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Details */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`inline-flex items-center text-sm font-medium px-3 py-1 rounded-full border ${CONDITION_COLORS[item.condition]}`}>
                  {item.condition}
                </span>
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

              <div className="space-y-3">
                {item.year && <DetailRow label="Year" value={String(item.year)} />}
                {item.serial_number && <DetailRow label="Serial Number" value={item.serial_number} mono />}
                {item.purchase_price != null && (
                  <DetailRow label="Purchase Price" value={formatPrice(item.purchase_price) ?? ""} />
                )}
                {item.purchase_source && <DetailRow label="Purchased From" value={item.purchase_source} />}
                {item.link && (
                  <div className="flex items-start gap-3">
                    <span className="text-sm text-text-muted w-32 flex-shrink-0 mt-0.5">Link</span>
                    <a href={item.link} target="_blank" rel="noopener noreferrer" className="text-sm text-accent hover:text-accent-hover underline underline-offset-2 break-all">
                      {item.link}
                    </a>
                  </div>
                )}
              </div>

              {item.notes && (
                <div className="bg-surface-2 rounded-xl p-4 border border-border">
                  <p className="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">Notes</p>
                  <p className="text-sm text-text whitespace-pre-wrap">{item.notes}</p>
                </div>
              )}

              <div className="pt-3 border-t border-border space-y-1">
                <p className="text-xs text-text-dim">Added {formatDate(item.created_at)}</p>
                {item.updated_at !== item.created_at && (
                  <p className="text-xs text-text-dim">Updated {formatDate(item.updated_at)}</p>
                )}
              </div>
            </div>
          </div>

          {/* ── Specs Section ── */}
          <div className="mt-6 pt-6 border-t border-border">
            <SpecsSection
              module="guitars"
              itemId={item.id}
              specs={item.specs}
              specsUpdatedAt={item.specs_updated_at}
              template={guitarConfig.specTemplate}
              onUpdated={(specs, specs_updated_at) =>
                onItemUpdated?.({ ...item, specs, specs_updated_at })
              }
            />
          </div>

          {/* ── Sell Section ── */}
          <div className="mt-6 pt-6 border-t border-border">
            <ListForSaleSection module="guitars" itemId={item.id} condition={item.condition} initialIntro={item.listing_intro} initialFooter={item.listing_footer} onIntroSaved={(v) => onItemUpdated?.({ ...item, listing_intro: v })} onFooterSaved={(v) => onItemUpdated?.({ ...item, listing_footer: v })} initialPackage={{ weight: item.package_weight_lb, length: item.package_length_in, width: item.package_width_in, height: item.package_height_in }} onPackageSaved={(p) => onItemUpdated?.({ ...item, package_weight_lb: p.weight, package_length_in: p.length, package_width_in: p.width, package_height_in: p.height })} initialSellPrice={item.listing_price} userPrice={item.latest_user_price} aiPrice={item.latest_ai_price} onSellPriceSaved={(v) => onItemUpdated?.({ ...item, listing_price: v })} />
          </div>

          {/* ── Valuation Section ── */}
          <div className="mt-6 pt-6 border-t border-border">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-text uppercase tracking-wider">Valuation</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setValuationStep(valuationStep === "manual" ? "idle" : "manual")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-text-muted hover:text-text hover:bg-surface-3 border border-border transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                  </svg>
                  My Value
                </button>
                <button
                  onClick={runAIValuation}
                  disabled={valuationStep === "loading"}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-accent/10 text-accent hover:bg-accent/20 border border-accent/20 transition-colors disabled:opacity-50"
                >
                  {valuationStep === "loading" ? (
                    <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                    </svg>
                  )}
                  {valuationStep === "loading" ? "Researching…" : "AI Value"}
                </button>
              </div>
            </div>

            {/* Current values summary */}
            {valuationsLoaded && (latestAI || latestUser) && (
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-surface-2 rounded-xl p-4 border border-border">
                  <div className="flex items-center gap-1.5 mb-1">
                    <svg className="w-3.5 h-3.5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                    </svg>
                    <span className="text-xs text-text-muted font-medium">AI Estimate</span>
                  </div>
                  {latestAI ? (
                    <>
                      <p className="text-xl font-bold text-text">{formatPrice(latestAI.price)}</p>
                      <p className="text-xs text-text-dim mt-0.5">{formatDateShort(latestAI.created_at)}</p>
                    </>
                  ) : (
                    <p className="text-sm text-text-dim mt-1">Not valued yet</p>
                  )}
                </div>
                <div className="bg-surface-2 rounded-xl p-4 border border-border">
                  <div className="flex items-center gap-1.5 mb-1">
                    <svg className="w-3.5 h-3.5 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                    </svg>
                    <span className="text-xs text-text-muted font-medium">My Value</span>
                  </div>
                  {latestUser ? (
                    <>
                      <p className="text-xl font-bold text-text">{formatPrice(latestUser.price)}</p>
                      <p className="text-xs text-text-dim mt-0.5">{formatDateShort(latestUser.created_at)}</p>
                    </>
                  ) : (
                    <p className="text-sm text-text-dim mt-1">Not set</p>
                  )}
                </div>
              </div>
            )}

            {/* Insurance value (CUR-3) — renders only when item.insure is true. */}
            <InsuranceValueRow
              item={item}
              module="guitars"
              onComputed={(fields) => onItemUpdated?.({ ...item, ...fields })}
            />

            {/* AI loading */}
            {valuationStep === "loading" && (
              <div className="bg-surface-2 rounded-xl p-5 border border-border text-center">
                <div className="w-8 h-8 rounded-full border-2 border-accent border-t-transparent animate-spin mx-auto mb-3" />
                <p className="text-sm text-text">Searching eBay & Reverb for comparable sales…</p>
                <p className="text-xs text-text-dim mt-1">This may take 15–30 seconds</p>
              </div>
            )}

            {/* AI error */}
            {valuationStep === "error" && (
              <div className="bg-red-500/5 rounded-xl p-4 border border-red-500/20 flex items-start gap-3">
                <svg className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                <div>
                  <p className="text-sm text-red-400 font-medium">Valuation failed</p>
                  <p className="text-xs text-text-muted mt-0.5">{aiError}</p>
                </div>
              </div>
            )}

            {/* AI results */}
            {valuationStep === "results" && aiResult && (
              <div className="bg-surface-2 rounded-xl p-4 border border-border space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-text-muted mb-0.5">New AI Estimate</p>
                    <p className="text-2xl font-bold text-text">{formatPrice(aiResult.suggested_price)}</p>
                    <p className="text-xs text-text-muted">Range: {formatPrice(aiResult.price_low)} – {formatPrice(aiResult.price_high)}</p>
                  </div>
                  <button aria-label="Close" onClick={() => setValuationStep("idle")} className="text-text-dim hover:text-text">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <p className="text-xs text-text-muted leading-relaxed">{aiResult.analysis}</p>
                {aiResult.comparable_sales?.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <p className="text-xs font-medium text-text-muted uppercase tracking-wider">Comparable Sales</p>
                    {aiResult.comparable_sales.map((sale, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 bg-surface-3 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`text-xs font-medium px-1.5 py-0.5 rounded flex-shrink-0 ${
                            sale.source === "eBay"
                              ? "bg-yellow-500/10 text-yellow-400"
                              : "bg-teal-500/10 text-teal-400"
                          }`}>{sale.source}</span>
                          {sale.listing_type === "for_sale" ? (
                            <span className="text-xs font-medium px-1.5 py-0.5 rounded flex-shrink-0 bg-orange-500/10 text-orange-400">For Sale</span>
                          ) : sale.listing_type === "sold" ? (
                            <span className="text-xs font-medium px-1.5 py-0.5 rounded flex-shrink-0 bg-green-500/10 text-green-400">Sold</span>
                          ) : null}
                          {sale.url ? (
                            <a href={sale.url} target="_blank" rel="noopener noreferrer" className="text-xs text-text hover:text-accent truncate">{sale.title}</a>
                          ) : (
                            <span className="text-xs text-text truncate">{sale.title}</span>
                          )}
                        </div>
                        <span className="text-xs font-semibold text-text flex-shrink-0">{formatPrice(sale.price)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Manual entry */}
            {valuationStep === "manual" && (
              <div className="bg-surface-2 rounded-xl p-4 border border-border space-y-3">
                <p className="text-sm font-medium text-text">Enter Your Valuation</p>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm">$</span>
                  <input
                    type="number"
                    value={manualPrice}
                    onChange={(e) => setManualPrice(e.target.value)}
                    placeholder="0"
                    min={0}
                    step="1"
                    className="w-full bg-surface border border-border text-text rounded-xl pl-7 pr-4 py-2.5 text-sm focus:border-accent focus:ring-1 focus:ring-accent outline-none"
                  />
                </div>
                <textarea
                  value={manualNotes}
                  onChange={(e) => setManualNotes(e.target.value)}
                  placeholder="Notes (optional)…"
                  rows={2}
                  className="w-full bg-surface border border-border text-text rounded-xl px-4 py-2.5 text-sm focus:border-accent focus:ring-1 focus:ring-accent outline-none resize-none"
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setValuationStep("idle"); setManualPrice(""); setManualNotes(""); }}
                    className="flex-1 py-2 rounded-xl text-sm text-text-muted hover:text-text hover:bg-surface-3 border border-border transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveManualValuation}
                    disabled={savingManual || !manualPrice}
                    className="flex-1 py-2 rounded-xl text-sm font-medium bg-accent hover:bg-accent-hover text-white transition-colors disabled:opacity-50"
                  >
                    {savingManual ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            )}

            {/* History toggle */}
            {valuationsLoaded && valuations.length > 0 && (
              <div className="mt-4">
                <button
                  onClick={() => setShowHistory(!showHistory)}
                  className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text transition-colors"
                >
                  <svg className={`w-3.5 h-3.5 transition-transform ${showHistory ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                  {showHistory ? "Hide" : "Show"} valuation history ({valuations.length})
                </button>
                {showHistory && (
                  <div className="mt-3 space-y-2">
                    {valuations.map((v) => (
                      <div key={v.id} className="flex items-start justify-between gap-3 bg-surface-2 rounded-lg px-4 py-3 border border-border">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-medium px-1.5 py-0.5 rounded-md border ${
                            v.valuation_type === "ai"
                              ? "bg-accent/10 text-accent border-accent/20"
                              : "bg-surface-3 text-text-muted border-border"
                          }`}>
                            {v.valuation_type === "ai" ? "AI" : "You"}
                          </span>
                          <span className="text-xs text-text-dim">{formatDateShort(v.created_at)}</span>
                        </div>
                        <span className="text-sm font-semibold text-text">{formatPrice(v.price)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

    {showEditModal && (
      <EditItemModal
        item={{ ...item, images: images }}
        onClose={() => setShowEditModal(false)}
        onItemUpdated={(updated) => {
          setShowEditModal(false);
          onItemUpdated?.(updated);
        }}
      />
    )}

    {lightboxOpen && images.length > 0 && (
      <div
        className="fixed inset-0 z-[70] flex items-center justify-center"
        style={{ backgroundColor: "rgba(0,0,0,0.93)" }}
        onClick={() => setLightboxOpen(false)}
      >
        {/* Close */}
        <button
          aria-label="Close"
          className="absolute top-4 right-4 w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
          onClick={() => setLightboxOpen(false)}
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Prev */}
        {images.length > 1 && (
          <button
            className="absolute left-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
            onClick={(e) => { e.stopPropagation(); lightboxPrev(); }}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}

        {/* Image */}
        <div
          className="max-w-[90vw] max-h-[85vh] flex items-center justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={images[lightboxIndex]?.path}
            alt={`${item.brand} ${item.model} — photo ${lightboxIndex + 1}`}
            className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl"
          />
        </div>

        {/* Next */}
        {images.length > 1 && (
          <button
            className="absolute right-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
            onClick={(e) => { e.stopPropagation(); lightboxNext(); }}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}

        {/* Dot indicators */}
        {images.length > 1 && (
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-2">
            {images.map((_, i) => (
              <button
                key={i}
                onClick={(e) => { e.stopPropagation(); setLightboxIndex(i); }}
                className={`w-2 h-2 rounded-full transition-all ${
                  i === lightboxIndex ? "bg-white scale-125" : "bg-white/40 hover:bg-white/70"
                }`}
              />
            ))}
          </div>
        )}

        {/* Counter */}
        {images.length > 1 && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/60 text-sm">
            {lightboxIndex + 1} / {images.length}
          </div>
        )}
      </div>
    )}
    </>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-sm text-text-muted w-32 flex-shrink-0">{label}</span>
      <span className={`text-sm text-text ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}
