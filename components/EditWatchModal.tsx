"use client";

import { useState } from "react";
import {
  WatchItem,
  WatchImage,
  WatchCategory,
  WATCH_CATEGORIES,
  WATCH_CATEGORY_LABELS,
  CONDITIONS,
  Condition,
  CONDITION_COLORS,
} from "@/lib/types";
import { useEditImageList } from "@/lib/hooks/useEditImageList";
import { useSpecsList } from "@/lib/hooks/useSpecsList";
import { watchConfig } from "@/lib/collections/watch";
import { uploadFiles, type UploadedFile } from "@/lib/api/uploadFiles";
import { useDirtyGuard } from "@/lib/hooks/useDirtyGuard";
import ModalShell from "@/components/forms/ModalShell";
import EditImagesEditor from "@/components/forms/EditImagesEditor";
import SpecsEditor from "@/components/forms/SpecsEditor";
import ModalActions, { SaveCheckIcon } from "@/components/forms/ModalActions";

interface EditWatchModalProps {
  item: WatchItem;
  onClose: () => void;
  onItemUpdated: (item: WatchItem) => void;
}

interface FormState {
  category: WatchCategory;
  brand: string;
  model: string;
  year: string;
  reference_number: string;
  case_diameter: string;
  serial_number: string;
  condition: Condition | "";
  purchase_price: string;
  purchase_source: string;
  dial_color: string;
  country_of_manufacture: string;
  movement: string;
  bracelet_material: string;
  case_material: string;
  short_description: string;
  link: string;
  notes: string;
  insure: boolean;
}

export default function EditWatchModal({ item, onClose, onItemUpdated }: EditWatchModalProps) {
  const [form, setForm] = useState<FormState>({
    category: item.category,
    brand: item.brand,
    model: item.model,
    year: item.year ? String(item.year) : "",
    reference_number: item.reference_number ?? "",
    case_diameter: item.case_diameter ?? "",
    serial_number: item.serial_number ?? "",
    condition: item.condition,
    purchase_price: item.purchase_price != null ? String(item.purchase_price) : "",
    purchase_source: item.purchase_source ?? "",
    dial_color: item.dial_color ?? "",
    country_of_manufacture: item.country_of_manufacture ?? "",
    movement: item.movement ?? "",
    bracelet_material: item.bracelet_material ?? "",
    case_material: item.case_material ?? "",
    short_description: item.short_description ?? "",
    link: item.link ?? "",
    notes: item.notes ?? "",
    insure: item.insure ?? false,
  });

  const editImages = useEditImageList<WatchImage>(item.images ?? []);
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
        reference_number: form.reference_number.trim() || null,
        case_diameter: form.case_diameter.trim() || null,
        serial_number: form.serial_number.trim() || null,
        condition: form.condition,
        purchase_price: form.purchase_price ? parseFloat(form.purchase_price) : null,
        purchase_source: form.purchase_source.trim() || null,
        dial_color: form.dial_color.trim() || null,
        country_of_manufacture: form.country_of_manufacture.trim() || null,
        movement: form.movement.trim() || null,
        bracelet_material: form.bracelet_material.trim() || null,
        case_material: form.case_material.trim() || null,
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

      const res = await fetch(`/api/watches/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update item");
      }
      const updated: WatchItem = await res.json();
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
      title="Edit Watch"
      subtitle={`${item.brand} ${item.model}`}
      onClose={guard.requestClose}
      isDirty={guard.isDirty}
      nested
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
            {WATCH_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>{WATCH_CATEGORY_LABELS[cat]}</option>
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
              placeholder="e.g. Rolex"
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
              placeholder="e.g. Submariner"
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
              placeholder="e.g. 2018"
              min={1800}
              max={new Date().getFullYear() + 1}
              className={`w-full bg-surface-2 border text-text rounded-xl px-4 py-2.5 text-sm outline-none transition-colors ${errors.year ? "border-red-500/50 focus:border-red-500" : "border-border focus:border-accent focus:ring-1 focus:ring-accent"}`}
            />
            {errors.year && <p className="text-xs text-red-400 mt-1">{errors.year}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-text-muted mb-1.5">Reference Number</label>
            <input
              name="reference_number"
              value={form.reference_number}
              onChange={handleChange}
              placeholder="e.g. 116610LN"
              className="w-full bg-surface-2 border border-border text-text rounded-xl px-4 py-2.5 text-sm focus:border-accent focus:ring-1 focus:ring-accent outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-text-muted mb-1.5">Case Diameter</label>
            <input
              name="case_diameter"
              value={form.case_diameter}
              onChange={handleChange}
              placeholder="e.g. 40mm, 41mm"
              className="w-full bg-surface-2 border border-border text-text rounded-xl px-4 py-2.5 text-sm focus:border-accent focus:ring-1 focus:ring-accent outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-muted mb-1.5">Serial Number</label>
            <input
              name="serial_number"
              value={form.serial_number}
              onChange={handleChange}
              placeholder="e.g. 7A36-7040"
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
            <label className="block text-sm font-medium text-text-muted mb-1.5">Dial Color</label>
            <input
              name="dial_color"
              value={form.dial_color}
              onChange={handleChange}
              placeholder="e.g. Black, Blue, Silver"
              className="w-full bg-surface-2 border border-border text-text rounded-xl px-4 py-2.5 text-sm focus:border-accent focus:ring-1 focus:ring-accent outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-muted mb-1.5">Country of Manufacture</label>
            <input
              name="country_of_manufacture"
              value={form.country_of_manufacture}
              onChange={handleChange}
              placeholder="e.g. Switzerland, Japan"
              className="w-full bg-surface-2 border border-border text-text rounded-xl px-4 py-2.5 text-sm focus:border-accent focus:ring-1 focus:ring-accent outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-text-muted mb-1.5">Movement</label>
          <input
            name="movement"
            value={form.movement}
            onChange={handleChange}
            placeholder="e.g. ETA 2824-2, Rolex Calibre 3135, Automatic"
            className="w-full bg-surface-2 border border-border text-text rounded-xl px-4 py-2.5 text-sm focus:border-accent focus:ring-1 focus:ring-accent outline-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-text-muted mb-1.5">Case Material</label>
            <input
              name="case_material"
              value={form.case_material}
              onChange={handleChange}
              placeholder="e.g. Stainless Steel, Gold"
              className="w-full bg-surface-2 border border-border text-text rounded-xl px-4 py-2.5 text-sm focus:border-accent focus:ring-1 focus:ring-accent outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-muted mb-1.5">Bracelet Material</label>
            <input
              name="bracelet_material"
              value={form.bracelet_material}
              onChange={handleChange}
              placeholder="e.g. Oyster, Leather, Rubber"
              className="w-full bg-surface-2 border border-border text-text rounded-xl px-4 py-2.5 text-sm focus:border-accent focus:ring-1 focus:ring-accent outline-none"
            />
          </div>
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
              placeholder="e.g. Chrono24, WatchBox"
              className="w-full bg-surface-2 border border-border text-text rounded-xl px-4 py-2.5 text-sm focus:border-accent focus:ring-1 focus:ring-accent outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-text-muted mb-1.5">Short Description</label>
          <textarea
            name="short_description"
            value={form.short_description}
            onChange={handleChange}
            placeholder="e.g. Full set with box and papers"
            rows={2}
            className="w-full bg-surface-2 border border-border text-text rounded-xl px-4 py-2.5 text-sm focus:border-accent focus:ring-1 focus:ring-accent outline-none resize-none"
          />
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

        <SpecsEditor specs={specs} templateSuggestions={watchConfig.specTemplate} />

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
