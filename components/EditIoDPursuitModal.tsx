"use client";

import { useState } from "react";
import { IoDPursuit, IOD_SOURCES, PursuitStatus } from "@/lib/types";
import { useConfirm, permanentDeleteOptions } from "@/components/forms/ConfirmDialog";
import ModalShell from "@/components/forms/ModalShell";
import { useDirtyGuard } from "@/lib/hooks/useDirtyGuard";

interface EditIoDPursuitModalProps {
  pursuit: IoDPursuit;
  onClose: () => void;
  onSaved: (p: IoDPursuit) => void;
  onDeleted: () => void;
}

const inputClass =
  "bg-surface-2 border border-border rounded px-3 py-2 text-sm text-text w-full focus:outline-none focus:border-accent";
const labelClass =
  "text-xs uppercase tracking-widest text-text-dim font-label mb-1.5 block";

export default function EditIoDPursuitModal({
  pursuit,
  onClose,
  onSaved,
  onDeleted,
}: EditIoDPursuitModalProps) {
  const [form, setForm] = useState({
    item_type: pursuit.item_type ?? "",
    brand: pursuit.brand ?? "",
    description: pursuit.description ?? "",
    price_min: pursuit.price_min != null ? String(pursuit.price_min) : "",
    price_max: pursuit.price_max != null ? String(pursuit.price_max) : "",
    sources: pursuit.sources ?? [],
    exclude_terms: pursuit.exclude_terms ?? "",
    notes: pursuit.notes ?? "",
    status: pursuit.status as PursuitStatus,
  });
  // STD-NAV-005: compare against the values the form opened with.
  const guard = useDirtyGuard(form, onClose);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const confirmDialog = useConfirm();
  const [error, setError] = useState<string | null>(null);

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
    if (!form.item_type.trim() && !form.brand.trim() && !form.description.trim()) {
      setError("Please enter at least an item type, brand, or description.");
      return;
    }
    setError(null);
    setSubmitting(true);

    try {
      const payload = {
        item_type: form.item_type.trim() || null,
        brand: form.brand.trim() || null,
        description: form.description.trim() || null,
        price_min: form.price_min ? parseFloat(form.price_min) : null,
        price_max: form.price_max ? parseFloat(form.price_max) : null,
        sources: form.sources,
        exclude_terms: form.exclude_terms.trim() || null,
        notes: form.notes.trim() || null,
        status: form.status,
      };

      const res = await fetch(`/api/iod-pursuits/${pursuit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save");
      }

      const updated: IoDPursuit = await res.json();
      onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    const name =
      [pursuit.brand, pursuit.item_type].filter(Boolean).join(" · ") || pursuit.description || "Unnamed";
    if (!(await confirmDialog(permanentDeleteOptions(`the pursuit "${name}"`)))) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/iod-pursuits/${pursuit.id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error("Failed to delete");
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
      setDeleting(false);
    }
  };

  return (
    <ModalShell
      eyebrow="The Pursuit"
      title="Edit Pursuit"
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

        {/* Item Type + Brand */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Item Type</label>
            <input name="item_type" value={form.item_type} onChange={handleChange} placeholder="e.g. Print, Painting, Jersey" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Brand / Artist</label>
            <input name="brand" value={form.brand} onChange={handleChange} placeholder="e.g. Warhol, Banksy" className={inputClass} />
          </div>
        </div>

        {/* Description */}
        <div>
          <label className={labelClass}>Description</label>
          <input name="description" value={form.description} onChange={handleChange} placeholder="e.g. Marilyn Monroe screenprint, 1967" className={inputClass} />
        </div>

        {/* Price Range */}
        <div>
          <label className={labelClass}>Price Range</label>
          <div className="grid grid-cols-2 gap-4">
            <input name="price_min" type="number" value={form.price_min} onChange={handleChange} placeholder="Min $" min={0} className={inputClass} />
            <input name="price_max" type="number" value={form.price_max} onChange={handleChange} placeholder="Max $" min={0} className={inputClass} />
          </div>
        </div>

        {/* Where to Look */}
        <div>
          <label className={labelClass}>Where to Look</label>
          <div className="grid grid-cols-2 gap-2">
            {IOD_SOURCES.map((source) => {
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
                  <span className="text-sm" onClick={() => handleSourceToggle(source.id)}>
                    {source.label}
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Exclude Terms */}
        <div>
          <label className={labelClass}>Exclude Terms</label>
          <input name="exclude_terms" value={form.exclude_terms} onChange={handleChange} placeholder="e.g. reproduction, print, poster (comma-separated)" className={inputClass} />
          <p className="text-[11px] text-text-dim mt-1">Listings containing any of these words will be excluded from results.</p>
        </div>

        {/* Notes */}
        <div>
          <label className={labelClass}>Notes</label>
          <textarea name="notes" value={form.notes} onChange={handleChange} placeholder="Any specific details, provenance requirements, or conditions..." rows={3} className={`${inputClass} resize-none`} />
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
    </ModalShell>
  );
}
