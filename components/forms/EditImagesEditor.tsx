"use client";

import type { BaseImage, EditImageList } from "@/lib/hooks/useEditImageList";

// Edit-modal counterpart to <ImagesEditor>: renders the unified existing-or-new
// image list with toDelete state, "DEL" overlay, restore button, "New" badge,
// and a drop zone underneath. Drag-to-reorder operates on the same list. New
// images arrive by picker, drag-and-drop or clipboard paste anywhere in the
// open modal (VLT-47).

interface EditImagesEditorProps<T extends BaseImage> {
  edit: EditImageList<T>;
  label?: string;
}

export default function EditImagesEditor<T extends BaseImage>({
  edit,
  label = "Images",
}: EditImagesEditorProps<T>) {
  const {
    editImages,
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
    toggleDelete,
    reorder,
  } = edit;

  // The first non-deleted entry is the cover. Indexed against editImages so
  // the cover badge follows reorder.
  const firstNonDeleted = editImages.findIndex(
    (e) => !(e.kind === "existing" && e.toDelete),
  );
  const deletedCount = editImages.filter(
    (e) => e.kind === "existing" && e.toDelete,
  ).length;

  return (
    <div>
      <label className="block text-sm font-medium text-text-muted mb-1.5">{label}</label>

      {editImages.length > 0 && (
        <div className="mb-3 space-y-1.5">
          <p className="text-xs text-text-dim">
            Drag to reorder · first image is the cover · click × to remove
          </p>
          <div className="flex flex-wrap gap-2">
            {editImages.map((entry, i) => {
              const imgSrc = entry.kind === "existing" ? entry.image.path : entry.preview;
              const isDeleted = entry.kind === "existing" && entry.toDelete;
              const isCover = i === firstNonDeleted;
              return (
                <div
                  key={entry.kind === "existing" ? entry.image.id : `new-${i}`}
                  draggable={!isDeleted}
                  onDragStart={() => !isDeleted && reorder.onDragStart(i)}
                  onDragOver={(e) => !isDeleted && reorder.onDragOver(e, i)}
                  onDrop={(e) => !isDeleted && reorder.onDrop(e, i)}
                  onDragEnd={reorder.onDragEnd}
                  className={`relative w-20 h-20 rounded-xl overflow-hidden border-2 group/img transition-all select-none ${
                    isDeleted
                      ? "opacity-30 border-red-500/50 cursor-not-allowed"
                      : reorderDragIdx === i
                      ? "opacity-40 border-accent scale-95 cursor-grabbing"
                      : reorderDropIdx === i
                      ? "border-accent ring-2 ring-accent/30 cursor-grab"
                      : "border-border hover:border-border-2 cursor-grab"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imgSrc} alt="" className="w-full h-full object-cover pointer-events-none" />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleDelete(i);
                    }}
                    className={`absolute top-1 right-1 w-5 h-5 rounded-full text-white flex items-center justify-center transition-opacity ${
                      isDeleted
                        ? "opacity-100 bg-green-600/80"
                        : "opacity-0 group-hover/img:opacity-100 bg-black/70 hover:bg-red-600/80"
                    }`}
                    title={isDeleted ? "Restore" : "Remove"}
                  >
                    {isDeleted ? (
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    ) : (
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    )}
                  </button>
                  {isCover && !isDeleted && (
                    <div className="absolute bottom-0 left-0 right-0 bg-accent/90 text-on-primary text-[10px] text-center py-0.5 font-semibold pointer-events-none">
                      Cover
                    </div>
                  )}
                  {entry.kind === "new" && !isCover && (
                    <div className="absolute bottom-0 left-0 right-0 bg-green-600/80 text-white text-[10px] text-center py-0.5 pointer-events-none">
                      New
                    </div>
                  )}
                  {isDeleted && (
                    <div className="absolute top-1 left-1 text-[9px] text-red-400 font-bold bg-black/60 px-1 rounded pointer-events-none">
                      DEL
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {deletedCount > 0 && (
            <p className="text-xs text-yellow-400">
              {deletedCount} image(s) marked for removal
            </p>
          )}
        </div>
      )}

      <div
        className={`border-2 border-dashed rounded-xl p-5 text-center transition-colors cursor-pointer ${
          dragOver ? "border-accent bg-accent/5" : "border-border hover:border-border-2"
        }`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={onPickClick}
      >
        <svg className="w-7 h-7 text-text-dim mx-auto mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
        </svg>
        <p className="text-sm text-text-muted">
          Drag &amp; drop, paste, or <span className="text-accent">click to add more photos</span>
        </p>
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
    </div>
  );
}
