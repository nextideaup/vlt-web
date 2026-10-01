"use client";

import { useCallback, useRef } from "react";
import { useConfirm, type ConfirmOptions } from "@/components/forms/ConfirmDialog";

// Unsaved-changes guard for Add/Edit modals (STD-NAV-005).
//
//   const guard = useDirtyGuard({ form, images: imageUpload.files.length }, onClose);
//   <ModalShell onClose={guard.requestClose} isDirty={guard.isDirty} ...>
//     ...
//     <ModalActions onCancel={guard.requestClose} ... />
//
// `values` is snapshotted on the FIRST render — the values the form opened
// with — and every later render is compared against that snapshot, not
// against empty. So an Edit modal opened on an existing record is clean until
// the user actually changes something, and changing a field back to its
// original value makes it clean again.
//
// `values` must be JSON-serialisable. For File objects pass something that
// identifies them (a count, or names) rather than the File itself, since
// JSON.stringify(file) is "{}".
//
// `requestClose()` closes straight away when clean, and asks "Discard
// changes?" (via the shared ConfirmDialog) when dirty. ModalShell uses
// `isDirty` to ignore backdrop clicks and Escape while there is unsaved input.

export const DISCARD_CHANGES_OPTIONS: ConfirmOptions = {
  title: "Discard changes?",
  body: "You have unsaved changes in this form. If you close it now, they will be lost.",
  confirmLabel: "Discard",
  cancelLabel: "Keep editing",
  destructive: true,
};

export interface DirtyGuard {
  isDirty: boolean;
  requestClose: () => Promise<void>;
}

export function useDirtyGuard(values: unknown, onClose: () => void): DirtyGuard {
  const confirm = useConfirm();
  const serialized = JSON.stringify(values);
  const initialRef = useRef<string | null>(null);
  if (initialRef.current === null) initialRef.current = serialized;
  const isDirty = serialized !== initialRef.current;

  // Latest values for the stable callback below.
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const requestClose = useCallback(async () => {
    if (!isDirtyRef.current) {
      onCloseRef.current();
      return;
    }
    if (await confirm(DISCARD_CHANGES_OPTIONS)) onCloseRef.current();
  }, [confirm]);

  return { isDirty, requestClose };
}
