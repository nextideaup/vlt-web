"use client";

import { useState } from "react";
import { useConfirm, permanentDeleteOptions } from "@/components/forms/ConfirmDialog";

export type BulkActionModule = "guitars" | "watches" | "automobiles" | "iod";

// API path map. Keeps this component decoupled from page-level route knowledge.
const API_PATH: Record<BulkActionModule, string> = {
  guitars: "/api/guitars/bulk-action",
  watches: "/api/watches/bulk-action",
  automobiles: "/api/automobiles/bulk-action",
  iod: "/api/iod/bulk-action",
};

// Bulk AI specs generation (CUR-1). Separate endpoint + response shape from the
// set_insure/archive/delete bulk-action route.
const SPECS_BATCH_PATH: Record<BulkActionModule, string> = {
  guitars: "/api/guitars/specs-batch",
  watches: "/api/watches/specs-batch",
  automobiles: "/api/automobiles/specs-batch",
  iod: "/api/iod/specs-batch",
};

interface BulkActionResult {
  action: "set_insure" | "archive" | "delete";
  affected: number;
  ids: string[];
  value?: boolean; // only for set_insure
}

interface BulkActionBarProps {
  module: BulkActionModule;
  selectedIds: Set<string>;
  // Hint used to auto-detect which direction the Toggle Insurance action
  // should default to. Pass the count of currently-insured items in the
  // selection; the bar picks the opposite as the default value.
  selectedInsuredCount?: number;
  totalSelectableCount: number;
  onClearSelection: () => void;
  onSelectAll: () => void;
  onActionComplete: (result: BulkActionResult) => void;
  // Called after a bulk specs generation so the page can refetch items and
  // surface the new specs. Optional — without it the bar just reports a summary.
  onSpecsGenerated?: () => void;
}

/**
 * Sticky bottom action bar for bulk operations on a collection list page.
 * Renders nothing when no items are selected. Shows Toggle Insurance /
 * Archive / Delete / Sell (greyed-out placeholder, no click handler).
 */
export default function BulkActionBar({
  module,
  selectedIds,
  selectedInsuredCount = 0,
  totalSelectableCount,
  onClearSelection,
  onSelectAll,
  onActionComplete,
  onSpecsGenerated,
}: BulkActionBarProps) {
  const [busy, setBusy] = useState<null | "set_insure" | "archive" | "delete" | "generate_specs">(null);
  const confirmDialog = useConfirm();
  const count = selectedIds.size;

  if (count === 0) return null;

  // Direction auto-detect for Toggle Insurance: if more than half of the
  // selection is currently insured, the action flips them OFF; otherwise ON.
  const defaultInsureValue = selectedInsuredCount < count / 2;

  async function runAction(action: "set_insure" | "archive" | "delete", value?: boolean) {
    setBusy(action);
    try {
      const res = await fetch(API_PATH[module], {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ids: Array.from(selectedIds), value }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Bulk action failed" }));
        throw new Error(err.error || "Bulk action failed");
      }
      const result = (await res.json()) as BulkActionResult;
      onActionComplete(result);
      onClearSelection();
    } catch (err) {
      console.error(`[bulk-action] ${action} failed`, err);
      alert(err instanceof Error ? err.message : `Bulk ${action} failed`);
    } finally {
      setBusy(null);
    }
  }

  async function runSpecsBatch() {
    const ok = await confirmDialog({
      title: `Generate specs with AI for ${count} item${count !== 1 ? "s" : ""}?`,
      body: "Each item is researched via web search (a few seconds each). Manual specs you've already entered are preserved.",
      confirmLabel: "Generate specs",
    });
    if (!ok) return;
    setBusy("generate_specs");
    try {
      const res = await fetch(SPECS_BATCH_PATH[module], {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Specs generation failed" }));
        throw new Error(err.error || "Specs generation failed");
      }
      const result = (await res.json()) as { generated: number; failed: number };
      alert(`Specs generated for ${result.generated} item${result.generated !== 1 ? "s" : ""}.${result.failed ? ` ${result.failed} failed.` : ""}`);
      onSpecsGenerated?.();
      onClearSelection();
    } catch (err) {
      console.error("[bulk-action] generate_specs failed", err);
      alert(err instanceof Error ? err.message : "Bulk specs generation failed");
    } finally {
      setBusy(null);
    }
  }

  async function confirmToggleInsurance() {
    const verb = defaultInsureValue ? "set" : "remove";
    const dir = defaultInsureValue ? "ON" : "OFF";
    const ok = await confirmDialog({
      title: `Toggle insurance ${dir} for ${count} item${count !== 1 ? "s" : ""}?`,
      body: `This will ${verb} the "Include in insurance schedule" flag.`,
      confirmLabel: `Insurance ${dir}`,
    });
    if (!ok) return;
    void runAction("set_insure", defaultInsureValue);
  }

  async function confirmArchive() {
    const ok = await confirmDialog({
      title: `Archive ${count} item${count !== 1 ? "s" : ""}?`,
      body: "They will be hidden from lists, dashboard, and insurance valuation runs but kept for export and re-import.",
      confirmLabel: "Archive",
    });
    if (!ok) return;
    void runAction("archive");
  }

  async function confirmDelete() {
    if (!(await confirmDialog(permanentDeleteOptions(`${count} item${count !== 1 ? "s" : ""}`, "and their images")))) return;
    void runAction("delete");
  }

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[min(96vw,820px)]">
      <div className="bg-surface border border-accent/30 rounded-2xl shadow-2xl shadow-black/40 px-4 py-3 flex items-center gap-3 backdrop-blur-md">
        <div className="flex items-center gap-2 text-sm">
          <span className="bg-accent/20 text-accent font-semibold px-2 py-0.5 rounded-full text-xs">{count}</span>
          <span className="text-text-muted">selected</span>
        </div>

        <div className="h-6 w-px bg-border" />

        <div className="flex items-center gap-1.5 flex-1">
          <ActionButton
            label={defaultInsureValue ? "Set Insure" : "Remove Insure"}
            onClick={confirmToggleInsurance}
            busy={busy === "set_insure"}
            icon={
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
          <ActionButton
            label="Archive"
            onClick={confirmArchive}
            busy={busy === "archive"}
            icon={
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
              </svg>
            }
          />
          <ActionButton
            label="Delete"
            onClick={confirmDelete}
            busy={busy === "delete"}
            danger
            icon={
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
            }
          />
          <ActionButton
            label="Generate Specs"
            onClick={runSpecsBatch}
            busy={busy === "generate_specs"}
            icon={
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            }
          />
          {/* Sell — greyed-out placeholder (CUR-1 sub-feature #7). NO click
              handler attached, just a hover tooltip so it reads as a
              clearly-pending roadmap item rather than a broken button. */}
          <span
            title="Coming soon"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-text-dim border border-border bg-surface-2/50 opacity-50 cursor-not-allowed select-none"
            aria-disabled="true"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Sell
          </span>
        </div>

        <div className="h-6 w-px bg-border" />

        <div className="flex items-center gap-1.5">
          {count < totalSelectableCount && (
            <button
              onClick={onSelectAll}
              className="text-xs text-text-muted hover:text-text px-2 py-1 rounded transition-colors"
            >
              Select all ({totalSelectableCount})
            </button>
          )}
          <button
            onClick={onClearSelection}
            className="text-xs text-text-muted hover:text-text px-2 py-1 rounded transition-colors"
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  busy,
  danger,
  icon,
}: {
  label: string;
  onClick: () => void;
  busy?: boolean;
  danger?: boolean;
  icon: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50 disabled:cursor-wait ${
        danger
          ? "bg-red-900/30 text-red-300 border-red-700/40 hover:bg-red-900/50 hover:text-red-200"
          : "bg-surface-2 text-text border-border hover:border-accent/40 hover:text-accent"
      }`}
    >
      {busy ? (
        <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      ) : (
        icon
      )}
      {label}
    </button>
  );
}
