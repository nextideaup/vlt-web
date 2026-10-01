"use client";

import { useState } from "react";
import { WatchItem, CONDITION_COLORS } from "@/lib/types";
import { useHideValues } from "@/lib/HideValuesContext";
import { useConfirm, permanentDeleteOptions } from "@/components/forms/ConfirmDialog";

interface WatchCardProps {
  item: WatchItem;
  onClick: () => void;
  onDelete: (id: string) => void;
  // Bulk-select props (CUR-6). Both optional.
  isSelected?: boolean;
  onSelectChange?: (id: string, selected: boolean) => void;
}

export default function WatchCard({ item, onClick, onDelete, isSelected, onSelectChange }: WatchCardProps) {
  const { hideValues } = useHideValues();
  const confirmDialog = useConfirm();
  const [deleting, setDeleting] = useState(false);
  const [imgError, setImgError] = useState(false);

  const primaryImage =
    item.images?.find((img) => img.is_primary) ?? item.images?.[0];

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!(await confirmDialog(permanentDeleteOptions(`"${item.brand} ${item.model}"`)))) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/watches/${item.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      onDelete(item.id);
    } catch (err) {
      console.error(err);
      alert("Failed to delete item.");
      setDeleting(false);
    }
  };

  return (
    <div
      className={`item-card group relative bg-surface border rounded-2xl overflow-hidden cursor-pointer hover:border-accent/40 hover:shadow-xl hover:shadow-black/30 transition-colors ${
        isSelected ? "border-accent ring-2 ring-accent/30" : "border-border"
      }`}
      onClick={onClick}
    >
      {/* Bulk-select checkbox (CUR-6) — only renders when wired by parent. */}
      {onSelectChange && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSelectChange(item.id, !isSelected);
          }}
          className={`absolute top-2 left-2 z-10 w-6 h-6 rounded-md border flex items-center justify-center transition-all ${
            isSelected
              ? "bg-accent border-accent text-white opacity-100"
              : "bg-black/40 backdrop-blur-sm border-white/30 text-transparent hover:text-white opacity-0 group-hover:opacity-100"
          }`}
          title={isSelected ? "Deselect" : "Select"}
          aria-pressed={isSelected ? "true" : "false"}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </button>
      )}

      {/* Image */}
      <div className="aspect-[4/3] bg-surface-2 relative overflow-hidden">
        {primaryImage && !imgError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={primaryImage.path}
            alt={`${item.brand} ${item.model}`}
            className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="image-placeholder absolute inset-0 flex items-center justify-center">
            <svg
              className="w-12 h-12 text-text-dim"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        )}

        {/* Insured badge (CUR-1 follow-up) */}
        {item.insure && (
          <div
            className="absolute bottom-2 left-2 bg-accent/90 backdrop-blur-sm text-white text-[10px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1"
            title="Included in The Paperwork → Insurance schedule"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
            </svg>
            Insured
          </div>
        )}

        {/* Image count badge */}
        {item.images && item.images.length > 1 && (
          <div className="absolute bottom-2 right-2 bg-black/60 backdrop-blur-sm text-white text-xs px-2 py-0.5 rounded-full">
            {item.images.length} photos
          </div>
        )}

        {/* Delete button */}
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="absolute top-2 right-2 w-7 h-7 bg-black/60 backdrop-blur-sm hover:bg-red-600/80 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-150 flex items-center justify-center"
          title="Delete item"
        >
          {deleting ? (
            <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
          )}
        </button>
      </div>

      {/* Info */}
      <div className="p-4">
        <h3 className="text-sm font-semibold text-text leading-tight mb-1">
          {[item.year, item.brand, item.model].filter(Boolean).join(" ")}
        </h3>
        {(item.dial_color || item.short_description) && (
          <p className="text-xs text-text-muted mb-3 leading-snug">
            {[item.dial_color, item.short_description].filter(Boolean).join(" · ")}
          </p>
        )}

        <div className="flex items-center justify-between mt-3">
          <span
            className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border ${CONDITION_COLORS[item.condition]}`}
          >
            {item.condition}
          </span>
          {(item.latest_ai_price != null || item.latest_user_price != null) ? (
            <div className="text-right">
              {(() => {
                const aiDate = item.latest_ai_price_date ? new Date(item.latest_ai_price_date) : null;
                const userDate = item.latest_user_price_date ? new Date(item.latest_user_price_date) : null;
                const showAI = item.latest_ai_price != null && (!userDate || !aiDate || aiDate >= userDate);
                const price = showAI ? item.latest_ai_price : item.latest_user_price;
                return (
                  <>
                    <span className="text-xs font-semibold text-text font-mono">
                      {hideValues
                        ? "$•••"
                        : `$${Number(price).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                    </span>
                    <span className={`block text-[10px] ${showAI ? "text-accent" : "text-text-dim"}`}>
                      {showAI ? "AI Est." : "My Value"}
                    </span>
                  </>
                );
              })()}
            </div>
          ) : item.purchase_price != null ? (
            <span className="text-xs text-text-muted font-mono">
              {hideValues
                ? "$•••"
                : `$${Number(item.purchase_price).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
