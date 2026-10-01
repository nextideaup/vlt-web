"use client";

import { useEffect, useId, useRef, useState } from "react";

export interface CheckinPursuit {
  id: string;
  type: "guitar" | "watch";
  name: string;
  created_at: string;
}

interface Props {
  pursuits: CheckinPursuit[];
  /**
   * Called when the queue is finished with, carrying the answers given so
   * far so pages can sync state. Also called by "Not now" (STD-NAV-004),
   * which closes the modal for this page view with no API call: the answers
   * already given are passed through, the rest of the queue is left
   * untouched and will be asked again on a later visit.
   */
  onComplete: (updates: { id: string; action: "snooze" | "dismiss" | "deactivate" }[]) => void;
}

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

export default function PursuitCheckinModal({ pursuits, onComplete }: Props) {
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [updates, setUpdates] = useState<{ id: string; action: "snooze" | "dismiss" | "deactivate" }[]>([]);
  const titleId = useId();

  // "Not now": close for this page view without touching any pursuit.
  const notNow = () => onComplete(updates);
  const notNowRef = useRef(notNow);
  notNowRef.current = notNow;
  const loadingRef = useRef(loading);
  loadingRef.current = loading;

  // Escape behaves like "Not now" (no state change), unless a response is
  // in flight.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loadingRef.current) notNowRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const current = pursuits[index];
  if (!current) return null;

  const days = daysSince(current.created_at);
  const isLast = index === pursuits.length - 1;

  async function respond(action: "snooze" | "dismiss" | "deactivate") {
    setLoading(true);
    try {
      await fetch(`/api/${current.type}-pursuits/${current.id}/checkin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      const next = [...updates, { id: current.id, action }];
      setUpdates(next);

      if (isLast) {
        onComplete(next);
      } else {
        setIndex((i) => i + 1);
        setLoading(false);
      }
    } catch {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 w-full max-w-md mx-4 bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden"
      >

        {/* Gold accent bar */}
        <div className="h-1 w-full bg-gradient-to-r from-accent/60 via-accent to-accent/60" />

        <div className="p-8">
          {/* Queue indicator */}
          {pursuits.length > 1 && (
            <p className="text-xs text-text-dim uppercase tracking-widest mb-5">
              Check-in {index + 1} of {pursuits.length}
            </p>
          )}

          {/* Icon */}
          <div className="w-12 h-12 rounded-full bg-accent/10 border border-accent/30 flex items-center justify-center mb-5">
            <svg className="w-6 h-6 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>

          {/* Heading */}
          <h2 id={titleId} className="font-headline text-2xl text-text mb-1">
            Still on the hunt?
          </h2>
          <p className="text-text-dim text-sm mb-6">
            You&apos;ve been pursuing the{" "}
            <span className="text-text font-medium">{current.name}</span>{" "}
            for {days} day{days !== 1 ? "s" : ""}.
            Do you want to keep searching?
          </p>

          {/* Actions */}
          <div className="flex flex-col gap-3">
            <button
              onClick={() => respond("snooze")}
              disabled={loading}
              className="w-full bg-accent text-on-primary py-3 px-4 rounded-xl font-label text-sm uppercase tracking-widest hover:bg-accent/90 disabled:opacity-50 transition-colors"
            >
              Yes, keep the hunt going
            </button>
            <button
              onClick={() => respond("dismiss")}
              disabled={loading}
              className="w-full bg-surface-2 hover:bg-surface-3 text-text-dim py-3 px-4 rounded-xl font-label text-sm uppercase tracking-widest disabled:opacity-50 transition-colors border border-border"
            >
              Yes — and don&apos;t ask me again
            </button>
            <button
              onClick={() => respond("deactivate")}
              disabled={loading}
              className="w-full text-text-dim hover:text-text py-2.5 px-4 rounded-xl text-sm disabled:opacity-50 transition-colors"
            >
              No, stand down
            </button>
            <button
              type="button"
              onClick={notNow}
              disabled={loading}
              className="w-full text-text-dim hover:text-text underline-offset-4 hover:underline py-2 px-4 rounded-xl text-sm disabled:opacity-50 transition-colors"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
