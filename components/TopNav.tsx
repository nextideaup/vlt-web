"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { useUserModules } from "@/lib/UserModulesContext";
import { useHideValues } from "@/lib/HideValuesContext";
import ManageCollectionsModal from "@/components/ManageCollectionsModal";

export default function TopNav() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { isEnabled } = useUserModules();
  const { hideValues, toggle: toggleHideValues } = useHideValues();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showManageCollections, setShowManageCollections] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isDashboardActive = pathname === "/";
  const isGuitarsActive = pathname.startsWith("/guitars");
  const isWatchesActive = pathname.startsWith("/watches");
  const isAutosActive = pathname.startsWith("/automobiles");
  const isCollectiblesActive = pathname.startsWith("/collectibles");

  // Close menu on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const userInitial = session?.user?.name
    ? session.user.name.charAt(0).toUpperCase()
    : session?.user?.email?.charAt(0).toUpperCase() ?? "?";

  return (
    <>
    <nav className="fixed top-0 left-0 right-0 z-50 h-16 flex items-center justify-between px-6 bg-[#0c0e10] border-b border-border">
      {/* Left — Wordmark + nav */}
      <div className="flex items-center gap-8">
        <Link href="/" className="flex items-center flex-shrink-0 group">
          <span className="font-headline text-xl font-bold text-accent tracking-widest uppercase">
            Vault 1
          </span>
        </Link>

        {/* Center nav links */}
        <div className="hidden md:flex items-center gap-1">
          <Link
            href="/"
            className={`px-3 py-1.5 text-sm font-medium transition-colors duration-200 ${
              isDashboardActive
                ? "text-accent border-b-2 border-accent"
                : "text-text-dim hover:text-text hover:bg-surface-2 rounded"
            }`}
          >
            Dashboard
          </Link>
          {isEnabled("guitars") && (
            <Link
              href="/guitars"
              className={`px-3 py-1.5 text-sm font-medium transition-colors duration-200 ${
                isGuitarsActive
                  ? "text-accent border-b-2 border-accent"
                  : "text-text-dim hover:text-text hover:bg-surface-2 rounded"
              }`}
            >
              Guitars
            </Link>
          )}
          {isEnabled("watches") && (
            <Link
              href="/watches"
              className={`px-3 py-1.5 text-sm font-medium transition-colors duration-200 ${
                isWatchesActive
                  ? "text-accent border-b-2 border-accent"
                  : "text-text-dim hover:text-text hover:bg-surface-2 rounded"
              }`}
            >
              Watches
            </Link>
          )}
          {isEnabled("automobiles") && (
            <Link
              href="/automobiles"
              className={`px-3 py-1.5 text-sm font-medium transition-colors duration-200 ${
                isAutosActive
                  ? "text-accent border-b-2 border-accent"
                  : "text-text-dim hover:text-text hover:bg-surface-2 rounded"
              }`}
            >
              Automobiles
            </Link>
          )}
          {isEnabled("collectibles") && (
            <Link
              href="/collectibles"
              className={`px-3 py-1.5 text-sm font-medium transition-colors duration-200 ${
                isCollectiblesActive
                  ? "text-accent border-b-2 border-accent"
                  : "text-text-dim hover:text-text hover:bg-surface-2 rounded"
              }`}
            >
              Collectibles
            </Link>
          )}
        </div>
      </div>

      {/* Right — Hide-values toggle + User menu. (The inert "Search archives…"
          box was removed under VLT-40; each collection list has its own search.) */}
      <div className="flex items-center gap-4">
        {/* Hide-values toggle. Eye icon when values are visible (click to
            hide); eye-slash when hidden (click to show). Per-device only —
            see lib/HideValuesContext.tsx. */}
        <button
          onClick={toggleHideValues}
          className="w-9 h-9 rounded-lg border border-border bg-surface-2 hover:bg-surface-3 text-text-dim hover:text-text transition-colors flex items-center justify-center flex-shrink-0"
          aria-label={hideValues ? "Show dollar values" : "Hide dollar values"}
          title={hideValues ? "Show dollar values" : "Hide dollar values"}
        >
          {hideValues ? (
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
            </svg>
          ) : (
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          )}
        </button>

        {/* User avatar/menu */}
        {session?.user && (
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="w-8 h-8 rounded-full bg-accent text-[#0c0e10] font-bold text-sm flex items-center justify-center hover:opacity-90 transition-opacity flex-shrink-0"
              aria-label="User menu"
            >
              {userInitial}
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-10 w-52 bg-surface border border-border rounded-xl shadow-2xl overflow-hidden z-50">
                <div className="px-4 py-3 border-b border-border">
                  <p className="text-sm font-medium text-text truncate">{session.user.name || "User"}</p>
                  <p className="text-xs text-text-muted truncate">{session.user.email}</p>
                </div>
                <button
                  onClick={() => { setMenuOpen(false); setShowManageCollections(true); }}
                  className="w-full text-left px-4 py-2.5 text-sm text-text-dim hover:text-text hover:bg-surface-2 transition-colors flex items-center gap-2"
                >
                  <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
                  </svg>
                  Manage Collections
                </button>
                {/* Admin-only link. `session.user.isAdmin` is stamped from the
                    ADMIN_EMAILS env-var allowlist by lib/auth.ts callbacks;
                    the page itself re-checks server-side, so this UI gate is
                    cosmetic. See lib/admin.ts. */}
                {session.user.isAdmin && (
                  <Link
                    href="/admin/moderation"
                    onClick={() => setMenuOpen(false)}
                    className="w-full text-left px-4 py-2.5 text-sm text-text-dim hover:text-text hover:bg-surface-2 transition-colors flex items-center gap-2"
                  >
                    <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Moderation Queue
                  </Link>
                )}
                <Link
                  href="/privacy"
                  onClick={() => setMenuOpen(false)}
                  className="w-full text-left px-4 py-2.5 text-sm text-text-dim hover:text-text hover:bg-surface-2 transition-colors flex items-center gap-2"
                >
                  <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                  </svg>
                  Privacy
                </Link>
                <div className="border-t border-border/50" />
                <button
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  className="w-full text-left px-4 py-2.5 text-sm text-text-dim hover:text-text hover:bg-surface-2 transition-colors flex items-center gap-2"
                >
                  <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
                  </svg>
                  Sign Out
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </nav>

    {showManageCollections && (
      <ManageCollectionsModal onClose={() => setShowManageCollections(false)} />
    )}
    </>
  );
}
