"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

// Modal frame shared by every Add/Edit modal: backdrop with blur, centred
// scrollable card, sticky header with title/subtitle and a close button. The
// caller renders its own <form> as children — this component is purely visual.
//
// Unsaved-changes guard (STD-NAV-005): pass `isDirty` (from useDirtyGuard)
// and pass the guard's `requestClose` as `onClose`.
//   - isDirty === true  → backdrop click and Escape do nothing; the X calls
//                          onClose (= requestClose), which asks "Discard
//                          changes?" first.
//   - isDirty === false → backdrop click, Escape and X all close immediately.
//   - isDirty omitted   → legacy behaviour: only the X closes (no backdrop or
//                          Escape dismissal), for modals not wired to a guard.

// Stack of open shells so Escape only ever dismisses the topmost one (e.g.
// an Edit modal opened over a Detail modal).
const openShells: symbol[] = [];

interface ModalShellProps {
  title: string;
  subtitle?: string;
  /** Small uppercase label above the title (e.g. "The Pursuit"). */
  eyebrow?: string;
  onClose: () => void;
  children: ReactNode;
  /**
   * Stacked above another modal (e.g. an Edit modal opened from a Detail
   * modal). Bumps z-index and darkens the backdrop slightly so the layered
   * stack reads correctly.
   */
  nested?: boolean;
  /** Unsaved-changes state from useDirtyGuard. See the header comment. */
  isDirty?: boolean;
  /** Card width. "lg" (default) = max-w-2xl, "md" = max-w-xl. */
  size?: "md" | "lg";
}

export default function ModalShell({
  title,
  subtitle,
  eyebrow,
  onClose,
  children,
  nested = false,
  isDirty,
  size = "lg",
}: ModalShellProps) {
  const titleId = useId();
  const gestureDismissable = isDirty === false;

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const gestureRef = useRef(gestureDismissable);
  gestureRef.current = gestureDismissable;

  useEffect(() => {
    const me = Symbol("modal-shell");
    openShells.push(me);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Only the topmost shell reacts; a dirty one ignores Escape entirely.
      // (ConfirmDialog swallows Escape in the capture phase, so pressing it
      // on the "Discard changes?" prompt never reaches here.)
      if (openShells[openShells.length - 1] !== me) return;
      if (gestureRef.current) onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      const idx = openShells.indexOf(me);
      if (idx !== -1) openShells.splice(idx, 1);
    };
  }, []);

  // Only treat it as a backdrop click when the press also STARTED on the
  // backdrop — a text selection dragged out of an input must not close it.
  const pressStartedOnBackdrop = useRef(false);

  return (
    <div
      className={`modal-backdrop fixed inset-0 ${nested ? "z-[60]" : "z-50"} flex items-center justify-center p-4`}
      style={{
        backgroundColor: nested ? "rgba(0,0,0,0.8)" : "rgba(0,0,0,0.7)",
        backdropFilter: "blur(4px)",
      }}
      onMouseDown={(e) => {
        pressStartedOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (e.target !== e.currentTarget || !pressStartedOnBackdrop.current) return;
        pressStartedOnBackdrop.current = false;
        if (gestureDismissable) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`modal-content bg-surface border border-border rounded-2xl w-full ${size === "md" ? "max-w-xl" : "max-w-2xl"} max-h-[90vh] overflow-y-auto shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-border sticky top-0 bg-surface z-10">
          <div>
            {eyebrow && (
              <p className="text-xs uppercase tracking-widest text-accent font-label mb-0.5">{eyebrow}</p>
            )}
            <h2 id={titleId} className="text-xl font-bold text-text">{title}</h2>
            {subtitle && <p className="text-sm text-text-muted mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl hover:bg-surface-3 text-text-muted hover:text-text transition-colors flex items-center justify-center"
            aria-label="Close"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
