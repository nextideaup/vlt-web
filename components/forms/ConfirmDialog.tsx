"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";

// Styled replacement for window.confirm() (STD-DEL-001). Two ways to use it:
//
// 1. The hook — preferred. <ConfirmProvider> is mounted once in the root
//    layout, so any client component can do:
//
//      const confirm = useConfirm();
//      if (!(await confirm(permanentDeleteOptions(`"${item.brand} ${item.model}"`)))) return;
//
// 2. The bare <ConfirmDialog open ... /> component, for a caller that wants
//    to own the open state itself.
//
// The dialog is an accessible alertdialog: labelled title + description,
// focus moves to Cancel on open (the least destructive choice), Tab is
// trapped between the two buttons, Escape cancels, and focus returns to the
// element that opened it. It sits at z-[300] so it stacks above every other
// modal in the app (the highest is ImportExportModal at z-[200]).

export interface ConfirmOptions {
  title: string;
  body?: ReactNode;
  /** Label on the confirming button. Defaults to "Confirm" (or "Delete" when destructive). */
  confirmLabel?: string;
  /** Label on the cancelling button. Defaults to "Cancel". */
  cancelLabel?: string;
  /** Red, destructive-styled confirm button. */
  destructive?: boolean;
}

/**
 * Standard copy for a permanent delete: names the record, says it is
 * permanent, red "Delete" button. `name` should already be display-ready
 * (e.g. `"Fender Stratocaster"` with the quotes, or `3 items`).
 */
export function permanentDeleteOptions(name: string, detail?: string): ConfirmOptions {
  return {
    title: `Delete ${name}?`,
    body: `This permanently deletes ${name}${detail ? ` ${detail}` : ""}. This cannot be undone.`,
    confirmLabel: "Delete",
    destructive: true,
  };
}

interface ConfirmDialogProps extends ConfirmOptions {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId();
  const bodyId = useId();
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  // Keep the latest onCancel without re-binding the key listener each render.
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();

    // Capture phase on window runs before every other keydown listener in
    // the app (including the window-level Escape handlers on the detail
    // modals and lightboxes), so stopping propagation here means Escape
    // only cancels this dialog and never also closes the modal beneath it.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCancelRef.current();
        return;
      }
      if (e.key === "Tab") {
        const focusables = [cancelRef.current, confirmRef.current].filter(
          (el): el is HTMLButtonElement => el !== null,
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;
        e.preventDefault();
        if (e.shiftKey) {
          (active === first || !focusables.includes(active as HTMLButtonElement) ? last : first).focus();
        } else {
          (active === last || !focusables.includes(active as HTMLButtonElement) ? first : last).focus();
        }
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      if (previouslyFocused && typeof previouslyFocused.focus === "function" && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
  }, [open]);

  if (!open) return null;

  const resolvedConfirmLabel = confirmLabel ?? (destructive ? "Delete" : "Confirm");

  return (
    <div
      className="modal-backdrop fixed inset-0 z-[300] flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
      // Backdrop clicks do nothing: an alertdialog needs an explicit answer.
      onClick={(e) => e.stopPropagation()}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={body ? bodyId : undefined}
        className="modal-content bg-surface border border-border rounded-2xl w-full max-w-md shadow-2xl"
      >
        <div className="px-6 pt-6 pb-4 flex gap-4">
          {destructive && (
            <div className="w-10 h-10 rounded-full bg-red-900/40 text-red-400 flex items-center justify-center flex-shrink-0" aria-hidden="true">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
          )}
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-bold text-text break-words">
              {title}
            </h2>
            {body && (
              <div id={bodyId} className="text-sm text-text-muted mt-1.5 break-words">
                {body}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="px-5 py-2.5 rounded-xl text-sm font-medium text-text-muted hover:text-text hover:bg-surface-3 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className={
              destructive
                ? "px-5 py-2.5 rounded-xl text-sm font-semibold bg-red-600 hover:bg-red-500 text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400/70"
                : "px-5 py-2.5 rounded-xl text-sm font-semibold bg-accent hover:bg-accent-hover text-on-primary transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            }
          >
            {resolvedConfirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

interface PendingConfirm {
  options: ConfirmOptions;
  resolve: (value: boolean) => void;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const pendingRef = useRef<PendingConfirm | null>(null);

  const settle = useCallback((value: boolean) => {
    const current = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    current?.resolve(value);
  }, []);

  const confirm = useCallback<ConfirmFn>((options) => {
    // A second request while one is open cancels the first rather than
    // leaving its promise hanging forever.
    pendingRef.current?.resolve(false);
    return new Promise<boolean>((resolve) => {
      const next = { options, resolve };
      pendingRef.current = next;
      setPending(next);
    });
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmDialog
        open={pending !== null}
        {...(pending?.options ?? { title: "" })}
        onConfirm={() => settle(true)}
        onCancel={() => settle(false)}
      />
    </ConfirmContext.Provider>
  );
}

/**
 * Returns `confirm(options) => Promise<boolean>`. Resolves true only when the
 * user clicks the confirm button; Cancel and Escape resolve false.
 */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm must be used inside <ConfirmProvider> (mounted in app/layout.tsx)");
  }
  return ctx;
}

export default ConfirmDialog;
