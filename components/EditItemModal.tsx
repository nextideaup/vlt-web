"use client";

import { useState } from "react";
import {
  GuitarItem,
  GuitarImage,
  GuitarCategory,
  CATEGORY_LABELS,
  GUITAR_CATEGORIES,
  CONDITIONS,
  Condition,
  CONDITION_COLORS,
} from "@/lib/types";
import { useEditImageList } from "@/lib/hooks/useEditImageList";
import { useSpecsList } from "@/lib/hooks/useSpecsList";
import { uploadFiles, type UploadedFile } from "@/lib/api/uploadFiles";
import { guitarConfig } from "@/lib/collections/guitar";
import { useDirtyGuard } from "@/lib/hooks/useDirtyGuard";
import ModalShell from "@/components/forms/ModalShell";
import EditImagesEditor from "@/components/forms/EditImagesEditor";
import SpecsEditor from "@/components/forms/SpecsEditor";
import ModalActions, { SaveCheckIcon } from "@/components/forms/ModalActions";

interface EditItemModalProps {
  item: GuitarItem;
  onClose: () => void;
  onItemUpdated: (item: GuitarItem) => void;
}

interface FormState {
  category: GuitarCategory;
  brand: string;
  model: string;
  year: string;
  serial_number: string;
  condition: Condition | "";
  purchase_price: string;
  purchase_source: string;
  color_finish: string;
  short_description: string;
  link: string;
  notes: string;
  insure: boolean;
}

export default function EditItemModal({ item, onClose, onItemUpdated }: EditItemModalProps) {
  const [form, setForm] = useState<FormState>({
    category: item.category,
    brand: item.brand,
    model: item.model,
    year: item.year ? String(item.year) : "",
    serial_number: item.serial_number ?? "",
    condition: item.condition,
    purchase_price: item.purchase_price != null ? String(item.purchase_price) : "",
    purchase_source: item.purchase_source ?? "",
    color_finish: item.color_finish ?? "",
    short_description: item.short_description ?? "",
    link: item.link ?? "",
    notes: item.notes ?? "",
    insure: item.insure ?? false,
  });

  const editImages = useEditImageList<GuitarImage>(item.images ?? []);
  const specs = useSpecsList(item.specs);
  // STD-NAV-005: compare against the values the form opened with.
  const guard = useDirtyGuard({
    form,
    images: [editImages.derived.imageOrder, editImages.derived.imagesToDelete, editImages.derived.pendingFiles.length],
    specs: specs.derive(),
  }, onClose);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name as keyof FormState]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof FormState, string>> = {};
    if (!form.brand.trim()) newErrors.brand = "Brand is required";
    if (!form.model.trim()) newErrors.model = "Model is required";
    if (!form.condition) newErrors.condition = "Condition is required";
    if (form.year && (isNaN(Number(form.year)) || Number(form.year) < 1800 || Number(form.year) > new Date().getFullYear() + 1)) {
      newErrors.year = "Enter a valid year";
    }
    if (form.link && !/^https?:\/\/.+/.test(form.link)) {
      newErrors.link = "Must be a valid URL (https://...)";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);

    try {
      const { imagesToDelete, pendingFiles, imageOrder } = editImages.derived;

      let uploadedFiles: UploadedFile[] = [];
      if (pendingFiles.length > 0) {
        setUploading(true);
        uploadedFiles = await uploadFiles(pendingFiles);
        setUploading(false);
      }

      const payload = {
        category: form.category,
        brand: form.brand.trim(),
        model: form.model.trim(),
        year: form.year ? parseInt(form.year) : null,
        serial_number: form.serial_number.trim() || null,
        condition: form.condition,
        purchase_price: form.purchase_price ? parseFloat(form.purchase_price) : null,
        purchase_source: form.purchase_source.trim() || null,
        color_finish: form.color_finish.trim() || null,
        short_description: form.short_description.trim() || null,
        link: form.link.trim() || null,
        notes: form.notes.trim() || null,
        insure: form.insure,
        // Only send specs when the user actually edited them, so an unrelated
        // field change doesn't re-stamp specs_updated_at.
        ...(specs.isDirty() ? { specs: specs.derive() } : {}),
        images_to_delete: imagesToDelete,
        image_order: imageOrder,
        image_paths: uploadedFiles,
      };

      const res = await fetch(`/api/guitars/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update item");
      }
      const updated: GuitarItem = await res.json();
      onItemUpdated(updated);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "An error occurred");
      setSubmitting(false);
      setUploading(false);
    }
  };

  return (
    <ModalShell
      title="Edit Item"
      subtitle={`${item.brand} ${item.model}`}
      onClose={guard.requestClose}
      isDirty={guard.isDirty}
    >
      <form onSubmit={handleSubmit} className="px-6 py-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-text-muted mb-1.5">Category</label>
          <select
            name="category"
            value={form.category}
            onChange={handleChange}
            className="w-full bg-surface-2 border border-border text-text rounded-xl px-4 py-2.5 text-sm focus:border-accent focus:ring-1 focus:ring-accent outline-none appearance-none"
          >
            {GUITAR_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-text-muted mb-1.5">
              Brand <span className="text-red-400">*</span>
            </label>
            <input
              name="brand"
              value={form.brand}
              onChange={handleChange}
              placeholder="e.g. Fender"
              className={`w-full bg-surface-2 border text-text rounded-xl px-4 py-2.5 text-sm outline-none transition-colors ${errors.brand ? "border-red-500/50 focus:border-red-500" : "border-border focus:border-accent focus:ring-1 focus:ring-accent"}`}
            />
            {errors.brand && <p className="text-xs text-red-400 mt-1">{errors.brand}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-text-muted mb-1.5">
              Model <span className="text-red-400">*</span>
            </label>
            <input
              name="model"
              value={form.model}
              onChange={handleChange}
              placeholder="e.g. Stratocaster"
              className={`w-full bg-surface-2 border text-text rounded-xl px-4 py-2.5 text-sm outline-none transition-colors ${errors.model ? "border-red-500/50 focus:border-red-500" : "border-border focus:border-accent focus:ring-1 focus:ring-accent"}`}
            />
            {errors.model && <p className="text-xs text-red-400 mt-1">{errors.model}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-text-muted mb-1.5">Year</label>
            <input
              name="year"
              type="number"
              value={form.year}
              onChange={handleChange}
              placeholder="e.g. 1965"
              min={1800}
              max={new Date().getFullYear() + 1}
              className={`w-full bg-surface-2 border text-text rounded-xl px-4 py-2.5 text-sm outline-none transition-colors ${errors.year ? "border-red-500/50 focus:border-red-500" : "border-border focus:border-accent focus:ring-1 focus:ring-accent"}`}
            />
            {errors.year && <p className="text-xs text-red-400 mt-1">{errors.year}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-text-muted mb-1.5">Serial Number</label>
            <input
              name="serial_number"
              value={form.serial_number}
              onChange={handleChange}
              placeholder="e.g. V123456"
              className="w-full bg-surface-2 border border-border text-text rounded-xl px-4 py-2.5 text-sm focus:border-accent focus:ring-1 focus:ring-accent outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-text-muted mb-1.5">Color / Finish</label>
            <input
              name="color_finish"
              value={form.color_finish}
              onChange={handleChange}
              placeholder="e.g. Sunburst"
              className="w-full bg-surface-2 border border-border text-text rounded-xl px-4 py-2.5 text-sm focus:border-accent focus:ring-1 focus:ring-accent outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-muted mb-1.5">Short Description</label>
            <input
              name="short_description"
              value={form.short_description}
              onChange={handleChange}
              placeholder="e.g. Flamed maple top"
              className="w-full bg-surface-2 border border-border text-text rounded-xl px-4 py-2.5 text-sm focus:border-accent focus:ring-1 focus:ring-accent outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-text-muted mb-1.5">
            Condition <span className="text-red-400">*</span>
          </label>
          <div className="grid grid-cols-3 gap-2">
            {CONDITIONS.map((cond) => (
              <button
                key={cond}
                type="button"
                onClick={() => {
                  setForm((prev) => ({ ...prev, condition: cond }));
                  if (errors.condition) setErrors((prev) => ({ ...prev, condition: undefined }));
                }}
                className={`px-3 py-2 rounded-xl text-sm font-medium border transition-all ${
                  form.condition === cond ? CONDITION_COLORS[cond] : "border-border text-text-muted hover:border-border-2 hover:text-text"
                }`}
              >
                {cond}
              </button>
            ))}
          </div>
          {errors.condition && <p className="text-xs text-red-400 mt-1">{errors.condition}</p>}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-text-muted mb-1.5">Purchase Price</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted text-sm">$</span>
              <input
                name="purchase_price"
                type="number"
                value={form.purchase_price}
                onChange={handleChange}
                placeholder="0.00"
                min={0}
                step="0.01"
                className="w-full bg-surface-2 border border-border text-text rounded-xl pl-8 pr-4 py-2.5 text-sm focus:border-accent focus:ring-1 focus:ring-accent outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-muted mb-1.5">Purchase Source</label>
            <input
              name="purchase_source"
              value={form.purchase_source}
              onChange={handleChange}
              placeholder="e.g. Reverb, eBay"
              className="w-full bg-surface-2 border border-border text-text rounded-xl px-4 py-2.5 text-sm focus:border-accent focus:ring-1 focus:ring-accent outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-text-muted mb-1.5">Link (optional)</label>
          <input
            name="link"
            type="url"
            value={form.link}
            onChange={handleChange}
            placeholder="https://..."
            className={`w-full bg-surface-2 border text-text rounded-xl px-4 py-2.5 text-sm outline-none transition-colors ${errors.link ? "border-red-500/50 focus:border-red-500" : "border-border focus:border-accent focus:ring-1 focus:ring-accent"}`}
          />
          {errors.link && <p className="text-xs text-red-400 mt-1">{errors.link}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-text-muted mb-1.5">Notes</label>
          <textarea
            name="notes"
            value={form.notes}
            onChange={handleChange}
            placeholder="Any additional details..."
            rows={3}
            className="w-full bg-surface-2 border border-border text-text rounded-xl px-4 py-2.5 text-sm focus:border-accent focus:ring-1 focus:ring-accent outline-none resize-none"
          />
        </div>

        <label className="flex items-start gap-3 cursor-pointer select-none p-3 rounded-xl border border-border bg-surface-2 hover:border-border-2 transition-colors">
          <input
            type="checkbox"
            checked={form.insure}
            onChange={(e) => setForm((prev) => ({ ...prev, insure: e.target.checked }))}
            className="mt-0.5 w-4 h-4 rounded border-border bg-surface-3 text-accent focus:ring-accent focus:ring-1 accent-accent"
          />
          <span className="text-sm">
            <span className="block font-medium text-text">Include in insurance schedule</span>
            <span className="block text-xs text-text-dim mt-0.5">
              Adds this item to The Paperwork → Insurance and triggers an automatic insurance valuation when you next run an AI value.
            </span>
          </span>
        </label>

        <SpecsEditor specs={specs} templateSuggestions={guitarConfig.specTemplate} />

        <EditImagesEditor edit={editImages} />

        <ModalActions
          onCancel={guard.requestClose}
          submitting={submitting}
          uploading={uploading}
          submitLabel="Save Changes"
          savingLabel="Saving…"
          uploadingLabel="Uploading…"
          submitIcon={SaveCheckIcon}
        />
      </form>
    </ModalShell>
  );
}
