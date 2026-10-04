"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  describeRejections,
  nameForPastedFile,
  planPaste,
  selectAttachFiles,
  type AttachRules,
} from "@/lib/attach/rules";

// VLT-47 (STD-FRM-002): one attach path for every file surface. Picker,
// drag-and-drop and clipboard paste all end in `attach`, which runs the
// surface's rules (lib/attach/rules.ts) and hands only the accepted files to
// the surface's existing handler — so a pasted or dropped file meets exactly
// the type, size and count limits a picked one does, and then takes the same
// upload path (images: uploadFiles → /api/upload → moderation).
//
// The paste listener sits on the document, not on an element: a modal's root
// is not focusable, so right after a modal opens the paste target is <body>.
// It is live only while `enabled` — callers pass false when the surface is not
// on screen (e.g. a CSV import past its upload step). Surfaces are modals, and
// only one modal is open at a time (STD-NAV-003), so at most one listener is
// live.

export interface UseFileAttachOptions {
  rules: AttachRules;
  /** Receives only files that passed the rules. Never called with []. */
  onFiles: (files: File[]) => void;
  /** Surfaces that take pasted text (CSV imports) receive text pasted outside a field. */
  onText?: (text: string) => void;
  /** Whether the paste listener is live. Defaults to true. */
  enabled?: boolean;
}

export interface FileAttach {
  dragOver: boolean;
  /** Why the last attach refused something; null when it refused nothing. */
  notice: string | null;
  /** Spread onto the hidden <input type="file">. */
  inputProps: {
    accept: string;
    multiple: boolean;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  };
  /** Spread onto the drop zone. */
  dropProps: {
    onDragOver: (e: React.DragEvent) => void;
    onDragLeave: () => void;
    onDrop: (e: React.DragEvent) => void;
  };
}

const NON_TEXT_INPUT_TYPES = new Set([
  "button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit",
]);

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement) return !target.readOnly && !target.disabled;
  if (target instanceof HTMLInputElement) {
    return !NON_TEXT_INPUT_TYPES.has(target.type) && !target.readOnly && !target.disabled;
  }
  return false;
}

function clipboardFiles(data: DataTransfer): File[] {
  let files = Array.from(data.files ?? []);
  if (files.length === 0) {
    // Some browsers expose a pasted image only through items.
    files = Array.from(data.items ?? [])
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((f): f is File => f !== null);
  }
  return files.map((f) => {
    const name = nameForPastedFile(f.name, f.type);
    return name === f.name ? f : new File([f], name, { type: f.type, lastModified: f.lastModified });
  });
}

export function useFileAttach({ rules, onFiles, onText, enabled = true }: UseFileAttachOptions): FileAttach {
  const [dragOver, setDragOver] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Latest callbacks without re-binding the document listener on every render.
  const onFilesRef = useRef(onFiles);
  const onTextRef = useRef(onText);
  const rulesRef = useRef(rules);
  useEffect(() => {
    onFilesRef.current = onFiles;
    onTextRef.current = onText;
    rulesRef.current = rules;
  });

  const attach = useCallback((files: File[]) => {
    if (files.length === 0) return;
    const { accepted, rejected } = selectAttachFiles(files, rulesRef.current);
    setNotice(describeRejections(rejected, rulesRef.current));
    if (accepted.length > 0) onFilesRef.current(accepted);
  }, []);

  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) attach(Array.from(e.target.files));
    },
    [attach],
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const onDragLeave = useCallback(() => setDragOver(false), []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files) attach(Array.from(e.dataTransfer.files));
    },
    [attach],
  );

  useEffect(() => {
    if (!enabled) return;
    const onPaste = (e: ClipboardEvent) => {
      if (!e.clipboardData) return;
      const plan = planPaste({
        files: clipboardFiles(e.clipboardData),
        text: e.clipboardData.getData("text/plain"),
        targetEditable: isEditableTarget(e.target),
        rules: rulesRef.current,
        acceptsText: Boolean(onTextRef.current),
      });
      if (plan.kind === "native") return;
      e.preventDefault();
      if (plan.kind === "files") {
        setNotice(describeRejections(plan.rejected, rulesRef.current));
        onFilesRef.current(plan.accepted);
      } else if (plan.kind === "text") {
        setNotice(null);
        onTextRef.current?.(plan.text);
      } else {
        setNotice(describeRejections(plan.rejected, rulesRef.current));
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [enabled]);

  return {
    dragOver,
    notice,
    inputProps: { accept: rules.accept, multiple: rules.maxFiles !== 1, onChange },
    dropProps: { onDragOver, onDragLeave, onDrop },
  };
}
