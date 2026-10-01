"use client";

import { useState } from "react";
import { useUserModules, ModuleKey } from "@/lib/UserModulesContext";

const COLLECTIONS: {
  key: ModuleKey;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
}[] = [
  {
    key: "guitars",
    label: "Guitars",
    description: "Electric, acoustic, amplifiers & effects",
    color: "#d4956a",
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
      </svg>
    ),
  },
  {
    key: "watches",
    label: "Watches",
    description: "Luxury, sport, dress & vintage timepieces",
    color: "#5eafd8",
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    key: "automobiles",
    label: "Automobiles",
    description: "Collection cars, classics & daily drivers",
    color: "#4ade80",
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16l2-6h14l2 6M1 16h22M5 16v2M19 16v2M8 10h8" />
      </svg>
    ),
  },
  {
    key: "collectibles",
    label: "Collectibles",
    description: "Fine art, jewelry, memorabilia & more",
    color: "#a78bfa",
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 2l3 7h6l-5 4 2 7-6-4-6 4 2-7-5-4h6z" />
      </svg>
    ),
  },
];

interface Props {
  onClose: () => void;
}

export default function ManageCollectionsModal({ onClose }: Props) {
  const { modules, setModules } = useUserModules();

  const [enabled, setEnabled] = useState<Record<ModuleKey, boolean>>({
    guitars:      modules?.guitars      ?? true,
    watches:      modules?.watches      ?? true,
    automobiles:  modules?.automobiles  ?? true,
    collectibles: modules?.collectibles ?? true,
  });

  const [saving, setSaving] = useState(false);
  const [warnKey, setWarnKey] = useState<ModuleKey | null>(null);

  const toggleKey = (key: ModuleKey) => {
    const next = !enabled[key];
    // Show warning when disabling a collection that was previously enabled
    if (!next && modules?.[key]) {
      setWarnKey(key);
    }
    setEnabled(prev => ({ ...prev, [key]: next }));
  };

  const enabledCount = Object.values(enabled).filter(Boolean).length;

  const handleSave = async () => {
    if (enabledCount === 0) return;
    setSaving(true);
    try {
      const res = await fetch("/api/user/modules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modules: enabled }),
      });
      if (res.ok) {
        setModules(enabled);
        onClose();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-surface border border-border rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-5 border-b border-border">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-headline text-xl text-text">Manage Collections</h2>
              <p className="text-text-dim text-xs mt-1">
                Show or hide collections across the app
              </p>
            </div>
            <button
              aria-label="Close"
              onClick={onClose}
              className="text-text-dim hover:text-text transition-colors p-1"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Data-safe notice */}
        {warnKey && (
          <div className="mx-6 mt-5 flex gap-3 bg-amber-950/40 border border-amber-800/40 rounded-lg p-3">
            <svg className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15.75h.007v.008H12v-.008z" />
            </svg>
            <div className="min-w-0">
              <p className="text-amber-300 text-xs font-medium">Your data is safe</p>
              <p className="text-amber-400/70 text-xs mt-0.5 leading-relaxed">
                Hiding a collection only removes it from navigation and the dashboard.
                All items, valuations, and history are preserved and will reappear if you re-enable it.
              </p>
              <button
                onClick={() => setWarnKey(null)}
                className="text-amber-400 text-xs mt-1 hover:underline"
              >
                Got it
              </button>
            </div>
          </div>
        )}

        {/* Collection toggles */}
        <div className="px-6 py-5 space-y-3">
          {COLLECTIONS.map(({ key, label, description, icon, color }) => {
            const on = enabled[key];
            return (
              <button
                key={key}
                onClick={() => toggleKey(key)}
                className={`w-full flex items-center gap-4 p-4 rounded-lg border transition-all duration-200 text-left ${
                  on
                    ? "bg-surface-2 border-border hover:bg-surface-3"
                    : "bg-surface border-border/40 opacity-50 hover:opacity-70"
                }`}
              >
                {/* Icon */}
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: `${color}20`, color }}
                >
                  {icon}
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-text">{label}</p>
                  <p className="text-xs text-text-dim mt-0.5">{description}</p>
                </div>

                {/* Toggle pill */}
                <div
                  className={`relative flex-shrink-0 w-10 h-5 rounded-full transition-colors duration-200 ${
                    on ? "bg-accent" : "bg-surface-3 border border-border"
                  }`}
                >
                  <div
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${
                      on ? "translate-x-5" : "translate-x-0.5"
                    }`}
                  />
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex items-center justify-between gap-3">
          <p className={`text-xs transition-colors ${enabledCount === 0 ? "text-red-400" : "text-text-dim"}`}>
            {enabledCount === 0
              ? "At least one collection must be enabled"
              : `${enabledCount} of 4 collection${enabledCount !== 1 ? "s" : ""} enabled`}
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-text-dim hover:text-text rounded-lg hover:bg-surface-2 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || enabledCount === 0}
              className="px-4 py-2 text-sm font-semibold bg-accent text-[#0c0e10] rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
