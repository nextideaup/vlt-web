"use client";

import { useState } from "react";
import {
  AutoItem,
  AutoImage,
  AutoCategory,
  AUTO_CATEGORIES,
  AUTO_CATEGORY_LABELS,
  CONDITIONS,
  Condition,
  CONDITION_COLORS,
} from "@/lib/types";
import { useEditImageList } from "@/lib/hooks/useEditImageList";
import { useSpecsList } from "@/lib/hooks/useSpecsList";
import { autoConfig } from "@/lib/collections/auto";
import { uploadFiles, type UploadedFile } from "@/lib/api/uploadFiles";
import { useDirtyGuard } from "@/lib/hooks/useDirtyGuard";
import ModalShell from "@/components/forms/ModalShell";
import EditImagesEditor from "@/components/forms/EditImagesEditor";
import SpecsEditor from "@/components/forms/SpecsEditor";
import ModalActions, { SaveCheckIcon } from "@/components/forms/ModalActions";

interface EditAutomobileModalProps {
  item: AutoItem;
  onClose: () => void;
  onItemUpdated: (item: AutoItem) => void;
}

interface FormState {
  category: AutoCategory;
  brand: string;
  model: string;
  year: string;
  description: string;
  trim_level: string;
  engine: string;
  transmission: string;
  body_style: string;
  color: string;
  mileage: string;
  condition: Condition | "";
  vin: string;
  purchase_price: string;
  purchase_source: string;
  notes: string;
  insure: boolean;
}

const TRANSMISSION_OPTIONS = ["Automatic", "Manual", "CVT", "Semi-Automatic", "Other"];
const BODY_STYLE_OPTIONS = ["Sedan", "Coupe", "SUV", "Truck", "Van", "Wagon", "Convertible", "Other"];

export default function EditAutomobileModal({ item, onClose, onItemUpdated }: EditAutomobileModalProps) {
  const [form, setForm] = useState<FormState>({
    category: item.category,
    brand: item.brand,
    model: item.model,
    year: item.year ? String(item.year) : "",
    description: item.description ?? "",
    trim_level: item.trim_level ?? "",
    engine: item.engine ?? "",
    transmission: item.transmission ?? "",
    body_style: item.body_style ?? "",
    color: item.color ?? "",
    mileage: item.mileage != null ? String(item.mileage) : "",
    condition: item.condition ?? "",
    vin: item.vin ?? "",
    purchase_price: item.purchase_price != null ? String(item.purchase_price) : "",
    purchase_source: item.purchase_source ?? "",
    notes: item.notes ?? "",
    insure: item.insure ?? false,
  });

  const editImages = useEditImageList<AutoImage>(item.images ?? []);
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
    if (form.year && (isNaN(Number(form.year)) || Number(form.year) < 1885 || Number(form.year) > new Date().getFullYear() + 2)) {
      newErrors.year = "Enter a valid year";
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
        description: form.description.trim() || null,
        trim_level: form.trim_level.trim() || null,
        engine: form.engine.trim() || null,
        transmission: form.transmission || null,
        body_style: form.body_style || null,
        color: form.color.trim() || null,
        mileage: form.mileage ? parseInt(form.mileage) : null,
        condition: form.condition || null,
        vin: form.vin.trim() || null,
        purchase_price: form.purchase_price ? parseFloat(form.purchase_price) : null,
        purchase_source: form.purchase_source.trim() || null,
        notes: form.notes.trim() || null,
        insure: form.insure,
        // Only send specs when the user actually edited them, so an unrelated
        // field change doesn't re-stamp specs_updated_at.
        ...(specs.isDirty() ? { specs: specs.derive() } : {}),
        images_to_delete: imagesToDelete,
        image_order: imageOrder,
        image_paths: uploadedFiles,
      };

      const res = await fetch(`/api/automobiles/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update item");
      }
      const updated: AutoItem = await res.json();
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
      title="Edit Automobile"
      subtitle={[item.year, item.brand, item.model].filter(Boolean).join(" ")}
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
            {AUTO_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>{AUTO_CATEGORY_LABELS[cat]}</option>
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
              placeholder="e.g. Ferrari"
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
              placeholder="e.g. 458 Italia"
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
              placeholder="e.g. 2012"
              min={1885}
              max={new Date().getFullYear() + 2}
              className={`w-full bg-surface-2 border text-text rounded-xl px-4 py-2.5 text-sm outline-none transition-colors ${errors.year ? "border-red-500/50 focus:border-red-500" : "border-border focus:border-accent focus:ring-1 focus:ring-accent"}`}
            />
            {errors.year && <p className="text-xs text-red-400 mt-1">{errors.year}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-text-muted mb-1.5">Trim Level</label>
            <input
              name="trim_level"
              value={form.trim_level}
              onChange={handleChange}
              placeholder="e.g. Sport, Limited"
              className="w-full bg-surface-2 border border-border text-text rounded-xl px-4 py-2.5 text-sm focus:border-accent focus:ring-1 focus:ring-accent outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-text-muted mb-1.5">Body Style</label>
            <select
              name="body_style"
              value={form.body_style}
              onChange={handleChange}
              className="w-full bg-surface-2 border border-border text-text rounded-xl px-4 py-2.5 text-sm focus:border-accent focus:ring-1 focus:ring-accent outline-none appearance-none"
            >
              <option value="">Select...</option>
              {BODY_STYLE_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-muted mb-1.5">Transmission</label>
            <select
              name="transmission"
              value={form.transmission}
              onChange={handleChange}
              className="w-full bg-surface-2 border border-border text-text rounded-xl px-4 py-2.5 text-sm focus:border-accent focus:ring-1 focus:ring-accent outline-none appearance-none"
            >
              <option value="">Select...</option>
              {TRANSMISSION_OPTIONS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-text-muted mb-1.5">Engine</label>
            <input
              name="engine"
              value={form.engine}
              onChange={handleChange}
              placeholder="e.g. 4.5L V8"
              className="w-full bg-surface-2 border border-border text-text rounded-xl px-4 py-2.5 text-sm focus:border-accent focus:ring-1 focus:ring-accent outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-muted mb-1.5">Color</label>
            <input
              name="color"
              value={form.color}
              onChange={handleChange}
              placeholder="e.g. Rosso Corsa"
              className="w-full bg-surface-2 border border-border text-text rounded-xl px-4 py-2.5 text-sm focus:border-accent focus:ring-1 focus:ring-accent outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-text-muted mb-1.5">Mileage</label>
            <input
              name="mileage"
              type="number"
              value={form.mileage}
              onChange={handleChange}
              placeholder="e.g. 12500"
              min={0}
              className="w-full bg-surface-2 border border-border text-text rounded-xl px-4 py-2.5 text-sm focus:border-accent focus:ring-1 focus:ring-accent outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-muted mb-1.5">VIN</label>
            <input
              name="vin"
              value={form.vin}
              onChange={handleChange}
              placeholder="17-character VIN"
              className="w-full bg-surface-2 border border-border text-text rounded-xl px-4 py-2.5 text-sm focus:border-accent focus:ring-1 focus:ring-accent outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-text-muted mb-1.5">Description</label>
          <input
            name="description"
            value={form.description}
            onChange={handleChange}
            placeholder="Brief description"
            className="w-full bg-surface-2 border border-border text-text rounded-xl px-4 py-2.5 text-sm focus:border-accent focus:ring-1 focus:ring-accent outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-text-muted mb-1.5">Condition</label>
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
              placeholder="e.g. Private Sale, Dealer"
              className="w-full bg-surface-2 border border-border text-text rounded-xl px-4 py-2.5 text-sm focus:border-accent focus:ring-1 focus:ring-accent outline-none"
            />
          </div>
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

        <SpecsEditor specs={specs} templateSuggestions={autoConfig.specTemplate} />

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
