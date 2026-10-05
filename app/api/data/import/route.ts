import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { IMAGE_MIME_TYPES } from "@/lib/attach/rules";
import {
  forgetUpload,
  isUploadKey,
  newUploadKey,
  ownedUploads,
  recordUpload,
  uploadPathFor,
  writeUploadObject,
} from "@/lib/storage/uploads";

// ── Valid enum values ─────────────────────────────────────────────────────────

const GUITAR_CATEGORIES  = ["electric-guitars", "acoustic-guitars", "amplifiers", "pedals"];
const WATCH_CATEGORIES   = ["luxury-watches", "sport-watches", "dress-watches", "vintage-watches"];
const AUTO_CATEGORIES    = ["collection", "household"];
const IOD_CATEGORIES     = ["fine-art", "memorabilia", "collectibles", "jewelry", "other"];
const CONDITIONS         = ["Mint", "Excellent", "Very Good", "Good", "Fair", "Poor"];
const INSURANCE_SOURCES  = ["ai", "alternate_from_user", "user_override"];
const VALID_VERSIONS     = ["1.0", "1.1", "1.2", "1.3"] as const;

// CUR-9: coerce truthy/falsy values from various export shapes into a clean
// boolean. Old exports (v1.0) don't have `insure` at all → defaults to false.
function toBool(v: unknown): boolean {
  if (v === true) return true;
  if (typeof v === "string") return v.toLowerCase() === "true";
  return false;
}

// CUR-9: validate the insurance_value_source against the CHECK constraint;
// return null for invalid/missing so the DB stores a clean NULL.
function normalizeInsuranceSource(v: unknown): string | null {
  if (!v || typeof v !== "string") return null;
  return INSURANCE_SOURCES.includes(v) ? v : null;
}

// Normalize a category string to slug form: lowercase, spaces→hyphens
function normalizeSlug(v: unknown): string {
  if (!v || typeof v !== "string") return "";
  return v.trim().toLowerCase().replace(/\s+/g, "-");
}
// Normalize condition by matching the input case-insensitively against the
// canonical list. The old approach (Upper + lowercase rest) corrupted
// multi-word values: "Very Good" -> "Very good" -> rejected by both the
// validator and the DB CHECK constraint.
function normalizeCondition(v: unknown): string | null {
  if (!v || typeof v !== "string") return null;
  const trimmed = v.trim().toLowerCase();
  return CONDITIONS.find((c) => c.toLowerCase() === trimmed) ?? null;
}

// NUMERIC columns come back from pg as strings (JS Number can't represent
// arbitrary precision decimals). The validator + inserter both have to
// accept "4200.00" as well as 4200. Returns null for null/empty/unparseable
// so the column gets a real NULL on insert.
function toNumber(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function isNumericInput(v: unknown): boolean {
  return v == null || v === "" || toNumber(v) !== null;
}

// Specs (migration 019, v1.3): JSONB array of { label, value, source } rows.
// AI-researched specs are expensive (web_search) to regenerate, so they must
// round-trip like valuations and image-moderation metadata. Returns a JSON
// string ready to bind to the jsonb column (cast ::jsonb), or null when there
// are no usable rows. Mirrors the server-side cleaning in lib/specs-handler.ts
// mergeSpecs: trim label/value, require both, coerce source to ai|manual.
function normalizeSpecs(v: unknown): string | null {
  if (!Array.isArray(v)) return null;
  const clean = v
    .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
    .map((e) => ({
      label: typeof e.label === "string" ? e.label.trim() : "",
      value: typeof e.value === "string" ? e.value.trim() : "",
      source: e.source === "ai" ? "ai" : "manual",
    }))
    .filter((e) => e.label && e.value);
  return clean.length > 0 ? JSON.stringify(clean) : null;
}

// ── Per-collection validators ─────────────────────────────────────────────────

interface ValidationError { row: number; field: string; message: string; }

function validateGuitar(row: Record<string, unknown>, idx: number): ValidationError[] {
  const errs: ValidationError[] = [];
  if (!row.brand || typeof row.brand !== "string") errs.push({ row: idx, field: "brand", message: "Required string" });
  if (!row.model || typeof row.model !== "string") errs.push({ row: idx, field: "model", message: "Required string" });
  if (!row.category || !GUITAR_CATEGORIES.includes(normalizeSlug(row.category)))
    errs.push({ row: idx, field: "category", message: `Must be one of: ${GUITAR_CATEGORIES.join(", ")}` });
  if (row.condition != null && !CONDITIONS.includes(normalizeCondition(row.condition) ?? ""))
    errs.push({ row: idx, field: "condition", message: `Must be one of: ${CONDITIONS.join(", ")}` });
  if (row.year != null && (typeof row.year !== "number" || !Number.isInteger(row.year)))
    errs.push({ row: idx, field: "year", message: "Must be an integer" });
  if (!isNumericInput(row.purchase_price))
    errs.push({ row: idx, field: "purchase_price", message: "Must be a number" });
  return errs;
}

function validateWatch(row: Record<string, unknown>, idx: number): ValidationError[] {
  const errs: ValidationError[] = [];
  if (!row.brand || typeof row.brand !== "string") errs.push({ row: idx, field: "brand", message: "Required string" });
  if (!row.model || typeof row.model !== "string") errs.push({ row: idx, field: "model", message: "Required string" });
  if (!row.category || !WATCH_CATEGORIES.includes(normalizeSlug(row.category)))
    errs.push({ row: idx, field: "category", message: `Must be one of: ${WATCH_CATEGORIES.join(", ")}` });
  if (row.condition != null && !CONDITIONS.includes(normalizeCondition(row.condition) ?? ""))
    errs.push({ row: idx, field: "condition", message: `Must be one of: ${CONDITIONS.join(", ")}` });
  if (row.year != null && (typeof row.year !== "number" || !Number.isInteger(row.year)))
    errs.push({ row: idx, field: "year", message: "Must be an integer" });
  if (!isNumericInput(row.purchase_price))
    errs.push({ row: idx, field: "purchase_price", message: "Must be a number" });
  return errs;
}

function validateAuto(row: Record<string, unknown>, idx: number): ValidationError[] {
  const errs: ValidationError[] = [];
  if (!row.brand || typeof row.brand !== "string") errs.push({ row: idx, field: "brand", message: "Required string" });
  if (!row.model || typeof row.model !== "string") errs.push({ row: idx, field: "model", message: "Required string" });
  if (!row.category || !AUTO_CATEGORIES.includes(normalizeSlug(row.category)))
    errs.push({ row: idx, field: "category", message: `Must be one of: ${AUTO_CATEGORIES.join(", ")}` });
  if (row.condition != null && !CONDITIONS.includes(normalizeCondition(row.condition) ?? ""))
    errs.push({ row: idx, field: "condition", message: `Must be one of: ${CONDITIONS.join(", ")}` });
  if (row.year != null && (typeof row.year !== "number" || !Number.isInteger(row.year)))
    errs.push({ row: idx, field: "year", message: "Must be an integer" });
  if (row.mileage != null && (typeof row.mileage !== "number" || !Number.isInteger(row.mileage)))
    errs.push({ row: idx, field: "mileage", message: "Must be an integer" });
  if (!isNumericInput(row.purchase_price))
    errs.push({ row: idx, field: "purchase_price", message: "Must be a number" });
  return errs;
}

function validateIoD(row: Record<string, unknown>, idx: number): ValidationError[] {
  const errs: ValidationError[] = [];
  if (!row.short_description || typeof row.short_description !== "string")
    errs.push({ row: idx, field: "short_description", message: "Required string" });
  if (!row.category || !IOD_CATEGORIES.includes(normalizeSlug(row.category)))
    errs.push({ row: idx, field: "category", message: `Must be one of: ${IOD_CATEGORIES.join(", ")}` });
  if (row.condition != null && !CONDITIONS.includes(normalizeCondition(row.condition) ?? ""))
    errs.push({ row: idx, field: "condition", message: `Must be one of: ${CONDITIONS.join(", ")}` });
  if (row.year != null && (typeof row.year !== "number" || !Number.isInteger(row.year)))
    errs.push({ row: idx, field: "year", message: "Must be an integer" });
  if (!isNumericInput(row.purchase_price))
    errs.push({ row: idx, field: "purchase_price", message: "Must be a number" });
  return errs;
}

// ── Per-collection inserters ──────────────────────────────────────────────────
//
// Each returns the resolved item id (preserved from the export, or freshly
// generated) when a row was actually inserted. Returns null on ON CONFLICT
// (i.e. the item already existed) so the caller knows whether to also import
// the embedded valuations. Preserving created_at keeps timeline order
// intact after a local → hosted move.

async function insertGuitar(r: Record<string, unknown>, userId: string): Promise<string | null> {
  const result = await query<{ id: string }>(
    `INSERT INTO guitar_items
      (id, user_id, category, brand, model, year, serial_number, condition,
       purchase_price, purchase_source, color_finish, short_description,
       link, notes, created_at,
       insure, insurance_value, insurance_value_source, insurance_value_date, archived_at,
       specs, specs_updated_at)
     VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, COALESCE($15::timestamptz, NOW()),
       $16, $17, $18, $19, $20, $21::jsonb, $22::timestamptz)
     ON CONFLICT (id) DO NOTHING
     RETURNING id`,
    [r.id || null, userId, normalizeSlug(r.category), r.brand, r.model, r.year || null, r.serial_number || null,
     normalizeCondition(r.condition) || "Good", toNumber(r.purchase_price), r.purchase_source || null,
     r.color_finish || null, r.short_description || null, r.link || null, r.notes || null, r.created_at || null,
     toBool(r.insure), toNumber(r.insurance_value), normalizeInsuranceSource(r.insurance_value_source),
     r.insurance_value_date || null, r.archived_at || null,
     normalizeSpecs(r.specs), r.specs_updated_at || null],
  );
  return result[0]?.id ?? null;
}

async function insertWatch(r: Record<string, unknown>, userId: string): Promise<string | null> {
  const result = await query<{ id: string }>(
    `INSERT INTO watch_items
      (id, user_id, category, brand, model, year, reference_number, case_diameter,
       serial_number, condition, purchase_price, purchase_source, dial_color,
       country_of_manufacture, movement, bracelet_material, case_material,
       short_description, link, notes, created_at,
       insure, insurance_value, insurance_value_source, insurance_value_date, archived_at,
       specs, specs_updated_at)
     VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, COALESCE($21::timestamptz, NOW()),
       $22, $23, $24, $25, $26, $27::jsonb, $28::timestamptz)
     ON CONFLICT (id) DO NOTHING
     RETURNING id`,
    [r.id || null, userId, normalizeSlug(r.category), r.brand, r.model, r.year || null, r.reference_number || null,
     r.case_diameter || null, r.serial_number || null, normalizeCondition(r.condition) || "Good", toNumber(r.purchase_price),
     r.purchase_source || null, r.dial_color || null,
     r.country_of_manufacture || null, r.movement || null, r.bracelet_material || null,
     r.case_material || null, r.short_description || null, r.link || null, r.notes || null, r.created_at || null,
     toBool(r.insure), toNumber(r.insurance_value), normalizeInsuranceSource(r.insurance_value_source),
     r.insurance_value_date || null, r.archived_at || null,
     normalizeSpecs(r.specs), r.specs_updated_at || null],
  );
  return result[0]?.id ?? null;
}

async function insertAuto(r: Record<string, unknown>, userId: string): Promise<string | null> {
  const result = await query<{ id: string }>(
    `INSERT INTO automobiles
      (id, user_id, category, brand, model, year, description, trim_level, engine,
       transmission, mileage, condition, body_style, color, vin, purchase_price,
       purchase_date, purchase_source, notes, created_at,
       insure, insurance_value, insurance_value_source, insurance_value_date, archived_at,
       specs, specs_updated_at)
     VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, COALESCE($20::timestamptz, NOW()),
       $21, $22, $23, $24, $25, $26::jsonb, $27::timestamptz)
     ON CONFLICT (id) DO NOTHING
     RETURNING id`,
    [r.id || null, userId, normalizeSlug(r.category), r.brand, r.model, r.year || null, r.description || null,
     r.trim_level || null, r.engine || null, r.transmission || null, r.mileage || null,
     normalizeCondition(r.condition) || null, r.body_style || null, r.color || null, r.vin || null,
     toNumber(r.purchase_price), r.purchase_date || null, r.purchase_source || null, r.notes || null, r.created_at || null,
     toBool(r.insure), toNumber(r.insurance_value), normalizeInsuranceSource(r.insurance_value_source),
     r.insurance_value_date || null, r.archived_at || null,
     normalizeSpecs(r.specs), r.specs_updated_at || null],
  );
  return result[0]?.id ?? null;
}

async function insertIoD(r: Record<string, unknown>, userId: string): Promise<string | null> {
  const result = await query<{ id: string }>(
    `INSERT INTO items_of_distinction
      (id, user_id, category, item_type, brand, short_description, long_description,
       year, condition, purchase_price, purchase_date, purchase_source, provenance,
       notes, created_at,
       insure, insurance_value, insurance_value_source, insurance_value_date, archived_at,
       specs, specs_updated_at)
     VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, COALESCE($15::timestamptz, NOW()),
       $16, $17, $18, $19, $20, $21::jsonb, $22::timestamptz)
     ON CONFLICT (id) DO NOTHING
     RETURNING id`,
    [r.id || null, userId, normalizeSlug(r.category), r.item_type || null, r.brand || null, r.short_description,
     r.long_description || null, r.year || null, normalizeCondition(r.condition) || null, toNumber(r.purchase_price),
     r.purchase_date || null, r.purchase_source || null, r.provenance || null, r.notes || null, r.created_at || null,
     toBool(r.insure), toNumber(r.insurance_value), normalizeInsuranceSource(r.insurance_value_source),
     r.insurance_value_date || null, r.archived_at || null,
     normalizeSpecs(r.specs), r.specs_updated_at || null],
  );
  return result[0]?.id ?? null;
}

// ── Insurance valuation norms UPSERT (CUR-9) ─────────────────────────────────
//
// Config-level data — not user-scoped. Roundtrip rehydrates a fresh DB
// without re-running the AI research. UPSERT on (module, category) so an
// import overwrites stale local norms with the fresher exported values.

const VALID_MODULES_FOR_NORMS = ["guitars", "watches", "automobiles", "iod"];

async function upsertImportedNorms(rows: unknown): Promise<{ inserted: number; errors: ValidationError[] }> {
  if (!Array.isArray(rows)) return { inserted: 0, errors: [] };
  let inserted = 0;
  const errors: ValidationError[] = [];
  for (let i = 0; i < rows.length; i++) {
    const v = rows[i];
    if (!v || typeof v !== "object") continue;
    const r = v as Record<string, unknown>;
    const moduleSlug = typeof r.module === "string" ? r.module : null;
    const category = typeof r.category === "string" ? r.category : null;
    const multiplier = toNumber(r.multiplier);
    if (!moduleSlug || !category || multiplier == null || multiplier <= 0) {
      errors.push({ row: i + 1, field: "insurance_valuation_norms", message: "missing/invalid module/category/multiplier" });
      continue;
    }
    if (!VALID_MODULES_FOR_NORMS.includes(moduleSlug)) {
      errors.push({ row: i + 1, field: "module", message: `Must be one of: ${VALID_MODULES_FOR_NORMS.join(", ")}` });
      continue;
    }
    try {
      await query(
        `INSERT INTO insurance_valuation_norms (module, category, multiplier, notes, updated_at)
         VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, NOW()))
         ON CONFLICT (module, category) DO UPDATE SET
           multiplier = EXCLUDED.multiplier,
           notes = EXCLUDED.notes,
           updated_at = NOW()`,
        [moduleSlug, category, multiplier, r.notes || null, r.updated_at || null],
      );
      inserted++;
    } catch (e) {
      errors.push({ row: i + 1, field: "insurance_valuation_norms", message: String(e) });
    }
  }
  return { inserted, errors };
}

// ── Valuations import ─────────────────────────────────────────────────────────
//
// Embedded under each item as `valuations: [...]` by the exporter. Same
// schema across all four modules; only the table + FK column name differs.
//
// Idempotent: ON CONFLICT (id) DO NOTHING — running the same import twice
// inserts each valuation at most once, so a partial first run can be
// resumed cleanly by re-importing the same file.
//
// Ownership-enforced: INSERT...SELECT...WHERE EXISTS verifies the parent
// item belongs to the current user. Without this, a JSON with a forged
// `id` referencing another user's item could attach valuations to it.

async function insertValuations(
  itemsTable: string,
  fkColumn: string,
  valuationsTable: string,
  itemId: string,
  userId: string,
  rows: unknown,
): Promise<{ inserted: number; errors: ValidationError[] }> {
  if (!Array.isArray(rows)) return { inserted: 0, errors: [] };
  let inserted = 0;
  const errors: ValidationError[] = [];
  for (let i = 0; i < rows.length; i++) {
    const v = rows[i];
    if (!v || typeof v !== "object") continue;
    const r = v as Record<string, unknown>;
    const price = toNumber(r.price);
    if (!r.valuation_type || price == null) continue;
    if (r.valuation_type !== "ai" && r.valuation_type !== "user") continue;
    try {
      const result = await query<{ id: string }>(
        `INSERT INTO ${valuationsTable} (id, ${fkColumn}, valuation_type, price, notes, comparable_sales, created_at)
         SELECT COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6::jsonb, COALESCE($7::timestamptz, NOW())
         WHERE EXISTS (SELECT 1 FROM ${itemsTable} WHERE id = $2 AND user_id = $8)
         ON CONFLICT (id) DO NOTHING
         RETURNING id`,
        [
          r.id || null,
          itemId,
          r.valuation_type,
          price,
          r.notes || null,
          r.comparable_sales ? JSON.stringify(r.comparable_sales) : null,
          r.created_at || null,
          userId,
        ],
      );
      if (result.length > 0) inserted++;
      // result.length === 0 covers two ownership-safe cases: a duplicate
      // (ON CONFLICT) or the parent item doesn't belong to this user. We
      // don't surface either as an error.
    } catch (e) {
      errors.push({ row: i + 1, field: "valuation", message: String(e) });
    }
  }
  return { inserted, errors };
}

// ── Images import (v1.2) ─────────────────────────────────────────────────────
//
// Embedded under each item as `images: [...]` by the exporter (v1.2+). Same
// schema across all four modules; only the table + FK column name differs.
//
// The file is the client's, so nothing in it names a storage key or a
// moderation verdict the server will act on (VLT-67):
//   - A row carrying `data_base64` gets a FRESH key minted here, recorded in
//     the `uploads` ledger against the importing user. The exported filename
//     is ignored: reusing it let an import overwrite another user's object, or
//     write outside the uploads folder on local disk.
//   - A row without bytes may only point at a key the ledger already records
//     against the importing user (re-importing your own backup into the same
//     environment). Anything else is skipped with an error asking for an
//     export that includes image data.
//   - `moderation_status` / `nsfw_*` from the file are ignored. A re-stored
//     image lands 'unreviewed'; a key you already own keeps the verdict the
//     server recorded when it was uploaded.
//
// Idempotent + ownership-enforced like insertValuations: INSERT ... SELECT ...
// WHERE EXISTS verifies the parent item belongs to the current user;
// ON CONFLICT (id) DO NOTHING means a re-run is a no-op for already-imported
// rows. Bytes are written only after the row is in, so a re-run writes nothing
// new, and a failed write removes the row again rather than leaving one that
// points at nothing.

const IMPORT_EXT_MIME: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };

// The stored object's type: the row's MIME type if it is one /api/upload
// accepts, else inferred from the exported filename's extension.
function importMimeType(r: Record<string, unknown>): string | null {
  if (typeof r.mime_type === "string" && IMAGE_MIME_TYPES.includes(r.mime_type.toLowerCase())) {
    return r.mime_type.toLowerCase();
  }
  const ext = typeof r.filename === "string" ? r.filename.split(".").pop()?.toLowerCase() : undefined;
  return (ext && IMPORT_EXT_MIME[ext]) || null;
}

async function insertImages(
  itemsTable: string,
  imagesTable: string,
  fkColumn: string,
  itemId: string,
  userId: string,
  rows: unknown,
): Promise<{ inserted: number; bytes_written: number; errors: ValidationError[] }> {
  if (!Array.isArray(rows)) return { inserted: 0, bytes_written: 0, errors: [] };
  let inserted = 0;
  let bytesWritten = 0;
  const errors: ValidationError[] = [];

  const owned = await ownedUploads(
    userId,
    rows.map((v) => (v && typeof v === "object" ? (v as Record<string, unknown>).filename : null)).filter(isUploadKey),
  );

  const insertRow = (r: Record<string, unknown>, key: string, meta: {
    mime_type: string | null;
    size: number | null;
    moderation_status: string | null;
    nsfw_score: number | null;
    nsfw_categories: unknown;
  }) =>
    query<{ id: string }>(
      `INSERT INTO ${imagesTable}
         (id, ${fkColumn}, filename, original_name, path, mime_type, size,
          is_primary, sort_order, created_at,
          moderation_status, nsfw_score, nsfw_categories)
       SELECT COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, $7,
              $8, $9, COALESCE($10::timestamptz, NOW()),
              COALESCE($11, 'unreviewed'), $12, $13::jsonb
       WHERE EXISTS (SELECT 1 FROM ${itemsTable} WHERE id = $2 AND user_id = $14)
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [
        r.id || null,
        itemId,
        key,
        r.original_name || null,
        uploadPathFor(key),
        meta.mime_type,
        meta.size,
        toBool(r.is_primary),
        typeof r.sort_order === "number" ? r.sort_order : 0,
        r.created_at || null,
        meta.moderation_status,
        meta.nsfw_score,
        meta.nsfw_categories == null ? null : JSON.stringify(meta.nsfw_categories),
        userId,
      ],
    );

  for (let i = 0; i < rows.length; i++) {
    const v = rows[i];
    if (!v || typeof v !== "object") continue;
    const r = v as Record<string, unknown>;

    if (typeof r.data_base64 === "string" && r.data_base64.length > 0) {
      // Bytes present: store them under a key minted here.
      const mime = importMimeType(r);
      if (!mime) {
        errors.push({ row: i + 1, field: "image", message: "not a JPG, PNG, WebP or GIF image" });
        continue;
      }
      const buf = Buffer.from(r.data_base64, "base64");
      const key = newUploadKey(mime);
      try {
        await recordUpload({
          key,
          userId,
          origin: "import",
          originalName: typeof r.original_name === "string" ? r.original_name : null,
          mimeType: mime,
          size: buf.length,
          moderation: null,
        });
        const result = await insertRow(r, key, {
          mime_type: mime,
          size: buf.length,
          moderation_status: null,
          nsfw_score: null,
          nsfw_categories: null,
        });
        if (result.length === 0) {
          // Duplicate (ON CONFLICT) or parent-not-owned: nothing to store.
          await forgetUpload(key);
          continue;
        }
        try {
          await writeUploadObject(key, buf, mime);
        } catch (err) {
          console.error(`[import] failed to write bytes for ${key}:`, err);
          await query(`DELETE FROM ${imagesTable} WHERE id = $1`, [result[0].id]);
          await forgetUpload(key);
          errors.push({ row: i + 1, field: "image_bytes", message: "failed to write bytes" });
          continue;
        }
        inserted++;
        bytesWritten++;
      } catch (e) {
        await forgetUpload(key).catch(() => undefined);
        errors.push({ row: i + 1, field: "image", message: String(e) });
      }
      continue;
    }

    // No bytes: only a key this user already owns.
    const upload = owned.get(r.filename as string);
    if (!upload) {
      errors.push({
        row: i + 1,
        field: "image",
        message: "has no image data and is not an image this account uploaded; export again with image data included",
      });
      continue;
    }
    try {
      const result = await insertRow(r, upload.key, upload);
      if (result.length > 0) inserted++;
      // result.length === 0: duplicate (ON CONFLICT) or parent-not-owned —
      // both ownership-safe, not surfaced as errors.
    } catch (e) {
      errors.push({ row: i + 1, field: "image", message: String(e) });
    }
  }
  return { inserted, bytes_written: bytesWritten, errors };
}

// ── Route ─────────────────────────────────────────────────────────────────────

interface CollectionRun {
  key: string;
  validator: (r: Record<string, unknown>, i: number) => ValidationError[];
  inserter: (r: Record<string, unknown>, uid: string) => Promise<string | null>;
  itemsTable: string;
  valuationsTable: string;
  valuationsFk: string;
  imagesTable: string;
  imagesFk: string;
}

const RUNS: CollectionRun[] = [
  { key: "guitars",      validator: validateGuitar, inserter: insertGuitar, itemsTable: "guitar_items",          valuationsTable: "guitar_valuations", valuationsFk: "guitar_item_id", imagesTable: "guitar_images", imagesFk: "guitar_item_id" },
  { key: "watches",      validator: validateWatch,  inserter: insertWatch,  itemsTable: "watch_items",           valuationsTable: "watch_valuations",  valuationsFk: "watch_item_id",  imagesTable: "watch_images",  imagesFk: "watch_item_id"  },
  { key: "automobiles",  validator: validateAuto,   inserter: insertAuto,   itemsTable: "automobiles",           valuationsTable: "auto_valuations",   valuationsFk: "auto_id",        imagesTable: "auto_images",   imagesFk: "auto_id"        },
  { key: "collectibles", validator: validateIoD,    inserter: insertIoD,    itemsTable: "items_of_distinction",  valuationsTable: "iod_valuations",    valuationsFk: "iod_id",         imagesTable: "iod_images",    imagesFk: "iod_id"         },
];

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  console.log("[import POST] session userId:", session?.user?.id ?? "NONE");
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  try {
    const body = await req.json();
    console.log("[import POST] collections keys:", Object.keys(body?.collections ?? {}));

    if (!body || !VALID_VERSIONS.includes(body.version) || !body.collections || typeof body.collections !== "object") {
      return NextResponse.json(
        { error: `Invalid file format. Expected a Vault 1 export (or legacy Curatada export) with version ${VALID_VERSIONS.map((v) => `'${v}'`).join(" or ")}.` },
        { status: 400 },
      );
    }

    const cols = body.collections as Record<string, unknown[]>;
    const results: Record<string, {
      imported: number;
      skipped_existing: number;
      skipped_invalid: number;
      valuations_imported: number;
      images_imported: number;
      image_bytes_written: number;
      errors: ValidationError[];
    }> = {};
    let normsResult: { inserted: number; errors: ValidationError[] } | null = null;

    for (const r of RUNS) {
      if (!cols[r.key]) continue;
      if (!Array.isArray(cols[r.key])) {
        results[r.key] = { imported: 0, skipped_existing: 0, skipped_invalid: 0, valuations_imported: 0, images_imported: 0, image_bytes_written: 0, errors: [{ row: 0, field: r.key, message: "Must be an array" }] };
        continue;
      }
      let imported = 0, skippedExisting = 0, skippedInvalid = 0, valuationsImported = 0, imagesImported = 0, imageBytesWritten = 0;
      const errors: ValidationError[] = [];
      for (let i = 0; i < cols[r.key].length; i++) {
        const row = cols[r.key][i] as Record<string, unknown>;
        const rowErrs = r.validator(row, i + 1);
        if (rowErrs.length > 0) {
          errors.push(...rowErrs);
          skippedInvalid++;
          continue;
        }
        try {
          const newId = await r.inserter(row, userId);
          let itemId: string | null = newId;
          if (newId) {
            imported++;
          } else if (typeof row.id === "string") {
            // ON CONFLICT — the item already existed (possibly from a prior
            // partial run). Use the carried-over id so we can still attempt
            // to insert any valuations that didn't make it last time.
            // Ownership is enforced inside insertValuations.
            itemId = row.id;
            skippedExisting++;
          } else {
            skippedExisting++;
          }
          if (itemId) {
            const vRes = await insertValuations(
              r.itemsTable,
              r.valuationsFk,
              r.valuationsTable,
              itemId,
              userId,
              row.valuations,
            );
            valuationsImported += vRes.inserted;
            for (const e of vRes.errors) {
              errors.push({ row: i + 1, field: `valuation[${e.row}].${e.field}`, message: e.message });
            }

            // Images: v1.2+ payloads carry an `images` array. Older payloads
            // simply have no array and insertImages is a no-op.
            const iRes = await insertImages(
              r.itemsTable,
              r.imagesTable,
              r.imagesFk,
              itemId,
              userId,
              row.images,
            );
            imagesImported += iRes.inserted;
            imageBytesWritten += iRes.bytes_written;
            for (const e of iRes.errors) {
              errors.push({ row: i + 1, field: `image[${e.row}].${e.field}`, message: e.message });
            }
          }
        } catch (e) {
          errors.push({ row: i + 1, field: "db", message: String(e) });
          skippedInvalid++;
        }
      }
      results[r.key] = { imported, skipped_existing: skippedExisting, skipped_invalid: skippedInvalid, valuations_imported: valuationsImported, images_imported: imagesImported, image_bytes_written: imageBytesWritten, errors };
    }

    // CUR-9: import insurance_valuation_norms when the payload carries them
    // (v1.1+). Config-level data — UPSERT on (module, category).
    if (Array.isArray(body.insurance_valuation_norms)) {
      normsResult = await upsertImportedNorms(body.insurance_valuation_norms);
    }

    return NextResponse.json({
      results,
      ...(normsResult ? { insurance_valuation_norms: normsResult } : {}),
    });
  } catch (err) {
    console.error("[import]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// Validate-only endpoint (dry run).
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();

    if (!body || !VALID_VERSIONS.includes(body.version) || !body.collections || typeof body.collections !== "object") {
      return NextResponse.json(
        { error: `Invalid file format. Expected a Vault 1 export (or legacy Curatada export) with version ${VALID_VERSIONS.map((v) => `'${v}'`).join(" or ")}.` },
        { status: 400 },
      );
    }

    const cols = body.collections as Record<string, unknown[]>;
    const results: Record<string, { count: number; errors: ValidationError[] }> = {};

    for (const r of RUNS) {
      if (!cols[r.key]) continue;
      if (!Array.isArray(cols[r.key])) {
        results[r.key] = { count: 0, errors: [{ row: 0, field: r.key, message: "Must be an array" }] };
        continue;
      }
      const errors: ValidationError[] = [];
      for (let i = 0; i < cols[r.key].length; i++) {
        const rowErrs = r.validator(cols[r.key][i] as Record<string, unknown>, i + 1);
        errors.push(...rowErrs);
      }
      results[r.key] = { count: cols[r.key].length, errors };
    }

    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
