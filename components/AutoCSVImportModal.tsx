"use client";

import { useState, useRef, useCallback } from "react";
import { AutoCategory, AUTO_CATEGORIES, AUTO_CATEGORY_LABELS, CONDITIONS } from "@/lib/types";

interface AutoCSVImportModalProps {
  defaultCategory: AutoCategory;
  onClose: () => void;
  onImportComplete: (count: number) => void;
}

type Step = "upload" | "map" | "preview" | "importing" | "done";

interface ParsedRow { [key: string]: string; }

interface MappedRow {
  category: string;
  brand: string;
  model: string;
  year: string;
  description: string;
  trim_level: string;
  engine: string;
  transmission: string;
  mileage: string;
  condition: string;
  body_style: string;
  color: string;
  vin: string;
  purchase_price: string;
  purchase_date: string;
  purchase_source: string;
  notes: string;
  _rowIndex: number;
  _valid: boolean;
  _errors: string[];
}

interface ColumnMap {
  category: string;
  brand: string;
  model: string;
  year: string;
  description: string;
  trim_level: string;
  engine: string;
  transmission: string;
  mileage: string;
  condition: string;
  body_style: string;
  color: string;
  vin: string;
  purchase_price: string;
  purchase_date: string;
  purchase_source: string;
  notes: string;
}

const FIELD_LABELS: Record<keyof ColumnMap, string> = {
  category:       "Category *",
  brand:          "Brand / Make *",
  model:          "Model *",
  year:           "Year",
  description:    "Description",
  trim_level:     "Trim",
  engine:         "Engine",
  transmission:   "Transmission",
  mileage:        "Mileage",
  condition:      "Condition *",
  body_style:     "Body Style",
  color:          "Color",
  vin:            "VIN",
  purchase_price: "Purchase Price",
  purchase_date:  "Purchase Date",
  purchase_source:"Purchase Source",
  notes:          "Notes",
};

const REQUIRED_FIELDS: (keyof ColumnMap)[] = ["brand", "model", "condition", "category"];

const FIELD_ALIASES: Record<keyof ColumnMap, string[]> = {
  category:       ["category", "type", "cat"],
  brand:          ["brand", "make", "manufacturer"],
  model:          ["model", "name"],
  year:           ["year", "yr", "model year"],
  description:    ["description", "desc", "details"],
  trim_level:     ["trim", "trim level", "trim/level", "variant"],
  engine:         ["engine", "engine size", "displacement"],
  transmission:   ["transmission", "trans", "gearbox"],
  mileage:        ["mileage", "miles", "odometer", "km"],
  condition:      ["condition", "cond", "grade"],
  body_style:     ["body style", "body", "style", "type"],
  color:          ["color", "colour", "exterior color", "paint"],
  vin:            ["vin", "vin number", "chassis"],
  purchase_price: ["purchase price", "price", "paid", "cost", "buy price"],
  purchase_date:  ["purchase date", "date purchased", "bought date", "acquisition date"],
  purchase_source:["purchase source", "source", "seller", "dealer", "bought from"],
  notes:          ["notes", "note", "comments", "remarks"],
};

const TEMPLATE_CSV = `category,brand,model,year,description,trim_level,engine,transmission,mileage,condition,body_style,color,vin,purchase_price,purchase_source,notes
collection,Porsche,911 Carrera,1973,Numbers matching,Targa,,Manual,48000,Excellent,Coupe,Silver,,75000,Private Sale,
household,Toyota,Camry,2019,Daily driver,LE,2.5L 4-cyl,Automatic,32000,Good,Sedan,White,,22000,Dealer,`;

function parseCSV(text: string): { headers: string[]; rows: ParsedRow[] } {
  const lines: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "\n" && !inQuotes) { lines.push(current); current = ""; }
    else if (ch === "\r" && !inQuotes) { /* skip */ }
    else current += ch;
  }
  if (current) lines.push(current);

  const parseRow = (line: string): string[] => {
    const fields: string[] = [];
    let field = ""; let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { if (inQ && line[i + 1] === '"') { field += '"'; i++; } else inQ = !inQ; }
      else if (ch === "," && !inQ) { fields.push(field.trim()); field = ""; }
      else field += ch;
    }
    fields.push(field.trim());
    return fields;
  };

  const nonEmpty = lines.filter(l => l.trim());
  if (nonEmpty.length < 2) return { headers: [], rows: [] };
  const headers = parseRow(nonEmpty[0]).map(h => h.toLowerCase().trim());
  const rows: ParsedRow[] = nonEmpty.slice(1).map(line => {
    const values = parseRow(line);
    const row: ParsedRow = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ""; });
    return row;
  });
  return { headers, rows };
}

function autoMapColumns(headers: string[]): Partial<ColumnMap> {
  const map: Partial<ColumnMap> = {};
  for (const [field, aliases] of Object.entries(FIELD_ALIASES) as [keyof ColumnMap, string[]][]) {
    const match = headers.find(h => aliases.some(a => h === a || h.includes(a)));
    if (match) map[field] = match;
  }
  return map;
}

function validateRow(row: ParsedRow, map: ColumnMap): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const get = (f: keyof ColumnMap) => row[map[f]]?.trim() ?? "";

  if (!get("brand")) errors.push("Brand required");
  if (!get("model")) errors.push("Model required");

  const cat = get("category");
  if (!AUTO_CATEGORIES.includes(cat as AutoCategory))
    errors.push(`Invalid category "${cat || "(empty)"}". Must be: ${AUTO_CATEGORIES.join(", ")}`);

  const cond = get("condition");
  if (!CONDITIONS.includes(cond as never))
    errors.push(`Invalid condition "${cond || "(empty)"}"`);

  const yr = get("year");
  if (yr) {
    const n = parseInt(yr);
    if (isNaN(n) || n < 1800 || n > new Date().getFullYear() + 1) errors.push(`Invalid year "${yr}"`);
  }

  const price = get("purchase_price");
  if (price) {
    const n = parseFloat(price.replace(/[$,]/g, ""));
    if (isNaN(n) || n < 0) errors.push(`Invalid price "${price}"`);
  }

  const mileage = get("mileage");
  if (mileage) {
    const n = parseFloat(mileage.replace(/[,]/g, ""));
    if (isNaN(n) || n < 0) errors.push(`Invalid mileage "${mileage}"`);
  }

  return { valid: errors.length === 0, errors };
}

function buildMappedRows(rawRows: ParsedRow[], map: ColumnMap): MappedRow[] {
  return rawRows.map((row, i) => {
    const get = (f: keyof ColumnMap) => row[map[f]]?.trim() ?? "";
    const { valid, errors } = validateRow(row, map);
    return {
      category: get("category"), brand: get("brand"), model: get("model"),
      year: get("year"), description: get("description"), trim_level: get("trim_level"),
      engine: get("engine"), transmission: get("transmission"), mileage: get("mileage"),
      condition: get("condition"), body_style: get("body_style"), color: get("color"),
      vin: get("vin"), purchase_price: get("purchase_price"), purchase_date: get("purchase_date"),
      purchase_source: get("purchase_source"), notes: get("notes"),
      _rowIndex: i, _valid: valid, _errors: errors,
    };
  });
}

export default function AutoCSVImportModal({ defaultCategory, onClose, onImportComplete }: AutoCSVImportModalProps) {
  const [step, setStep] = useState<Step>("upload");
  const [csvText, setCsvText] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<ParsedRow[]>([]);
  const [columnMap, setColumnMap] = useState<ColumnMap>({
    category: "", brand: "", model: "", year: "", description: "", trim_level: "",
    engine: "", transmission: "", mileage: "", condition: "", body_style: "", color: "",
    vin: "", purchase_price: "", purchase_date: "", purchase_source: "", notes: "",
  });
  const [mappedRows, setMappedRows] = useState<MappedRow[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [parseError, setParseError] = useState("");
  const [importProgress, setImportProgress] = useState(0);
  const [importResults, setImportResults] = useState<{ imported: number; failed: number; errors: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processCSVText = useCallback((text: string) => {
    setParseError("");
    const { headers: h, rows } = parseCSV(text);
    if (!h.length) { setParseError("Could not parse CSV. Make sure the first row contains column headers."); return false; }
    if (!rows.length) { setParseError("CSV file has no data rows."); return false; }

    const autoMap = autoMapColumns(h);
    const newMap: ColumnMap = {
      category: autoMap.category ?? "", brand: autoMap.brand ?? "", model: autoMap.model ?? "",
      year: autoMap.year ?? "", description: autoMap.description ?? "", trim_level: autoMap.trim_level ?? "",
      engine: autoMap.engine ?? "", transmission: autoMap.transmission ?? "", mileage: autoMap.mileage ?? "",
      condition: autoMap.condition ?? "", body_style: autoMap.body_style ?? "", color: autoMap.color ?? "",
      vin: autoMap.vin ?? "", purchase_price: autoMap.purchase_price ?? "",
      purchase_date: autoMap.purchase_date ?? "", purchase_source: autoMap.purchase_source ?? "",
      notes: autoMap.notes ?? "",
    };
    if (!newMap.category) {
      rows.forEach(r => { r["__category__"] = defaultCategory; });
      if (!h.includes("__category__")) h.push("__category__");
      newMap.category = "__category__";
    }
    setHeaders(h); setRawRows(rows); setColumnMap(newMap); setCsvText(text);
    return true;
  }, [defaultCategory]);

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (processCSVText(text)) setStep("map");
    };
    reader.readAsText(file);
  };

  const proceedToPreview = () => {
    setMappedRows(buildMappedRows(rawRows, columnMap));
    setStep("preview");
  };

  const runImport = async () => {
    const validRows = mappedRows.filter(r => r._valid);
    if (!validRows.length) return;
    setStep("importing");
    setImportProgress(0);

    const BATCH = 20;
    let imported = 0, failed = 0;
    const errors: string[] = [];

    for (let i = 0; i < validRows.length; i += BATCH) {
      const batch = validRows.slice(i, i + BATCH).map(r => ({
        category: r.category, brand: r.brand, model: r.model,
        year: r.year || null, description: r.description || null, trim_level: r.trim_level || null,
        engine: r.engine || null, transmission: r.transmission || null,
        mileage: r.mileage ? parseFloat(r.mileage.replace(/,/g, "")) : null,
        condition: r.condition, body_style: r.body_style || null, color: r.color || null,
        vin: r.vin || null, purchase_price: r.purchase_price || null,
        purchase_date: r.purchase_date || null, purchase_source: r.purchase_source || null,
        notes: r.notes || null,
      }));

      try {
        const res = await fetch("/api/automobiles/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: batch }),
        });
        const data = await res.json();
        imported += data.imported ?? 0;
        failed += data.failed ?? 0;
        data.results?.filter((r: { success: boolean; error?: string }) => !r.success)
          .forEach((r: { error?: string }) => { if (r.error) errors.push(r.error); });
      } catch (err) {
        failed += batch.length;
        errors.push(String(err));
      }
      setImportProgress(Math.round(((i + BATCH) / validRows.length) * 100));
    }

    setImportResults({ imported, failed, errors });
    setStep("done");
    if (imported > 0) onImportComplete(imported);
  };

  const downloadTemplate = () => {
    const blob = new Blob([TEMPLATE_CSV], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "vault1_auto_import_template.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const validCount = mappedRows.filter(r => r._valid).length;
  const invalidCount = mappedRows.filter(r => !r._valid).length;

  return (
    <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.8)", backdropFilter: "blur(6px)" }}>
      <div className="modal-content bg-surface border border-border rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-border sticky top-0 bg-surface z-10">
          <div>
            <h2 className="text-xl font-bold text-text">Import Automobiles from CSV</h2>
            <p className="text-sm text-text-muted mt-0.5">
              {step === "upload" && "Upload or paste a CSV file"}
              {step === "map" && `${rawRows.length} rows found — map columns to fields`}
              {step === "preview" && `${validCount} valid · ${invalidCount} with errors`}
              {step === "importing" && "Importing your items…"}
              {step === "done" && "Import complete"}
            </p>
          </div>
          <button aria-label="Close" onClick={onClose}
            className="w-9 h-9 rounded-xl hover:bg-surface-3 text-text-muted hover:text-text transition-colors flex items-center justify-center">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6">

          {/* Step 1: Upload */}
          {step === "upload" && (
            <div className="space-y-5">
              <div
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${dragOver ? "border-accent bg-accent/5" : "border-border hover:border-border-2"}`}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
                onClick={() => fileInputRef.current?.click()}
              >
                <svg className="w-10 h-10 text-text-dim mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                <p className="text-text font-medium">{dragOver ? "Drop to upload" : "Drop your CSV file here"}</p>
                <p className="text-sm text-text-muted mt-1">or click to browse</p>
                <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-text-dim">or paste CSV text</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              <div>
                <textarea value={csvText} onChange={e => { setCsvText(e.target.value); setParseError(""); }}
                  placeholder="Paste CSV content here…" rows={5}
                  className="w-full bg-surface-2 border border-border text-text rounded-xl px-4 py-3 text-sm font-mono focus:border-accent focus:ring-1 focus:ring-accent outline-none resize-none" />
                {parseError && <p className="text-xs text-red-400 mt-1">{parseError}</p>}
                <button onClick={() => { if (!csvText.trim()) { setParseError("Please paste CSV content first."); return; } if (processCSVText(csvText)) setStep("map"); }}
                  className="mt-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-xl transition-colors">
                  Parse CSV
                </button>
              </div>

              <div className="bg-surface-2 rounded-xl p-4 border border-border flex items-start gap-3">
                <svg className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                </svg>
                <div className="flex-1">
                  <p className="text-sm text-text font-medium mb-1">CSV Format</p>
                  <p className="text-xs text-text-muted mb-2">
                    Required: <span className="text-text font-mono">brand</span>, <span className="text-text font-mono">model</span>, <span className="text-text font-mono">condition</span>.
                    Category defaults to <span className="text-text">{AUTO_CATEGORY_LABELS[defaultCategory]}</span> if not provided.
                    Valid conditions: {CONDITIONS.join(", ")}.
                  </p>
                  <button onClick={downloadTemplate} className="flex items-center gap-1.5 text-xs text-accent hover:underline font-medium">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    </svg>
                    Download template CSV
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Column Mapping */}
          {step === "map" && (
            <div className="space-y-5">
              <p className="text-sm text-text-muted">Match each field to a column from your CSV. Required fields are marked with *.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(Object.keys(FIELD_LABELS) as (keyof ColumnMap)[]).map(field => (
                  <div key={field}>
                    <label className="block text-xs font-medium text-text-muted mb-1">{FIELD_LABELS[field]}</label>
                    <select value={columnMap[field]}
                      onChange={e => setColumnMap(prev => ({ ...prev, [field]: e.target.value }))}
                      className="w-full bg-surface-2 border border-border text-text rounded-xl px-3 py-2 text-sm focus:border-accent focus:ring-1 focus:ring-accent outline-none appearance-none">
                      <option value="">— not mapped —</option>
                      {headers.filter(h => !h.startsWith("__")).map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                ))}
              </div>

              {/* Sample preview */}
              <div className="bg-surface-2 rounded-xl border border-border overflow-hidden">
                <div className="px-4 py-3 border-b border-border">
                  <p className="text-xs font-medium text-text-muted uppercase tracking-wider">Sample (first 3 rows)</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border">
                        {(Object.keys(FIELD_LABELS) as (keyof ColumnMap)[]).filter(f => columnMap[f]).map(f => (
                          <th key={f} className="px-3 py-2 text-left text-text-muted font-medium whitespace-nowrap">{FIELD_LABELS[f].replace(" *", "")}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rawRows.slice(0, 3).map((row, i) => (
                        <tr key={i} className="border-b border-border last:border-0">
                          {(Object.keys(FIELD_LABELS) as (keyof ColumnMap)[]).filter(f => columnMap[f]).map(f => (
                            <td key={f} className="px-3 py-2 text-text whitespace-nowrap max-w-[150px] truncate">
                              {row[columnMap[f]] || <span className="text-text-dim">—</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button onClick={() => setStep("upload")} className="px-5 py-2.5 rounded-xl text-sm text-text-muted hover:text-text hover:bg-surface-3 border border-border transition-colors">Back</button>
                <button onClick={proceedToPreview} disabled={REQUIRED_FIELDS.some(f => !columnMap[f])}
                  className="flex items-center gap-2 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium px-6 py-2.5 rounded-xl transition-colors text-sm">
                  Preview Import ({rawRows.length} rows)
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Preview */}
          {step === "preview" && (
            <div className="space-y-5">
              {invalidCount > 0 && (
                <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-4 flex items-start gap-3">
                  <svg className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                  <p className="text-sm text-yellow-300">
                    <span className="font-medium">{invalidCount} row{invalidCount !== 1 ? "s" : ""} will be skipped</span> due to validation errors.
                    {validCount > 0 && ` ${validCount} valid row${validCount !== 1 ? "s" : ""} will be imported.`}
                  </p>
                </div>
              )}

              <div className="border border-border rounded-xl overflow-hidden">
                <div className="overflow-x-auto max-h-80">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-surface-2 z-10">
                      <tr className="border-b border-border">
                        <th className="px-3 py-2.5 text-left text-text-muted font-medium w-8">#</th>
                        <th className="px-3 py-2.5 text-left text-text-muted font-medium">Status</th>
                        <th className="px-3 py-2.5 text-left text-text-muted font-medium">Brand</th>
                        <th className="px-3 py-2.5 text-left text-text-muted font-medium">Model</th>
                        <th className="px-3 py-2.5 text-left text-text-muted font-medium">Year</th>
                        <th className="px-3 py-2.5 text-left text-text-muted font-medium">Category</th>
                        <th className="px-3 py-2.5 text-left text-text-muted font-medium">Condition</th>
                        <th className="px-3 py-2.5 text-left text-text-muted font-medium">Mileage</th>
                        <th className="px-3 py-2.5 text-left text-text-muted font-medium">Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mappedRows.map((row, i) => (
                        <tr key={i} className={`border-b border-border last:border-0 ${!row._valid ? "bg-red-500/5" : ""}`}>
                          <td className="px-3 py-2 text-text-dim">{i + 1}</td>
                          <td className="px-3 py-2">
                            {row._valid ? (
                              <span className="inline-flex items-center gap-1 text-green-400">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                                OK
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-red-400" title={row._errors.join("; ")}>
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                Skip
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-text font-medium">{row.brand || <span className="text-red-400">—</span>}</td>
                          <td className="px-3 py-2 text-text">{row.model || <span className="text-red-400">—</span>}</td>
                          <td className="px-3 py-2 text-text-muted">{row.year || "—"}</td>
                          <td className="px-3 py-2 text-text-muted">{row.category || <span className="text-red-400">—</span>}</td>
                          <td className="px-3 py-2 text-text-muted">{row.condition || <span className="text-red-400">—</span>}</td>
                          <td className="px-3 py-2 text-text-muted">{row.mileage || "—"}</td>
                          <td className="px-3 py-2 text-text-muted">{row.purchase_price ? `$${row.purchase_price}` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {invalidCount > 0 && (
                <div className="space-y-1.5">
                  {mappedRows.filter(r => !r._valid).map((row, i) => (
                    <div key={i} className="text-xs text-text-muted bg-surface-2 rounded-lg px-3 py-2 border border-border">
                      <span className="text-red-400 font-medium">Row {row._rowIndex + 1}</span> ({row.brand || "no brand"} {row.model || "no model"}): {row._errors.join(", ")}
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-3 pt-2">
                <button onClick={() => setStep("map")} className="px-5 py-2.5 rounded-xl text-sm text-text-muted hover:text-text hover:bg-surface-3 border border-border transition-colors">Back</button>
                <button onClick={runImport} disabled={validCount === 0}
                  className="flex items-center gap-2 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium px-6 py-2.5 rounded-xl transition-colors text-sm">
                  Import {validCount} Item{validCount !== 1 ? "s" : ""}
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Importing */}
          {step === "importing" && (
            <div className="py-10 text-center space-y-5">
              <div className="w-12 h-12 rounded-full border-2 border-accent border-t-transparent animate-spin mx-auto" />
              <div>
                <p className="text-lg font-semibold text-text">Importing your collection…</p>
                <p className="text-sm text-text-muted mt-1">{importProgress}% complete</p>
              </div>
              <div className="w-full bg-surface-3 rounded-full h-2 max-w-xs mx-auto">
                <div className="bg-accent h-2 rounded-full transition-all duration-300" style={{ width: `${importProgress}%` }} />
              </div>
            </div>
          )}

          {/* Step 5: Done */}
          {step === "done" && importResults && (
            <div className="py-6 space-y-5">
              <div className="text-center">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 ${importResults.imported > 0 ? "bg-green-500/10 border border-green-500/20" : "bg-yellow-500/10 border border-yellow-500/20"}`}>
                  {importResults.imported > 0
                    ? <svg className="w-7 h-7 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                    : <svg className="w-7 h-7 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
                  }
                </div>
                <p className="text-xl font-bold text-text">{importResults.imported} item{importResults.imported !== 1 ? "s" : ""} imported</p>
                {importResults.failed > 0 && <p className="text-sm text-text-muted mt-1">{importResults.failed} failed</p>}
              </div>
              {importResults.errors.length > 0 && (
                <div className="bg-surface-2 rounded-xl border border-border p-4 space-y-1.5 max-h-40 overflow-y-auto">
                  <p className="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">Errors</p>
                  {importResults.errors.map((e, i) => <p key={i} className="text-xs text-red-400">{e}</p>)}
                </div>
              )}
              <button onClick={onClose} className="w-full bg-accent hover:bg-accent-hover text-white font-medium py-2.5 rounded-xl transition-colors text-sm">Done</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
