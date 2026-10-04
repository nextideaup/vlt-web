"use client";

import { useCallback, useRef, useState } from "react";
import { IMAGE_ATTACH_RULES } from "@/lib/attach/rules";
import { useFileAttach } from "@/lib/hooks/useFileAttach";

// State + handlers for an in-modal image picker:
//   - click-to-upload, drag-and-drop or clipboard paste (multi-file), all
//     three through useFileAttach + IMAGE_ATTACH_RULES (VLT-47, STD-FRM-002)
//   - per-file data-URL previews
//   - drag-to-reorder with drop-target highlight
//
// Consumed by both the modal-form and the <ImagesEditor> presentational
// component. The actual upload to /api/upload is left to the caller (see
// lib/api/uploadFiles.ts) so submit-time error handling stays in the modal.

export interface ImageUpload {
  files: File[];
  previews: string[];
  dragOver: boolean;
  /** Why the last pick/drop/paste refused a file; null when nothing was refused. */
  notice: string | null;
  /** The picker's accept attribute — the same rules drop and paste are held to. */
  accept: string;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  reorderDragIdx: number | null;
  reorderDropIdx: number | null;
  onPickClick: () => void;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  removeAt: (index: number) => void;
  reorder: {
    onDragStart: (index: number) => void;
    onDragOver: (e: React.DragEvent, index: number) => void;
    onDrop: (e: React.DragEvent, index: number) => void;
    onDragEnd: () => void;
  };
}

export function useImageUpload(): ImageUpload {
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [reorderDragIdx, setReorderDragIdx] = useState<number | null>(null);
  const [reorderDropIdx, setReorderDropIdx] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Receives only files that passed IMAGE_ATTACH_RULES (type, size).
  const addFiles = useCallback((imageFiles: File[]) => {
    setFiles((prev) => [...prev, ...imageFiles]);
    imageFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviews((prev) => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const attach = useFileAttach({ rules: IMAGE_ATTACH_RULES, onFiles: addFiles });

  const onPickClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const removeAt = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const reorder = {
    onDragStart: useCallback((index: number) => setReorderDragIdx(index), []),
    onDragOver: useCallback((e: React.DragEvent, index: number) => {
      e.preventDefault();
      e.stopPropagation();
      setReorderDropIdx(index);
    }, []),
    onDrop: useCallback(
      (e: React.DragEvent, index: number) => {
        e.preventDefault();
        e.stopPropagation();
        setReorderDragIdx((dragIdx) => {
          if (dragIdx === null || dragIdx === index) {
            setReorderDropIdx(null);
            return null;
          }
          setFiles((prev) => {
            const next = [...prev];
            const [moved] = next.splice(dragIdx, 1);
            next.splice(index, 0, moved);
            return next;
          });
          setPreviews((prev) => {
            const next = [...prev];
            const [moved] = next.splice(dragIdx, 1);
            next.splice(index, 0, moved);
            return next;
          });
          setReorderDropIdx(null);
          return null;
        });
      },
      [],
    ),
    onDragEnd: useCallback(() => {
      setReorderDragIdx(null);
      setReorderDropIdx(null);
    }, []),
  };

  return {
    files,
    previews,
    dragOver: attach.dragOver,
    notice: attach.notice,
    accept: attach.inputProps.accept,
    fileInputRef,
    reorderDragIdx,
    reorderDropIdx,
    onPickClick,
    onFileChange: attach.inputProps.onChange,
    onDragOver: attach.dropProps.onDragOver,
    onDragLeave: attach.dropProps.onDragLeave,
    onDrop: attach.dropProps.onDrop,
    removeAt,
    reorder,
  };
}
