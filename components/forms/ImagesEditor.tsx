"use client";

import type { ImageUpload } from "@/lib/hooks/useImageUpload";

// Drop zone + preview grid driven by the ImageUpload state from
// useImageUpload(). Used by every Add/Edit modal. Images arrive by picker,
// drag-and-drop or clipboard paste anywhere in the open modal (VLT-47).

interface ImagesEditorProps {
  upload: ImageUpload;
  /** Optional override for the editor label (defaults to "Images"). */
  label?: string;
}

export default function ImagesEditor({ upload, label = "Images" }: ImagesEditorProps) {
  const {
    previews,
    dragOver,
    notice,
    accept,
    fileInputRef,
    reorderDragIdx,
    reorderDropIdx,
    onPickClick,
    onFileChange,
    onDragOver,
    onDragLeave,
    onDrop,
    removeAt,
    reorder,
  } = upload;

  return (
    <div>
      <label className="block text-sm font-medium text-text-muted mb-1.5">{label}</label>

      <div
        className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer ${
          dragOver ? "border-accent bg-accent-dim" : "border-border hover:border-border-2"
        }`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={onPickClick}
      >
        <svg className="w-8 h-8 text-text-dim mx-auto mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
        </svg>
        <p className="text-sm text-text-muted">
          Drag &amp; drop, paste, or <span className="text-accent">click to upload</span>
        </p>
        <p className="text-xs text-text-dim mt-1">JPG, PNG, WebP or GIF up to 10MB each</p>
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          multiple
          onChange={onFileChange}
          className="hidden"
        />
      </div>
      {notice && (
        <p role="alert" className="text-xs text-red-400 mt-1.5">{notice}</p>
      )}

      {previews.length > 0 && (
        <div className="mt-3 space-y-1.5">
          <p className="text-xs text-text-dim">Drag to reorder · first image is the cover</p>
          <div className="flex flex-wrap gap-2">
            {previews.map((preview, i) => (
              <div
                key={i}
                draggable
                onDragStart={() => reorder.onDragStart(i)}
                onDragOver={(e) => reorder.onDragOver(e, i)}
                onDrop={(e) => reorder.onDrop(e, i)}
                onDragEnd={reorder.onDragEnd}
                className={`relative w-20 h-20 rounded-xl overflow-hidden border-2 group/img cursor-grab active:cursor-grabbing transition-all select-none ${
                  reorderDragIdx === i
                    ? "opacity-40 border-accent scale-95"
                    : reorderDropIdx === i
                    ? "border-accent ring-2 ring-accent/30"
                    : "border-border hover:border-border-2"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt={`Preview ${i + 1}`} className="w-full h-full object-cover pointer-events-none" />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeAt(i);
                  }}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center hover:bg-red-600/80"
                  aria-label="Remove image"
                >
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                {i === 0 && (
                  <div className="absolute bottom-0 left-0 right-0 bg-accent/90 text-on-primary text-[10px] text-center py-0.5 font-semibold">
                    Cover
                  </div>
                )}
                {i > 0 && (
                  <div className="absolute top-1 left-1 w-4 h-4 rounded-full bg-black/60 text-white text-[9px] flex items-center justify-center font-bold">
                    {i + 1}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
