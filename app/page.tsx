"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { GuitarItem, WatchItem, AutoItem, IoDItem } from "@/lib/types";
import ItemDetailModal from "@/components/ItemDetailModal";
import WatchDetailModal from "@/components/WatchDetailModal";
import AutomobileDetailModal from "@/components/AutomobileDetailModal";
import IoDDetailModal from "@/components/IoDDetailModal";
import PortfolioChart from "@/components/PortfolioChart";
import { useUserModules } from "@/lib/UserModulesContext";
import { useHideValues } from "@/lib/HideValuesContext";

// ── Types ──────────────────────────────────────────────────────────────────────

// `collection_type` as /api/dashboard returns it, mapped to the item API the
// detail fetch goes to and the label/badge shown for it.
type CollectionType = "guitar" | "watch" | "auto" | "iod";

const COLLECTION_TYPES: Record<CollectionType, { api: string; label: string; badge: string }> = {
  guitar: { api: "/api/guitars",     label: "Guitar",      badge: "bg-accent/10 text-accent" },
  watch:  { api: "/api/watches",     label: "Watch",       badge: "bg-sky-900/40 text-sky-400" },
  auto:   { api: "/api/automobiles", label: "Automobile",  badge: "bg-[#4ade80]/10 text-[#4ade80]" },
  iod:    { api: "/api/iod",         label: "Collectible", badge: "bg-[#a78bfa]/10 text-[#a78bfa]" },
};

function isCollectionType(t: string): t is CollectionType {
  return t in COLLECTION_TYPES;
}

interface CategoryStat {
  category: string;
  item_count: number;
  total_value: number;
}

interface RecentItem {
  id: string;
  brand: string;
  model: string;
  year: number | null;
  category: string;
  collection_type: string;
  subtitle: string | null;
  condition: string;
  created_at: string;
  latest_ai_price: number | null;
  latest_user_price: number | null;
  primary_image_path: string | null;
}

interface ActivityEvent {
  item_id: string;
  collection_type: string;
  event_type: string;
  event_date: string;
  title: string;
  subtitle: string;
  value: number | null;
}

interface PortfolioStats {
  total_value: number;
  total_items: number;
  valued_items: number;
}

interface DashboardData {
  portfolio: PortfolioStats;
  guitar_portfolio: PortfolioStats;
  watch_portfolio: PortfolioStats;
  auto_portfolio: PortfolioStats;
  iod_portfolio: PortfolioStats;
  categories: CategoryStat[];
  recent_item: RecentItem | null;
  activity: ActivityEvent[];
  random_images: string[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatCurrencyValue(v: number | null | undefined): string {
  if (v == null || Number(v) === 0) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(v));
}

function formatDate(iso: string): string {
  return new Date(iso)
    .toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    .toUpperCase();
}


function EventIcon({ type }: { type: string }) {
  if (type === "added") {
    return (
      <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
      </svg>
    );
  }
  if (type === "ai_valuation") {
    return (
      <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
      </svg>
    );
  }
  return (
    <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
    </svg>
  );
}

// ── Photo Stack ────────────────────────────────────────────────────────────────

// Fixed transforms — rotation in degrees, scatter offset in px.
// Spread laterally (~3.5× wider than the original tight pile) so the photos
// cover more of the right-hand column next to the Provenance Activity
// timeline rather than clustering in the center. The container has
// overflow-hidden so anything beyond the column edges is clipped naturally —
// reads as a panoramic spread rather than a tight stack.
const PHOTO_TRANSFORMS = [
  { r: -16, x: -290, y:  60 },
  { r:  10, x:  240, y: -55 },
  { r:  -3, x: -130, y: -70 },
  { r:  19, x:  280, y:  45 },
  { r:  -9, x:   10, y:  15 },  // top of stack — most visible, near-center
];

// Photo dimensions — 5× the original 118×142
const PW = 590;
const PH = 710;

function PhotoStack({ images }: { images: string[] }) {
  if (images.length === 0) return null;

  return (
    <div
      className="relative w-full self-stretch overflow-hidden select-none pointer-events-none"
    >
      {images.slice(0, 5).map((src, i) => {
        const t = PHOTO_TRANSFORMS[i] ?? { r: 0, x: 0, y: 0 };
        return (
          <div
            key={src}
            className="absolute"
            style={{
              top:        "50%",
              left:       "50%",
              width:      PW,
              height:     PH,
              marginTop:  -(PH / 2),
              marginLeft: -(PW / 2),
              transform:  `rotate(${t.r}deg) translate(${t.x}px, ${t.y}px)`,
              zIndex:     i + 1,
              /* sepia-toned print border */
              backgroundColor: "#c9a96e",
              padding:    "18px 18px 56px 18px",
              boxShadow:  "0 8px 40px rgba(0,0,0,0.65), 0 2px 6px rgba(0,0,0,0.4)",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt=""
              className="w-full h-full object-cover"
              style={{ display: "block" }}
            />
          </div>
        );
      })}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { hideValues } = useHideValues();
  const formatCurrency = (v: number | null | undefined): string => hideValues ? "$•••" : formatCurrencyValue(v);
  const { isEnabled } = useUserModules();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalItem, setModalItem] = useState<GuitarItem | WatchItem | AutoItem | IoDItem | null>(null);
  const [modalType, setModalType] = useState<CollectionType | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);

  // Opens the detail modal for a Recent Entry or activity-feed item. Failures
  // are surfaced in a banner rather than swallowed.
  const openItem = useCallback(async (id: string, type: string) => {
    setOpenError(null);
    if (!isCollectionType(type)) {
      setOpenError(`Couldn't open this item (unknown collection "${type}").`);
      return;
    }
    try {
      const res = await fetch(`${COLLECTION_TYPES[type].api}/${id}`);
      if (!res.ok) {
        setOpenError(`Couldn't open this ${COLLECTION_TYPES[type].label.toLowerCase()} (HTTP ${res.status}).`);
        return;
      }
      setModalItem(await res.json());
      setModalType(type);
    } catch {
      setOpenError(`Couldn't open this ${COLLECTION_TYPES[type].label.toLowerCase()}. Check your connection and try again.`);
    }
  }, []);

  const loadDashboard = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard");
      if (res.ok) setData(await res.json());
    } catch (e) {
      console.error("Dashboard load error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  const closeModal = () => { setModalItem(null); setModalType(null); };
  const onModalDelete = () => { closeModal(); loadDashboard(); };

  // Sum only from enabled collections so hidden ones don't inflate the overview
  const totalValue =
    (isEnabled("guitars")      ? (data?.guitar_portfolio?.total_value  ?? 0) : 0) +
    (isEnabled("watches")      ? (data?.watch_portfolio?.total_value   ?? 0) : 0) +
    (isEnabled("automobiles")  ? (data?.auto_portfolio?.total_value    ?? 0) : 0) +
    (isEnabled("collectibles") ? (data?.iod_portfolio?.total_value     ?? 0) : 0);

  const totalItems =
    (isEnabled("guitars")      ? (data?.guitar_portfolio?.total_items  ?? 0) : 0) +
    (isEnabled("watches")      ? (data?.watch_portfolio?.total_items   ?? 0) : 0) +
    (isEnabled("automobiles")  ? (data?.auto_portfolio?.total_items    ?? 0) : 0) +
    (isEnabled("collectibles") ? (data?.iod_portfolio?.total_items     ?? 0) : 0);

  const valuedItems =
    (isEnabled("guitars")      ? (data?.guitar_portfolio?.valued_items ?? 0) : 0) +
    (isEnabled("watches")      ? (data?.watch_portfolio?.valued_items  ?? 0) : 0) +
    (isEnabled("automobiles")  ? (data?.auto_portfolio?.valued_items   ?? 0) : 0) +
    (isEnabled("collectibles") ? (data?.iod_portfolio?.valued_items    ?? 0) : 0);

  if (loading) {
    return (
      <div className="p-8 space-y-8 animate-pulse">
        <div className="h-60 bg-surface-2 rounded-lg" />
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-8 h-64 bg-surface-2 rounded-lg" />
          <div className="col-span-4 space-y-6">
            <div className="h-32 bg-surface-3 rounded-lg" />
            <div className="h-28 bg-surface-container-lowest rounded-lg" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-6">
          <div className="h-48 bg-surface-2 rounded-lg" />
          <div className="h-48 bg-surface-2 rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="p-8 space-y-8">

      {/* ── Hero: Portfolio Overview ─────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-lg bg-surface-2 h-60 flex items-center px-12">
        <div className="z-10 relative">
          <p className="font-label text-xs uppercase tracking-[0.4em] text-accent mb-2">
            Portfolio Overview
          </p>
          <h1 className="font-headline text-6xl font-light text-text tracking-tighter mb-4">
            {totalValue > 0 ? formatCurrency(totalValue) : "—"}
          </h1>
          <div className="flex items-center gap-6">
            <span className="text-text-dim text-xs uppercase tracking-widest">
              {totalItems} items of distinction
            </span>
            {valuedItems > 0 && (
              <span className="text-text-dim text-xs uppercase tracking-widest border-l border-border-2 pl-6">
                {valuedItems} valued
              </span>
            )}
          </div>
        </div>
        {/* Decorative gradient */}
        <div className="absolute right-0 top-0 bottom-0 w-2/5 pointer-events-none overflow-hidden">
          <div className="absolute inset-0 vault-gradient opacity-[0.12]" />
          <div className="absolute inset-0 bg-gradient-to-l from-transparent to-surface-2" />
        </div>
        {/* Decorative watermark */}
        <div className="absolute right-10 top-1/2 -translate-y-1/2 opacity-[0.06] pointer-events-none select-none">
          <svg className="w-44 h-44 text-accent" viewBox="0 0 24 24" fill="currentColor">
            <path d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
          </svg>
        </div>
      </section>

      {/* ── Bento Grid ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* Portfolio Value Chart — 8 cols */}
        <PortfolioChart />

        {/* Right column — Recent Entry + Status */}
        <div className="lg:col-span-4 flex flex-col gap-6">

          {/* Recent Entry */}
          {data?.recent_item ? (
            <div
              className="bg-surface-3 rounded-lg p-5 group hover:bg-surface-container-highest transition-all duration-300 cursor-pointer"
              onClick={() => openItem(data.recent_item!.id, data.recent_item!.collection_type)}
            >
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-headline text-base text-text">Recent Entry</h4>
                <button
                  onClick={(e) => { e.stopPropagation(); openItem(data.recent_item!.id, data.recent_item!.collection_type); }}
                  className="text-accent opacity-60 hover:opacity-100 transition-opacity"
                  title="Open detail"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                  </svg>
                </button>
              </div>
              <div className="flex gap-4">
                <div className="w-20 h-20 rounded bg-surface-container-lowest overflow-hidden flex-shrink-0">
                  {data.recent_item.primary_image_path ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={data.recent_item.primary_image_path}
                      alt={`${data.recent_item.brand} ${data.recent_item.model}`}
                      className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500"
                    />
                  ) : (
                    <div className="w-full h-full image-placeholder flex items-center justify-center">
                      <svg className="w-8 h-8 text-text-dim opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
                      </svg>
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {isCollectionType(data.recent_item.collection_type) && (
                      <span className={`text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded ${COLLECTION_TYPES[data.recent_item.collection_type].badge}`}>
                        {COLLECTION_TYPES[data.recent_item.collection_type].label}
                      </span>
                    )}
                  </div>
                  <p className="font-headline text-text text-sm leading-snug">
                    {[data.recent_item.year, data.recent_item.brand, data.recent_item.model].filter(Boolean).join(" ")}
                  </p>
                  {data.recent_item.subtitle && (
                    <p className="text-text-dim text-xs mt-0.5">{data.recent_item.subtitle}</p>
                  )}
                  <p className="text-accent font-label font-bold text-sm mt-2">
                    {formatCurrency(data.recent_item.latest_user_price ?? data.recent_item.latest_ai_price ?? null)}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-surface-3 rounded-lg p-5 flex flex-col items-center justify-center text-center min-h-[140px]">
              <p className="text-text-dim text-sm">No items yet</p>
              <div className="flex items-center gap-3 mt-2">
                <Link href="/guitars" className="text-accent text-xs hover:underline">Add a guitar →</Link>
                <span className="text-text-dim text-xs">·</span>
                <Link href="/watches" className="text-accent text-xs hover:underline">Add a watch →</Link>
              </div>
            </div>
          )}

          {/* Collection Status */}
          <div className="bg-surface-container-lowest border border-border rounded-lg p-5 flex flex-col items-center justify-center text-center flex-1 min-h-[120px]">
            <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center mb-3 flex-shrink-0">
              <svg className="w-5 h-5 text-on-primary" viewBox="0 0 24 24" fill="currentColor">
                <path fillRule="evenodd" d="M12 1.5a5.25 5.25 0 00-5.25 5.25v3a3 3 0 00-3 3v6.75a3 3 0 003 3h10.5a3 3 0 003-3v-6.75a3 3 0 00-3-3v-3c0-2.9-2.35-5.25-5.25-5.25zm3.75 8.25v-3a3.75 3.75 0 10-7.5 0v3h7.5z" clipRule="evenodd" />
              </svg>
            </div>
            <h5 className="text-text font-headline text-base">Collection Secured</h5>
            <p className="text-text-dim text-xs mt-1 leading-relaxed px-2">
              Full provenance and valuation history tracked for every item.
            </p>
          </div>
        </div>
      </div>

      {/* ── Portfolio Split Cards ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 xl:grid-cols-4">

        {/* Guitar Portfolio */}
        {isEnabled("guitars") && <div className="bg-surface-2 rounded-lg p-8 relative overflow-hidden group">
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-5">
              <svg className="w-5 h-5 text-accent flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
              </svg>
              <h3 className="font-headline text-2xl text-text">Guitar Portfolio</h3>
            </div>
            <div className="flex items-baseline gap-2 mb-7">
              <span className="text-5xl font-headline text-text">{data?.guitar_portfolio?.total_items ?? data?.portfolio.total_items ?? 0}</span>
              <span className="text-text-dim text-xs uppercase tracking-widest font-bold">Instruments</span>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-text-dim">Estimated Value</span>
                <span className="text-accent font-bold font-mono">
                  {(data?.guitar_portfolio?.total_value ?? 0) > 0
                    ? formatCurrency(data?.guitar_portfolio?.total_value)
                    : "—"}
                </span>
              </div>
              <div className="w-full bg-surface-3 h-px" />
              <div className="flex justify-between items-center text-xs uppercase tracking-widest text-text-dim pt-1">
                <span>{data?.guitar_portfolio?.valued_items ?? 0} of {data?.guitar_portfolio?.total_items ?? data?.portfolio.total_items ?? 0} valued</span>
                <Link href="/guitars" className="text-accent hover:underline">View All</Link>
              </div>
            </div>
          </div>
          <div className="absolute -right-10 -bottom-10 opacity-[0.04] group-hover:opacity-[0.08] transition-opacity duration-500 pointer-events-none">
            <svg className="w-48 h-48 text-accent" viewBox="0 0 24 24" fill="currentColor">
              <path d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
            </svg>
          </div>
        </div>}

        {/* Watch Portfolio */}
        {isEnabled("watches") && <Link href="/watches" className="bg-surface-2 rounded-lg p-8 relative overflow-hidden group block hover:bg-surface-3 transition-colors">
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-5">
              <svg className="w-5 h-5 text-accent flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h3 className="font-headline text-2xl text-text">Watch Portfolio</h3>
            </div>
            <div className="flex items-baseline gap-2 mb-7">
              <span className="text-5xl font-headline text-text">{data?.watch_portfolio?.total_items ?? 0}</span>
              <span className="text-text-dim text-xs uppercase tracking-widest font-bold">Timepieces</span>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-text-dim">Estimated Value</span>
                <span className="text-accent font-bold font-mono">
                  {data?.watch_portfolio && data.watch_portfolio.total_value > 0
                    ? formatCurrency(data.watch_portfolio.total_value)
                    : "—"}
                </span>
              </div>
              <div className="w-full bg-surface-3 h-px" />
              <div className="flex justify-between items-center text-xs uppercase tracking-widest text-text-dim pt-1">
                <span>{data?.watch_portfolio?.valued_items ?? 0} of {data?.watch_portfolio?.total_items ?? 0} valued</span>
                <span className="text-accent">View All</span>
              </div>
            </div>
          </div>
          <div className="absolute -right-10 -bottom-10 opacity-[0.04] group-hover:opacity-[0.08] transition-opacity duration-500 pointer-events-none">
            <svg className="w-48 h-48 text-accent" viewBox="0 0 24 24" fill="currentColor">
              <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zM12.75 6a.75.75 0 00-1.5 0v6c0 .414.336.75.75.75h4.5a.75.75 0 000-1.5h-3.75V6z" clipRule="evenodd" />
            </svg>
          </div>
        </Link>}

        {/* Automobile Portfolio */}
        {isEnabled("automobiles") && <Link href="/automobiles" className="bg-surface-2 rounded-lg p-8 relative overflow-hidden group block hover:bg-surface-3 transition-colors">
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-5">
              <svg className="w-5 h-5 text-[#4ade80] flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16l2-6h14l2 6M1 16h22M5 16v2M19 16v2M8 10h8" />
              </svg>
              <h3 className="font-headline text-2xl text-text">Automobile Portfolio</h3>
            </div>
            <div className="flex items-baseline gap-2 mb-7">
              <span className="text-5xl font-headline text-text">{data?.auto_portfolio?.total_items ?? 0}</span>
              <span className="text-text-dim text-xs uppercase tracking-widest font-bold">Vehicles</span>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-text-dim">Estimated Value</span>
                <span className="text-[#4ade80] font-bold font-mono">
                  {data?.auto_portfolio && data.auto_portfolio.total_value > 0
                    ? formatCurrency(data.auto_portfolio.total_value)
                    : "—"}
                </span>
              </div>
              <div className="w-full bg-surface-3 h-px" />
              <div className="flex justify-between items-center text-xs uppercase tracking-widest text-text-dim pt-1">
                <span>{data?.auto_portfolio?.valued_items ?? 0} of {data?.auto_portfolio?.total_items ?? 0} valued</span>
                <span className="text-[#4ade80]">View All</span>
              </div>
            </div>
          </div>
          <div className="absolute -right-10 -bottom-10 opacity-[0.04] group-hover:opacity-[0.08] transition-opacity duration-500 pointer-events-none">
            <svg className="w-48 h-48 text-[#4ade80]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={0.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16l2-6h14l2 6M1 16h22M5 16v2M19 16v2M8 10h8" />
            </svg>
          </div>
        </Link>}

        {/* Collectibles Portfolio */}
        {isEnabled("collectibles") && <Link href="/collectibles" className="bg-surface-2 rounded-lg p-8 relative overflow-hidden group block hover:bg-surface-3 transition-colors">
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-5">
              <svg className="w-5 h-5 text-[#a78bfa] flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 2l3 7h6l-5 4 2 7-6-4-6 4 2-7-5-4h6z" />
              </svg>
              <h3 className="font-headline text-2xl text-text">Collectibles</h3>
            </div>
            <div className="flex items-baseline gap-2 mb-7">
              <span className="text-5xl font-headline text-text">{data?.iod_portfolio?.total_items ?? 0}</span>
              <span className="text-text-dim text-xs uppercase tracking-widest font-bold">Items</span>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-text-dim">Estimated Value</span>
                <span className="text-[#a78bfa] font-bold font-mono">
                  {data?.iod_portfolio && data.iod_portfolio.total_value > 0
                    ? formatCurrency(data.iod_portfolio.total_value)
                    : "—"}
                </span>
              </div>
              <div className="w-full bg-surface-3 h-px" />
              <div className="flex justify-between items-center text-xs uppercase tracking-widest text-text-dim pt-1">
                <span>{data?.iod_portfolio?.valued_items ?? 0} of {data?.iod_portfolio?.total_items ?? 0} valued</span>
                <span className="text-[#a78bfa]">View All</span>
              </div>
            </div>
          </div>
          <div className="absolute -right-10 -bottom-10 opacity-[0.04] group-hover:opacity-[0.08] transition-opacity duration-500 pointer-events-none">
            <svg className="w-48 h-48 text-[#a78bfa]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={0.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 2l3 7h6l-5 4 2 7-6-4-6 4 2-7-5-4h6z" />
            </svg>
          </div>
        </Link>}
      </div>

      {/* ── Provenance Activity ───────────────────────────────────────────── */}
      <section className="pb-8">
        <h4 className="font-headline text-2xl text-text mb-6 border-b border-border pb-4">
          Provenance Activity
        </h4>

        <div className="grid grid-cols-12 gap-8 items-start">
          {/* Timeline — left 4 cols */}
          <div className="col-span-12 lg:col-span-4">
            {data?.activity && data.activity.length > 0 ? (
              <div className="space-y-0">
                {data.activity.map((event, i) => {
                  const isFirst = i === 0;
                  const isLast = i === data.activity.length - 1;
                  return (
                    <div key={`${event.event_date}-${i}`} className="flex gap-6 group">
                      {/* Timeline spine */}
                      <div className="flex flex-col items-center flex-shrink-0 pt-0.5">
                        <div className={`flex items-center justify-center rounded-full flex-shrink-0 transition-colors ${
                          isFirst
                            ? "w-5 h-5 bg-accent text-on-primary ring-4 ring-accent/20"
                            : "w-4 h-4 bg-outline-variant/40 group-hover:bg-accent/60 transition-colors mt-0.5"
                        }`}>
                          {isFirst && <EventIcon type={event.event_type} />}
                        </div>
                        {!isLast && (
                          <div className="w-px flex-1 bg-outline-variant/20 mt-1 min-h-[2.5rem]" />
                        )}
                      </div>

                      {/* Content */}
                      <div className="pb-7 min-w-0 flex-1">
                        <p className={`text-[10px] font-bold uppercase tracking-[0.2em] mb-1 ${
                          isFirst ? "text-accent" : "text-text-dim"
                        }`}>
                          {formatDate(event.event_date)}
                        </p>
                        <button
                          type="button"
                          onClick={() => openItem(event.item_id, event.collection_type)}
                          className="text-left text-text text-sm font-medium hover:text-accent hover:underline transition-colors"
                        >
                          {event.title}
                        </button>
                        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                          <p className="text-text-dim text-xs">{event.subtitle}</p>
                          {event.value != null && Number(event.value) > 0 && (
                            <span className="text-xs font-mono text-accent">
                              {formatCurrency(Number(event.value))}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-text-dim text-sm">No activity yet.</p>
                <Link href="/guitars" className="text-accent text-sm mt-2 hover:underline block">
                  Start by adding an item →
                </Link>
              </div>
            )}
          </div>

          {/* Scattered photo stack — right 5 cols */}
          <div className="hidden lg:flex col-span-8 items-center justify-center self-stretch">
            <PhotoStack images={data?.random_images ?? []} />
          </div>
        </div>
      </section>

    </div>

    {/* Failed item open */}
    {openError && (
      <div role="alert" className="fixed bottom-6 right-6 z-50 max-w-sm flex items-start gap-3 bg-surface border border-red-400/40 rounded-xl shadow-2xl px-4 py-3">
        <p className="text-red-400 text-sm flex-1">{openError}</p>
        <button
          onClick={() => setOpenError(null)}
          className="text-text-dim hover:text-text text-sm leading-none"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    )}

    {/* Item detail modals */}
    {modalItem && modalType === "guitar" && (
      <ItemDetailModal
        item={modalItem as GuitarItem}
        onClose={closeModal}
        onDelete={onModalDelete}
        onValuationSaved={() => loadDashboard()}
        onItemUpdated={(updated) => setModalItem(updated)}
      />
    )}
    {modalItem && modalType === "watch" && (
      <WatchDetailModal
        item={modalItem as WatchItem}
        onClose={closeModal}
        onDelete={onModalDelete}
        onValuationSaved={() => loadDashboard()}
        onItemUpdated={(updated) => setModalItem(updated)}
      />
    )}
    {modalItem && modalType === "auto" && (
      <AutomobileDetailModal
        item={modalItem as AutoItem}
        onClose={closeModal}
        onDelete={onModalDelete}
        onValuationSaved={() => loadDashboard()}
        onItemUpdated={(updated) => setModalItem(updated)}
      />
    )}
    {modalItem && modalType === "iod" && (
      <IoDDetailModal
        item={modalItem as IoDItem}
        onClose={closeModal}
        onDelete={onModalDelete}
        onValuationSaved={() => loadDashboard()}
        onItemUpdated={(updated) => setModalItem(updated)}
      />
    )}
    </>
  );
}
