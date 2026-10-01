"use client";

import { useState } from "react";
import { GuitarPursuit, GUITAR_SOURCES, PursuitStatus } from "@/lib/types";
import ModalShell from "@/components/forms/ModalShell";
import { useDirtyGuard } from "@/lib/hooks/useDirtyGuard";

interface AddGuitarPursuitModalProps {
  onClose: () => void;
  onSaved: (p: GuitarPursuit) => void;
}

interface FormState {
  brand: string;
  model: string;
  year_min: string;
  year_max: string;
  color_finish: string;
  price_min: string;
  price_max: string;
  sources: string[];
  facebook_location: string;
  exclude_terms: string;
  notes: string;
  status: PursuitStatus;
}

const inputClass =
  "bg-surface-2 border border-border rounded px-3 py-2 text-sm text-text w-full focus:outline-none focus:border-accent";
const labelClass =
  "text-xs uppercase tracking-widest text-text-dim font-label mb-1.5 block";

export default function AddGuitarPursuitModal({
  onClose,
  onSaved,
}: AddGuitarPursuitModalProps) {
  const [form, setForm] = useState<FormState>({
    brand: "",
    model: "",
    year_min: "",
    year_max: "",
    color_finish: "",
    price_min: "",
    price_max: "",
    sources: [],
    facebook_location: "",
    exclude_terms: "",
    notes: "",
    status: "active",
  });
  // STD-NAV-005: compare against the values the form opened with.
  const guard = useDirtyGuard(form, onClose);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsLocation = form.sources.includes("facebook") || form.sources.includes("craigslist");

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
        year_min: form.year_min ? parseInt(form.year_min) : null,
        year_max: form.year_max ? parseInt(form.year_max) : null,
        color_finish: form.color_finish.trim() || null,
        price_min: form.price_min ? parseFloat(form.price_min) : null,
        price_max: form.price_max ? parseFloat(form.price_max) : null,
        sources: form.sources,
        facebook_location: needsLocation ? form.facebook_location.trim() || null : null,
        exclude_terms: form.exclude_terms.trim() || null,
        notes: form.notes.trim() || null,
        status: form.status,
      };

      const res = await fetch("/api/guitar-pursuits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save");
      }

      const pursuit: GuitarPursuit = await res.json();
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
              placeholder="e.g. Fender"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Model</label>
            <input
              name="model"
              value={form.model}
              onChange={handleChange}
              placeholder="e.g. Stratocaster"
              className={inputClass}
            />
          </div>
        </div>

        {/* Year Range */}
        <div>
          <label className={labelClass}>Year Range</label>
          <div className="grid grid-cols-2 gap-4">
            <input
              name="year_min"
              type="number"
              value={form.year_min}
              onChange={handleChange}
              placeholder="From Year"
              min={1800}
              max={2100}
              className={inputClass}
            />
            <input
              name="year_max"
              type="number"
              value={form.year_max}
              onChange={handleChange}
              placeholder="To Year"
              min={1800}
              max={2100}
              className={inputClass}
            />
          </div>
        </div>

        {/* Color / Finish */}
        <div>
          <label className={labelClass}>Color / Finish</label>
          <input
            name="color_finish"
            value={form.color_finish}
            onChange={handleChange}
            placeholder="e.g. Sunburst, Cherry Red"
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
            {GUITAR_SOURCES.map((source) => {
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
        </div>

        {/* Exclude Terms */}
        <div>
          <label className={labelClass}>Exclude Terms</label>
          <input
            name="exclude_terms"
            value={form.exclude_terms}
            onChange={handleChange}
            placeholder="e.g. Custom, case, kit, parts (comma-separated)"
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
            placeholder="Any specific details, features, or conditions..."
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
