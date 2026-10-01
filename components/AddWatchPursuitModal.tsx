"use client";

import { useState } from "react";
import { WatchPursuit, WATCH_SOURCES, PursuitStatus } from "@/lib/types";
import ModalShell from "@/components/forms/ModalShell";
import { useDirtyGuard } from "@/lib/hooks/useDirtyGuard";

interface AddWatchPursuitModalProps {
  onClose: () => void;
  onSaved: (p: WatchPursuit) => void;
}

interface FormState {
  brand: string;
  model: string;
  reference_number: string;
  case_diameter: string;
  dial_color: string;
  materials: string;
  price_min: string;
  price_max: string;
  sources: string[];
  facebook_location: string;
  other_source: string;
  exclude_terms: string;
  notes: string;
  status: PursuitStatus;
}

const inputClass =
  "bg-surface-2 border border-border rounded px-3 py-2 text-sm text-text w-full focus:outline-none focus:border-accent";
const labelClass =
  "text-xs uppercase tracking-widest text-text-dim font-label mb-1.5 block";

export default function AddWatchPursuitModal({
  onClose,
  onSaved,
}: AddWatchPursuitModalProps) {
  const [form, setForm] = useState<FormState>({
    brand: "",
    model: "",
    reference_number: "",
    case_diameter: "",
    dial_color: "",
    materials: "",
    price_min: "",
    price_max: "",
    sources: [],
    facebook_location: "",
    other_source: "",
    exclude_terms: "",
    notes: "",
    status: "active",
  });
  // STD-NAV-005: compare against the values the form opened with.
  const guard = useDirtyGuard(form, onClose);
  const [submitting, setSubmitting] = useState(false);
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

      const res = await fetch("/api/watch-pursuits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save");
      }

      const pursuit: WatchPursuit = await res.json();
      onSaved(pursuit);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setSubmitting(false);
    }
  };

  return (
    <ModalShell
      eyebrow="The Pursuit"
      title="Add to Pursuit"
      size="md"
      onClose={guard.requestClose}
      isDirty={guard.isDirty}
    >
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
          disabled={submitting}
          className="w-full bg-accent text-on-primary font-bold py-3 rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm uppercase tracking-widest"
        >
          {submitting ? "Saving..." : "Add to Pursuit"}
        </button>
      </form>
    </ModalShell>
  );
}
