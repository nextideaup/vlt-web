"use client";

import { useState } from "react";
import { WatchPursuit, WATCH_SOURCES, PursuitStatus } from "@/lib/types";
import { useConfirm, permanentDeleteOptions } from "@/components/forms/ConfirmDialog";

interface EditWatchPursuitModalProps {
  pursuit: WatchPursuit;
  onClose: () => void;
  onSaved: (p: WatchPursuit) => void;
  onDeleted: () => void;
}

const inputClass =
  "bg-surface-2 border border-border rounded px-3 py-2 text-sm text-text w-full focus:outline-none focus:border-accent";
const labelClass =
  "text-xs uppercase tracking-widest text-text-dim font-label mb-1.5 block";

export default function EditWatchPursuitModal({
  pursuit,
  onClose,
  onSaved,
  onDeleted,
}: EditWatchPursuitModalProps) {
  const [form, setForm] = useState({
    brand: pursuit.brand ?? "",
    model: pursuit.model ?? "",
    reference_number: pursuit.reference_number ?? "",
    case_diameter: pursuit.case_diameter ?? "",
    dial_color: pursuit.dial_color ?? "",
    materials: pursuit.materials ?? "",
    price_min: pursuit.price_min != null ? String(pursuit.price_min) : "",
    price_max: pursuit.price_max != null ? String(pursuit.price_max) : "",
    sources: pursuit.sources ?? [],
    facebook_location: pursuit.facebook_location ?? "",
    other_source: pursuit.other_source ?? "",
    exclude_terms: pursuit.exclude_terms ?? "",
    notes: pursuit.notes ?? "",
    status: pursuit.status as PursuitStatus,
  });
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const confirmDialog = useConfirm();
  const [error, setError] = useState<string | null>(null);

  const needsLocation = form.sources.includes("facebook");
  const needsOther = form.sources.includes("other");

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSourceToggle = (id: string) => {
    setForm((prev) => ({
      ...prev,
      sources: prev.sources.includes(id)
        ? prev.sources.filter((s) => s !== id)
        : [...prev.sources, id],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.brand.trim() && !form.model.trim()) {
      setError("Please enter at least a brand or model.");
      return;
    }
    setError(null);
    setSubmitting(true);

    try {
      const payload = {
        brand: form.brand.trim() || null,
        model: form.model.trim() || null,
        reference_number: form.reference_number.trim() || null,
        case_diameter: form.case_diameter.trim() || null,
        dial_color: form.dial_color.trim() || null,
        materials: form.materials.trim() || null,
        price_min: form.price_min ? parseFloat(form.price_min) : null,
        price_max: form.price_max ? parseFloat(form.price_max) : null,
        sources: form.sources,
        facebook_location: needsLocation ? form.facebook_location.trim() || null : null,
        other_source: needsOther ? form.other_source.trim() || null : null,
        exclude_terms: form.exclude_terms.trim() || null,
        notes: form.notes.trim() || null,
        status: form.status,
      };

      const res = await fetch(`/api/watch-pursuits/${pursuit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save");
      }

      const updated: WatchPursuit = await res.json();
      onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    const name = [pursuit.brand, pursuit.model].filter(Boolean).join(" ") || "Unnamed";
    if (!(await confirmDialog(permanentDeleteOptions(`the pursuit "${name}"`)))) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/watch-pursuits/${pursuit.id}`, {
        method: "DELETE",
      });

      if (!res.ok && res.status !== 204) {
        throw new Error("Failed to delete");
      }

      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
      setDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-lg w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl border border-border"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-6 border-b border-border sticky top-0 bg-surface z-10">
          <div>
            <p className="text-xs uppercase tracking-widest text-accent font-label mb-0.5">
              The Pursuit
            </p>
            <h2 className="text-xl font-bold text-text">Edit Pursuit</h2>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-lg hover:bg-surface-3 text-text-dim hover:text-text transition-colors flex items-center justify-center"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-8 py-6 space-y-5">
          {error && (
            <div className="bg-red-900/30 border border-red-700/40 rounded px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          {/* Brand + Model */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Brand</label>
              <input
                name="brand"
                value={form.brand}
                onChange={handleChange}
                placeholder="e.g. Rolex"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Model</label>
              <input
                name="model"
                value={form.model}
                onChange={handleChange}
                placeholder="e.g. Submariner"
                className={inputClass}
              />
            </div>
          </div>

          {/* Reference Number */}
          <div>
            <label className={labelClass}>Reference Number</label>
            <input
              name="reference_number"
              value={form.reference_number}
              onChange={handleChange}
              placeholder="e.g. 126610LN"
              className={inputClass}
            />
          </div>

          {/* Case Diameter + Dial Color */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Case Diameter</label>
              <input
                name="case_diameter"
                value={form.case_diameter}
                onChange={handleChange}
                placeholder="e.g. 40mm"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Dial Color</label>
              <input
                name="dial_color"
                value={form.dial_color}
                onChange={handleChange}
                placeholder="e.g. Black, Blue"
                className={inputClass}
              />
            </div>
          </div>

          {/* Materials */}
          <div>
            <label className={labelClass}>Materials</label>
            <input
              name="materials"
              value={form.materials}
              onChange={handleChange}
              placeholder="e.g. Steel, Rubber strap"
              className={inputClass}
            />
          </div>

          {/* Price Range */}
          <div>
            <label className={labelClass}>Price Range</label>
            <div className="grid grid-cols-2 gap-4">
              <input
                name="price_min"
                type="number"
                value={form.price_min}
                onChange={handleChange}
                placeholder="Min $"
                min={0}
                className={inputClass}
              />
              <input
                name="price_max"
                type="number"
                value={form.price_max}
                onChange={handleChange}
                placeholder="Max $"
                min={0}
                className={inputClass}
              />
            </div>
          </div>

          {/* Where to Look */}
          <div>
            <label className={labelClass}>Where to Look</label>
            <div className="grid grid-cols-2 gap-2">
              {WATCH_SOURCES.map((source) => {
                const checked = form.sources.includes(source.id);
                return (
                  <label
                    key={source.id}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded border cursor-pointer transition-colors ${
                      checked
                        ? "bg-accent/10 border-accent/40 text-text"
                        : "bg-surface-2 border-border text-text-dim hover:border-accent/30 hover:text-text"
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded flex items-center justify-center border flex-shrink-0 transition-colors ${
                        checked ? "bg-accent border-accent" : "border-border"
                      }`}
                      onClick={() => handleSourceToggle(source.id)}
                    >
                      {checked && (
                        <svg className="w-2.5 h-2.5 text-on-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <span
                      className="text-sm"
                      onClick={() => handleSourceToggle(source.id)}
                    >
                      {source.label}
                    </span>
                  </label>
                );
              })}
            </div>

            {needsLocation && (
              <div className="mt-3">
                <label className={labelClass}>Nearby Location (city or zip)</label>
                <input
                  name="facebook_location"
                  value={form.facebook_location}
                  onChange={handleChange}
                  placeholder="e.g. Austin, TX or 78701"
                  className={inputClass}
                />
              </div>
            )}

            {needsOther && (
              <div className="mt-3">
                <label className={labelClass}>Other Source Name</label>
                <input
                  name="other_source"
                  value={form.other_source}
                  onChange={handleChange}
                  placeholder="e.g. Local dealer, Grey market"
                  className={inputClass}
                />
              </div>
            )}
          </div>

          {/* Exclude Terms */}
          <div>
            <label className={labelClass}>Exclude Terms</label>
            <input
              name="exclude_terms"
              value={form.exclude_terms}
              onChange={handleChange}
              placeholder="e.g. replica, parts, broken (comma-separated)"
              className={inputClass}
            />
            <p className="text-[11px] text-text-dim mt-1">Listings containing any of these words will be excluded from results.</p>
          </div>

          {/* Notes */}
          <div>
            <label className={labelClass}>Notes</label>
            <textarea
              name="notes"
              value={form.notes}
              onChange={handleChange}
              placeholder="Any specific details, box & papers, condition requirements..."
              rows={3}
              className={`${inputClass} resize-none`}
            />
          </div>

          {/* Status */}
          <div>
            <label className={labelClass}>Status</label>
            <div className="flex gap-2">
              {(["active", "paused", "found"] as PursuitStatus[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, status: s }))}
                  className={`px-4 py-2 rounded text-sm font-medium capitalize border transition-colors ${
                    form.status === s
                      ? s === "active"
                        ? "bg-emerald-900/40 text-emerald-400 border-emerald-700/40"
                        : s === "found"
                        ? "bg-accent/10 text-accent border-accent/30"
                        : "bg-surface-3 text-text-dim border-border"
                      : "bg-surface-2 text-text-dim border-border hover:border-accent/30 hover:text-text"
                  }`}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting || deleting}
            className="w-full bg-accent text-on-primary font-bold py-3 rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm uppercase tracking-widest"
          >
            {submitting ? "Saving..." : "Save Changes"}
          </button>

          {/* Delete */}
          <button
            type="button"
            onClick={handleDelete}
            disabled={submitting || deleting}
            className="w-full bg-red-900/30 text-red-400 border border-red-700/40 font-medium py-2.5 rounded-lg hover:bg-red-900/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {deleting ? "Deleting..." : "Delete Pursuit"}
          </button>
        </form>
      </div>
    </div>
  );
}
