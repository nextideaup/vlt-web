"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { JSON_ATTACH_RULES } from "@/lib/attach/rules";
import { useFileAttach } from "@/lib/hooks/useFileAttach";

interface ValidationError { row: number; field: string; message: string; }
interface ValidationResult { count: number; errors: ValidationError[]; }
interface ImportResult {
  imported: number;
  skipped_existing: number;
  skipped_invalid: number;
  valuations_imported: number;
  // v1.2: image-row counts. `images_imported` is the DB-row count;
  // `image_bytes_written` is the subset where bytes were actually re-uploaded
  // (only when the export carried `data_base64`).
  images_imported: number;
  image_bytes_written: number;
  errors: ValidationError[];
}

type Tab = "export" | "import";
type ImportStep = "select" | "preview" | "done";

const COLLECTIONS = [
  { key: "guitars",      label: "Guitars",      icon: "🎸" },
  { key: "watches",      label: "Watches",      icon: "⌚" },
  { key: "automobiles",  label: "Automobiles",  icon: "🚗" },
  { key: "collectibles", label: "Collectibles", icon: "⭐" },
] as const;

type CollectionKey = (typeof COLLECTIONS)[number]["key"];

export default function ImportExportModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("export");

  // ── Export state ─────────────────────────────────────────────────────────
  const [selected, setSelected]     = useState<Set<CollectionKey>>(new Set<CollectionKey>(["guitars", "watches", "automobiles", "collectibles"]));
  const [exporting, setExporting]   = useState(false);
  // v1.2: opt-in to embedding image bytes (base64) in the JSON. Off by
  // default — the file stays small and the export covers "I'm migrating
  // within the same R2 bucket" cleanly. On = full portability backup that
  // survives an R2 wipe; can balloon the file to hundreds of MB.
  const [includeImageData, setIncludeImageData] = useState(false);

  const toggleCollection = (key: CollectionKey) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const doExport = async () => {
    if (selected.size === 0) return;
    setExporting(true);
    try {
      const res  = await fetch("/api/data/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collections: Array.from(selected),
          include_image_data: includeImageData,
        }),
      });
      const data = await res.json();
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `vault1-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
    } finally {
      setExporting(false);
    }
  };

  // ── Import state ──────────────────────────────────────────────────────────
  const [importStep, setImportStep]       = useState<ImportStep>("select");
  const [fileName, setFileName]           = useState("");
  const [fileData, setFileData]           = useState<unknown>(null);
  const [parseError, setParseError]       = useState("");
  const [validating, setValidating]       = useState(false);
  const [validation, setValidation]       = useState<Record<string, ValidationResult> | null>(null);
  const [importing, setImporting]         = useState(false);
  const [importResults, setImportResults] = useState<Record<string, ImportResult> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File) => {
    setParseError("");
    setValidation(null);
    setImportStep("select");
    if (!file.name.endsWith(".json")) {
      setParseError("Only .json files are supported.");
      return;
    }
    setFileName(file.name);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      setFileData(parsed);
      // Validate immediately
      setValidating(true);
      const res = await fetch("/api/data/import", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: text,
      });
      const result = await res.json();
      if (result.error) {
        setParseError(result.error);
        setFileData(null);
      } else {
        setValidation(result.results);
        setImportStep("preview");
      }
    } catch {
      setParseError("Could not parse file. Make sure it is a valid Vault 1 JSON export.");
      setFileData(null);
    } finally {
      setValidating(false);
    }
  }, []);

  // VLT-47 (STD-FRM-002): picker, drop and paste all run JSON_ATTACH_RULES
  // (one .json) before processFile. Paste is live only on the import step.
  const attach = useFileAttach({
    rules: JSON_ATTACH_RULES,
    onFiles: (files) => { void processFile(files[0]); },
    enabled: tab === "import" && importStep === "select" && !validating,
  });

  const [importError, setImportError] = useState("");

  const doImport = async () => {
    if (!fileData) return;
    setImporting(true);
    setImportError("");
    try {
      const res = await fetch("/api/data/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fileData),
      });
      const result = await res.json();
      if (result.error) {
        setImportError(result.error);
      } else {
        setImportResults(result.results);
        setImportStep("done");
      }
    } catch (e) {
      setImportError(String(e));
    } finally {
      setImporting(false);
    }
  };

  const resetImport = () => {
    setImportStep("select");
    setFileName("");
    setFileData(null);
    setParseError("");
    setImportError("");
    setValidation(null);
    setImportResults(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const totalErrors = validation
    ? Object.values(validation).reduce((n, v) => n + v.errors.length, 0)
    : 0;
  const totalValid = validation
    ? Object.values(validation).reduce((n, v) => n + (v.count - v.errors.length), 0)
    : 0;

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-lg bg-surface border border-border rounded-2xl shadow-2xl flex flex-col max-h-[85vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-text">Import / Export</h2>
            <p className="text-xs text-text-muted mt-0.5">Backup or restore your vault collections</p>
          </div>
          <button
            aria-label="Close"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-text-dim hover:text-text hover:bg-surface-2 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="px-6 flex-shrink-0">
          <div className="flex bg-surface-2 rounded-xl p-1 gap-1">
            {(["export", "import"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold uppercase tracking-wider transition-all ${
                  tab === t
                    ? "bg-surface-3 text-text shadow-sm"
                    : "text-text-dim hover:text-text"
                }`}
              >
                {t === "export" ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    </svg>
                    Export
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 7.5m0 0L7.5 12m4.5-4.5V21" />
                    </svg>
                    Import
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">

          {/* ── EXPORT ── */}
          {tab === "export" && (
            <div className="space-y-4">
              <p className="text-sm text-text-muted">
                Select which collections to include in the export. A JSON file will be downloaded to your device.
              </p>

              {/* Collection checkboxes */}
              <div className="space-y-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold uppercase tracking-wider text-text-dim">Collections</span>
                  <button
                    onClick={() =>
                      selected.size === COLLECTIONS.length
                        ? setSelected(new Set<CollectionKey>())
                        : setSelected(new Set<CollectionKey>(COLLECTIONS.map((c) => c.key)))
                    }
                    className="text-xs text-accent hover:underline"
                  >
                    {selected.size === COLLECTIONS.length ? "Deselect all" : "Select all"}
                  </button>
                </div>
                {COLLECTIONS.map(({ key, label, icon }) => (
                  <label
                    key={key}
                    className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                      selected.has(key)
                        ? "border-accent/50 bg-accent/5"
                        : "border-border bg-surface-2 hover:bg-surface-3"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(key)}
                      onChange={() => toggleCollection(key)}
                      className="accent-[#e9c176] w-4 h-4 flex-shrink-0"
                    />
                    <span className="text-base">{icon}</span>
                    <span className="text-sm font-medium text-text">{label}</span>
                  </label>
                ))}
              </div>

              {/* Image-bytes opt-in. Off by default — most exports are
                  same-bucket roundtrips where the bytes are already in R2
                  and embedding them just bloats the JSON. */}
              <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                includeImageData
                  ? "border-accent/50 bg-accent/5"
                  : "border-border bg-surface-2 hover:bg-surface-3"
              }`}>
                <input
                  type="checkbox"
                  checked={includeImageData}
                  onChange={(e) => setIncludeImageData(e.target.checked)}
                  className="accent-[#e9c176] w-4 h-4 flex-shrink-0 mt-0.5"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium text-text">Include image data</div>
                  <p className="text-xs text-text-dim mt-0.5">
                    Embed the raw image bytes (base64) so the export is a complete backup that survives a storage wipe. Significantly larger file — leave off if you&apos;re just moving data between deploys that share the same R2 bucket.
                  </p>
                </div>
              </label>

              <div className="pt-1 text-xs text-text-dim bg-surface-2 rounded-xl p-3 border border-border">
                <strong className="text-text">Note:</strong> Image rows (filename, ordering, moderation status) are always included so a re-import preserves them. Image bytes are embedded only when the option above is checked.
              </div>
            </div>
          )}

          {/* ── IMPORT ── */}
          {tab === "import" && (
            <div className="space-y-4">

              {importStep === "select" && (
                <>
                  <p className="text-sm text-text-muted">
                    Upload a Vault 1 JSON export file. Records that already exist (matching ID) will be skipped.
                  </p>

                  {/* Drop zone */}
                  <div
                    {...attach.dropProps}
                    onClick={() => fileRef.current?.click()}
                    className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                      attach.dragOver
                        ? "border-accent bg-accent/10"
                        : "border-border hover:border-accent/50 hover:bg-surface-2"
                    }`}
                  >
                    <svg className="w-10 h-10 mx-auto mb-3 text-text-dim" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                    <p className="text-sm font-medium text-text mb-1">
                      {attach.dragOver ? "Drop to upload" : "Drop file here, paste it, or click to browse"}
                    </p>
                    <p className="text-xs text-text-dim">Supports .json files exported from Vault 1 (or legacy Curatada exports)</p>
                    <input ref={fileRef} type="file" className="hidden" {...attach.inputProps} />
                  </div>

                  {attach.notice && (
                    <div role="alert" className="bg-red-900/20 border border-red-700/40 rounded-xl p-3 text-sm text-red-400">
                      {attach.notice}
                    </div>
                  )}

                  {parseError && (
                    <div className="bg-red-900/20 border border-red-700/40 rounded-xl p-3 text-sm text-red-400">
                      {parseError}
                    </div>
                  )}

                  {validating && (
                    <div className="flex items-center gap-2 text-sm text-text-muted">
                      <svg className="w-4 h-4 animate-spin text-accent" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      Validating file…
                    </div>
                  )}
                </>
              )}

              {importStep === "preview" && validation && (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-sm font-medium text-text truncate">{fileName}</span>
                  </div>

                  {/* Per-collection preview */}
                  <div className="space-y-2">
                    {COLLECTIONS.map(({ key, label, icon }) => {
                      const v = validation[key];
                      if (!v) return null;
                      const valid = v.count - v.errors.length;
                      const hasErrors = v.errors.length > 0;
                      return (
                        <div key={key} className={`rounded-xl border p-3 ${hasErrors ? "border-yellow-700/40 bg-yellow-900/10" : "border-border bg-surface-2"}`}>
                          <div className="flex items-center justify-between">
                            <span className="flex items-center gap-2 text-sm font-medium text-text">
                              <span>{icon}</span>{label}
                            </span>
                            <div className="flex items-center gap-3 text-xs">
                              <span className="text-green-400">{valid} valid</span>
                              {hasErrors && <span className="text-yellow-400">{v.errors.length} error{v.errors.length !== 1 ? "s" : ""}</span>}
                            </div>
                          </div>
                          {hasErrors && (
                            <ul className="mt-2 space-y-1 max-h-24 overflow-y-auto">
                              {v.errors.slice(0, 8).map((e, i) => (
                                <li key={i} className="text-xs text-yellow-300/80">
                                  Row {e.row} · <span className="font-mono">{e.field}</span>: {e.message}
                                </li>
                              ))}
                              {v.errors.length > 8 && (
                                <li className="text-xs text-text-dim">…and {v.errors.length - 8} more</li>
                              )}
                            </ul>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {totalErrors > 0 && (
                    <p className="text-xs text-yellow-400">
                      {totalErrors} row{totalErrors !== 1 ? "s" : ""} with errors will be skipped. {totalValid} valid records will be imported.
                    </p>
                  )}
                  {totalValid === 0 && totalErrors === 0 && (
                    <p className="text-xs text-text-dim">No records found in this file.</p>
                  )}
                  {totalValid === 0 && totalErrors > 0 && (
                    <p className="text-xs text-red-400">All records have errors — nothing to import.</p>
                  )}

                  {importError && (
                    <div className="bg-red-900/20 border border-red-700/40 rounded-xl p-3 text-sm text-red-400">
                      {importError}
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={resetImport}
                      className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
                    >
                      Choose different file
                    </button>
                  </div>
                </>
              )}

              {importStep === "done" && importResults && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-green-400">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-sm font-semibold">Import complete</span>
                  </div>
                  <div className="space-y-2">
                    {COLLECTIONS.map(({ key, label, icon }) => {
                      const r = importResults[key];
                      if (!r) return null;
                      const dbErrors = r.errors.filter(e => e.field === "db");
                      return (
                        <div key={key} className={`rounded-xl border p-3 ${dbErrors.length > 0 ? "border-red-700/40 bg-red-900/10" : "border-border bg-surface-2"}`}>
                          <div className="flex items-center justify-between">
                            <span className="flex items-center gap-2 text-sm text-text">
                              <span>{icon}</span>{label}
                            </span>
                            <div className="flex items-center gap-3 text-xs flex-wrap justify-end">
                              <span className="text-green-400">{r.imported} imported</span>
                              {r.valuations_imported > 0 && (
                                <span className="text-accent">+{r.valuations_imported} valuation{r.valuations_imported === 1 ? "" : "s"}</span>
                              )}
                              {r.images_imported > 0 && (
                                <span className="text-accent" title={r.image_bytes_written > 0 ? `${r.image_bytes_written} re-uploaded to storage` : "metadata only"}>
                                  +{r.images_imported} image{r.images_imported === 1 ? "" : "s"}
                                  {r.image_bytes_written > 0 && ` (${r.image_bytes_written} w/bytes)`}
                                </span>
                              )}
                              {r.skipped_existing > 0 && (
                                <span className="text-text-dim">{r.skipped_existing} already present</span>
                              )}
                              {r.skipped_invalid > 0 && (
                                <span className="text-yellow-400">{r.skipped_invalid} invalid</span>
                              )}
                            </div>
                          </div>
                          {dbErrors.length > 0 && (
                            <p className="text-xs text-red-400 mt-1">{dbErrors[0].message}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <button
                    onClick={() => { resetImport(); onClose(); }}
                    className="w-full py-2.5 rounded-xl bg-surface-2 border border-border text-sm font-medium text-text hover:bg-surface-3 transition-colors mt-2"
                  >
                    Done
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 border-t border-border flex-shrink-0">
          {tab === "export" && (
            <button
              onClick={doExport}
              disabled={exporting || selected.size === 0}
              className="w-full vault-gradient text-on-primary font-bold text-sm uppercase tracking-widest py-3 rounded-xl shadow disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              {exporting ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Exporting…
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                  Export {selected.size} Collection{selected.size !== 1 ? "s" : ""}
                </>
              )}
            </button>
          )}

          {tab === "import" && importStep === "preview" && (
            <button
              onClick={doImport}
              disabled={importing || totalValid === 0}
              title={totalValid === 0 ? "No valid records to import — check the errors above" : undefined}
              className="w-full vault-gradient text-on-primary font-bold text-sm uppercase tracking-widest py-3 rounded-xl shadow disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              {importing ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Importing…
                </>
              ) : totalValid === 0 ? (
                "No valid records to import"
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 7.5m0 0L7.5 12m4.5-4.5V21" />
                  </svg>
                  Import {totalValid} Record{totalValid !== 1 ? "s" : ""}
                </>
              )}
            </button>
          )}

          {tab === "import" && importStep === "select" && (
            <p className="text-center text-xs text-text-dim">
              Select a .json file above to begin
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
