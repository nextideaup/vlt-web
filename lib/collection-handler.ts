// Generic CRUD handler factory for the four collection modules. Each module's
// route.ts and [id]/route.ts call makeListHandlers / makeItemHandlers with
// their CollectionConfig — the per-module differences live entirely in those
// configs.

import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { query, queryOne } from "@/lib/db";
import { isUploadKey, ownedUploads, releaseUploads, uploadPathFor, type UploadRecord } from "@/lib/storage/uploads";
import type { CollectionConfig, FieldSpec } from "@/lib/collections/types";

const VALID_CONDITIONS = ["Mint", "Excellent", "Very Good", "Good", "Fair", "Poor"] as const;

// One `image_paths` entry as the web modals and iOS send it: the object
// /api/upload returned, spread back. Only `filename` (the key) and
// `original_name` (a display label) are read from it. The path, MIME type,
// size and moderation verdict the client echoes are ignored: the row takes
// them from the server's `uploads` ledger (VLT-67).
interface ImagePath {
  filename: string;
  original_name?: string | null;
  mime_type?: string | null;
  size?: number | null;
}

// An `image_paths` entry after its key has been checked against the ledger.
interface ResolvedImage {
  key: string;
  original_name: string | null;
  upload: UploadRecord;
}

// ── SQL fragment builders ─────────────────────────────────────────────────────

function imagesJsonAgg(c: CollectionConfig): string {
  return `COALESCE(
    json_agg(
      json_build_object(
        'id', img.id,
        '${c.imageFkColumn}', img.${c.imageFkColumn},
        'filename', img.filename,
        'original_name', img.original_name,
        'path', img.path,
        'mime_type', img.mime_type,
        'size', img.size,
        'is_primary', img.is_primary,
        'sort_order', img.sort_order,
        'created_at', img.created_at
      ) ORDER BY img.sort_order ASC, img.is_primary DESC, img.created_at ASC
    ) FILTER (WHERE img.id IS NOT NULL),
    '[]'::json
  ) AS images`;
}

// withValuations=true emits LATERAL joins to the valuations table for the
// list-GET response. POST/PATCH responses use withValuations=false (returning
// NULL placeholders) — this matches existing behaviour: a freshly-created or
// updated item has no inline valuation data attached.
function listSelectSql(c: CollectionConfig, withValuations: boolean): string {
  const valSelect = withValuations
    ? `,
    MAX(ai_val.price) AS latest_ai_price,
    MAX(ai_val.created_at) AS latest_ai_price_date,
    MAX(user_val.price) AS latest_user_price,
    MAX(user_val.created_at) AS latest_user_price_date`
    : `,
    NULL::numeric AS latest_ai_price,
    NULL::timestamptz AS latest_ai_price_date,
    NULL::numeric AS latest_user_price,
    NULL::timestamptz AS latest_user_price_date`;

  const valJoins = withValuations
    ? `
    LEFT JOIN LATERAL (
      SELECT price, created_at FROM ${c.valuationsTable}
      WHERE ${c.valuationFkColumn} = ${c.alias}.id AND valuation_type = 'ai'
      ORDER BY created_at DESC LIMIT 1
    ) ai_val ON true
    LEFT JOIN LATERAL (
      SELECT price, created_at FROM ${c.valuationsTable}
      WHERE ${c.valuationFkColumn} = ${c.alias}.id AND valuation_type = 'user'
      ORDER BY created_at DESC LIMIT 1
    ) user_val ON true`
    : "";

  return `SELECT ${c.alias}.*,
    ${imagesJsonAgg(c)}${valSelect}
   FROM ${c.table} ${c.alias}
   LEFT JOIN ${c.imagesTable} img ON img.${c.imageFkColumn} = ${c.alias}.id${valJoins}`;
}

// ── Body normalisation + validation ───────────────────────────────────────────

function normalizeField(value: unknown, spec: FieldSpec): unknown {
  if (value == null) return null;
  // Boolean fields bypass the legacy `value || null` coercion: a `false` value
  // must survive the round-trip to the DB. The NOT NULL `insure` column on
  // each item table (migration 016) would otherwise blow up on INSERT when a
  // user leaves the "Include in insurance schedule" checkbox unticked.
  // validateBody has already refused anything that is not a JSON boolean.
  if (spec.type === "boolean") {
    return value === true;
  }
  // JSONB columns (the freeform `specs` array). node-postgres binds a JS array
  // as a Postgres array literal, which a jsonb column rejects — so serialize it
  // ourselves. An empty array collapses to SQL NULL to keep "no specs" tidy.
  // validateBody has already refused anything that is not an array (VLT-65).
  if (spec.type === "jsonb") {
    if (Array.isArray(value) && value.length === 0) return null;
    if (typeof value === "object") return JSON.stringify(value);
    return null;
  }
  if (spec.trim && typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }
  // Mirrors the legacy `value || null` behaviour: empty strings, 0, and false
  // become null. Acceptable for these schemas (no boolean/zero numeric fields).
  return (value as unknown) || null;
}

// Read the request body as a JSON object. A body that is not JSON, or is JSON
// but not an object (null, an array, a string), is the client's mistake: 400,
// never the parser's message (VLT-65). Same wording as the bulk-action handler.
async function readJsonObject(
  request: NextRequest
): Promise<{ body: Record<string, unknown> } | { error: string }> {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return { error: "Invalid JSON body" };
  }
  if (!isPlainObject(parsed)) return { error: "Request body must be a JSON object" };
  return { body: parsed };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// ── Typed field checks (VLT-65) ──
// Each returns an error message naming the field, or null when Postgres will
// accept the value. null / undefined / "" are not checked here: they clear the
// column, exactly as before (normalizeField maps them to SQL NULL).

const INT4_MIN = -2147483648;
const INT4_MAX = 2147483647;
const INTEGER_RE = /^[+-]?\d+$/;
const DECIMAL_RE = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
// YYYY-MM-DD, optionally followed by an ISO time. GET returns a DATE column as
// a full timestamp (node-postgres → JS Date → "2024-01-15T05:00:00.000Z"), and
// the iOS edit form sends that value straight back, so the time part is allowed.
const DATE_RE =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,9})?)?(?:Z|[+-](?:[01]\d|2[0-3])(?::?[0-5]\d)?)?)?$/;

function checkInteger(name: string, v: unknown): string | null {
  let n: number;
  if (typeof v === "number") n = v;
  else if (typeof v === "string" && INTEGER_RE.test(v.trim())) n = Number(v.trim());
  else return `${name} must be a whole number`;
  if (!Number.isInteger(n) || n < INT4_MIN || n > INT4_MAX) return `${name} must be a whole number`;
  return null;
}

function checkNumber(name: string, v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v)) return null;
  if (typeof v === "string" && DECIMAL_RE.test(v.trim()) && Number.isFinite(Number(v.trim()))) return null;
  return `${name} must be a number`;
}

function checkDate(name: string, v: unknown): string | null {
  const m = typeof v === "string" ? DATE_RE.exec(v.trim()) : null;
  if (!m) return `${name} must be a date (YYYY-MM-DD)`;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
  // Postgres has no year 0, and refuses Feb 30 and month 13.
  if (y < 1 || days === undefined || d < 1 || d > days) return `${name} must be a real calendar date`;
  return null;
}

// The `specs` column: an array of { label, value } entries (lib/types.ts
// SpecEntry). Anything else used to be silently dropped on POST and, worse,
// silently CLEARED the stored specs on PATCH (VLT-65).
function checkSpecs(name: string, v: unknown): string | null {
  if (!Array.isArray(v)) return `${name} must be an array of { label, value } entries`;
  for (let i = 0; i < v.length; i++) {
    const e = v[i];
    if (!isPlainObject(e) || typeof e.label !== "string" || typeof e.value !== "string") {
      return `${name}[${i}] must be an object with string label and value`;
    }
  }
  return null;
}

function checkField(f: FieldSpec, v: unknown): string | null {
  if (v == null) return null;
  switch (f.type) {
    case "integer":
      return v === "" ? null : checkInteger(f.name, v);
    case "number":
      return v === "" ? null : checkNumber(f.name, v);
    case "date":
      return v === "" ? null : checkDate(f.name, v);
    case "jsonb":
      return checkSpecs(f.name, v);
    default:
      return null;
  }
}

const MODERATION_STATUSES = ["clean", "flagged", "unreviewed"] as const;

// `image_paths` entries are the objects /api/upload returns (lib/api/uploadFiles.ts
// on the web, UploadedImage on iOS). They are checked BEFORE the item row is
// written: an entry missing filename/path used to 500 after the INSERT/UPDATE
// had already committed, leaving an orphan item or a half-applied PATCH (VLT-65).
// The key must be a plain upload key and the path must be the one the server
// derives from it (VLT-67); whether the caller owns the key is checked next,
// against the ledger, by resolveImagePaths.
function checkImagePaths(v: unknown): string | null {
  if (v == null) return null;
  if (!Array.isArray(v)) return "image_paths must be an array";
  for (let i = 0; i < v.length; i++) {
    const img = v[i];
    const at = `image_paths[${i}]`;
    if (!isPlainObject(img)) return `${at} must be an object`;
    if (typeof img.filename !== "string" || !img.filename.trim()) return `${at}.filename is required`;
    if (typeof img.path !== "string" || !img.path.trim()) return `${at}.path is required`;
    if (!isUploadKey(img.filename)) return `${at}.filename is not an uploaded image`;
    if (img.path !== uploadPathFor(img.filename)) return `${at}.path must be ${uploadPathFor(img.filename)}`;
    if (img.original_name != null && typeof img.original_name !== "string") return `${at}.original_name must be a string`;
    if (img.mime_type != null && typeof img.mime_type !== "string") return `${at}.mime_type must be a string`;
    if (img.size != null && !(Number.isSafeInteger(img.size) && (img.size as number) >= 0)) {
      return `${at}.size must be a whole number of bytes`;
    }
    if (
      img.moderation_status != null &&
      !MODERATION_STATUSES.includes(img.moderation_status as (typeof MODERATION_STATUSES)[number])
    ) {
      return `${at}.moderation_status must be one of: ${MODERATION_STATUSES.join(", ")}`;
    }
    if (
      img.nsfw_score != null &&
      !(typeof img.nsfw_score === "number" && img.nsfw_score >= 0 && img.nsfw_score <= 1)
    ) {
      return `${at}.nsfw_score must be a number from 0 to 1`;
    }
    if (img.nsfw_categories != null && !Array.isArray(img.nsfw_categories)) {
      return `${at}.nsfw_categories must be an array`;
    }
  }
  return null;
}

function validateBody(
  body: Record<string, unknown>,
  c: CollectionConfig,
  isCreate: boolean
): string | null {
  if (isCreate) {
    if (!body.category || typeof body.category !== "string") return "category is required";
    if (!c.validCategories.includes(body.category)) return "Invalid category";
  } else if ("category" in body) {
    // category is a NOT NULL column: a PATCH that sends it must send a real
    // one. null / "" used to skip this check and 500 on the UPDATE (VLT-65).
    if (body.category == null || (typeof body.category === "string" && !body.category.trim())) {
      return "category cannot be empty";
    }
    if (!c.validCategories.includes(body.category as string)) return "Invalid category";
  }

  for (const f of c.fields) {
    // On PATCH (isCreate=false), only validate fields that are actually
    // present in the body. Absent fields are left untouched by the
    // partial-SET clause built below, so requiring them here would
    // block legitimate partial updates — e.g. an image-only PATCH
    // from the iOS app would otherwise fail with "brand is required"
    // even though the body never tried to change `brand`.
    if (!isCreate && !(f.name in body)) continue;
    // Boolean fields (`insure`) are optional, but when the key is sent it
    // must be a real JSON boolean (VLT-64). The columns are NOT NULL, so a
    // `null` used to reach Postgres and 500, and a string like "yes" was
    // silently stored as false. An absent key is fine: POST leaves the
    // column out so the DB default applies, and PATCH leaves it untouched.
    if (f.type === "boolean" && f.name in body && typeof body[f.name] !== "boolean") {
      return `${f.name} must be a boolean (true or false)`;
    }
    // Typed columns: a value Postgres would refuse is a 400 naming the field,
    // not a 500 from the INSERT/UPDATE (VLT-65).
    const typeError = checkField(f, body[f.name]);
    if (typeError) return typeError;
    if (!f.required) continue;
    const v = body[f.name];
    if (v == null) return `${f.name} is required`;
    if (typeof v === "string" && f.trim && !v.trim()) return `${f.name} is required`;
    if (f.name === "condition" && !VALID_CONDITIONS.includes(v as typeof VALID_CONDITIONS[number])) {
      return "Invalid condition";
    }
  }

  // condition is optional on this module (autos, iod) but still must be valid
  // if provided.
  if (!c.conditionRequired) {
    const cond = body.condition;
    if (
      cond != null &&
      cond !== "" &&
      !VALID_CONDITIONS.includes(cond as typeof VALID_CONDITIONS[number])
    ) {
      return "Invalid condition";
    }
  }

  return checkImagePaths(body.image_paths);
}

// Every key in `image_paths` must be one /api/upload minted for this user
// (VLT-67). Runs after validateBody and before any write, so a refused key
// leaves no orphan item or half-applied PATCH behind.
async function resolveImagePaths(
  v: unknown,
  userId: string
): Promise<{ images: ResolvedImage[] } | { error: string }> {
  if (!Array.isArray(v) || v.length === 0) return { images: [] };
  const entries = v as ImagePath[];
  const owned = await ownedUploads(userId, entries.map((e) => e.filename));
  const images: ResolvedImage[] = [];
  for (let i = 0; i < entries.length; i++) {
    const upload = owned.get(entries[i].filename);
    if (!upload) return { error: `image_paths[${i}] is not an image this account uploaded` };
    images.push({ key: upload.key, original_name: entries[i].original_name ?? upload.original_name, upload });
  }
  return { images };
}

// ── Image side-effects ────────────────────────────────────────────────────────

// Storage objects behind deleted image rows are removed by releaseUploads
// (lib/storage/uploads.ts): only plain upload keys the item's owner uploaded,
// and only once no image row points at them. Best-effort — the rows are
// already gone, so a storage failure is logged rather than turned into a 500.

async function insertImagePaths(
  c: CollectionConfig,
  itemId: string,
  images: ResolvedImage[],
  startIndex: number,
  hasExisting: boolean
): Promise<void> {
  for (let i = 0; i < images.length; i++) {
    const { key, original_name, upload } = images[i];
    // The key, path, MIME type, size and moderation verdict all come from the
    // ledger row /api/upload wrote (VLT-67). A key with no recorded verdict
    // lands at 'unreviewed', which the public-gallery feature will treat the
    // same as 'flagged' until it gets a Tier-2 pass.
    await query(
      `INSERT INTO ${c.imagesTable} (${c.imageFkColumn}, filename, original_name, path, mime_type, size, is_primary, sort_order, moderation_status, nsfw_score, nsfw_categories)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, 'unreviewed'), $10, $11)`,
      [
        itemId,
        key,
        original_name,
        uploadPathFor(key),
        upload.mime_type,
        upload.size,
        !hasExisting && i === 0,
        startIndex + i,
        upload.moderation_status,
        upload.nsfw_score,
        upload.nsfw_categories == null ? null : JSON.stringify(upload.nsfw_categories),
      ]
    );
  }
}

// ── Public factories ──────────────────────────────────────────────────────────

export function makeListHandlers(c: CollectionConfig) {
  async function GET(request: NextRequest) {
    try {
      const session = await getApiSession(request);
      if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const requestUrl = new URL(request.url);
      const category = requestUrl.searchParams.get("category");
      // CUR-6: default list responses hide archived items. Pass
      // ?include_archived=true to surface the full set (no UI uses this in
      // v1 — the param is threaded through ahead of a future Archive view).
      const includeArchived = requestUrl.searchParams.get("include_archived") === "true";

      const params: unknown[] = [session.user.id];
      let sql = `${listSelectSql(c, true)}
        WHERE ${c.alias}.user_id = $1`;
      if (!includeArchived) {
        sql += ` AND ${c.alias}.archived_at IS NULL`;
      }
      if (category) {
        sql += ` AND ${c.alias}.category = $${params.length + 1}`;
        params.push(category);
      }
      sql += ` GROUP BY ${c.alias}.id ORDER BY ${c.alias}.created_at DESC`;

      const items = await query(sql, params);
      return NextResponse.json(items);
    } catch (error) {
      console.error(`GET /api/${c.label} list error:`, error);
      return NextResponse.json(
        { error: `Failed to fetch ${c.label} items` },
        { status: 500 }
      );
    }
  }

  async function POST(request: NextRequest) {
    try {
      const session = await getApiSession(request);
      if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const parsed = await readJsonObject(request);
      if ("error" in parsed) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
      }
      const { body } = parsed;
      const validationError = validateBody(body, c, true);
      if (validationError) {
        return NextResponse.json({ error: validationError }, { status: 400 });
      }
      const resolved = await resolveImagePaths(body.image_paths, session.user.id);
      if ("error" in resolved) {
        return NextResponse.json({ error: resolved.error }, { status: 400 });
      }

      // A boolean field the body leaves out is left out of the INSERT too, so
      // Postgres applies the column default (insure: DEFAULT FALSE, migration
      // 016, the same default the web Add modals start from) instead of an
      // explicit NULL hitting the NOT NULL constraint (VLT-64).
      const insertFields = c.fields.filter((f) => f.type !== "boolean" || f.name in body);
      const columns = ["category", ...insertFields.map((f) => f.name), "user_id"];
      const values: unknown[] = [
        body.category,
        ...insertFields.map((f) => normalizeField(body[f.name], f)),
        session.user.id,
      ];
      // Stamp specs_updated_at when the create payload carries specs (CUR-1).
      // Bound as a JS Date — node-postgres maps it to timestamptz.
      if (Array.isArray(body.specs) && body.specs.length > 0) {
        columns.push("specs_updated_at");
        values.push(new Date());
      }
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");

      const item = await queryOne<{ id: string }>(
        `INSERT INTO ${c.table} (${columns.join(", ")})
         VALUES (${placeholders})
         RETURNING *`,
        values
      );
      if (!item) throw new Error(`Failed to create ${c.label} item`);

      if (resolved.images.length > 0) {
        await insertImagePaths(c, item.id, resolved.images, 0, false);
      }

      const fullItem = await queryOne(
        `${listSelectSql(c, false)}
         WHERE ${c.alias}.id = $1
         GROUP BY ${c.alias}.id`,
        [item.id]
      );

      return NextResponse.json(fullItem, { status: 201 });
    } catch (error) {
      console.error(`POST /api/${c.label} error:`, error);
      return NextResponse.json(
        { error: `Failed to create ${c.label} item` },
        { status: 500 }
      );
    }
  }

  return { GET, POST };
}

// Next 15: dynamic-route params arrive as a Promise; handlers must await
// before reading the fields.
type ItemParams = Promise<{ id: string }>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function makeItemHandlers(c: CollectionConfig) {
  async function GET(
    request: NextRequest,
    { params }: { params: ItemParams }
  ) {
    try {
      const session = await getApiSession(request);
      if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const { id } = await params;
      // A malformed id is "no such item", not a Postgres uuid-cast 500 —
      // the item detail page (VLT-43) renders its not-found state from this.
      if (!UUID_RE.test(id)) {
        return NextResponse.json({ error: "Item not found" }, { status: 404 });
      }

      // Single-item GET needs the joined `latest_*_price` columns so
      // the iOS detail screen can render the AI ESTIMATE / MY VALUE
      // tiles, and the web item page (/<module>/item/[id], VLT-43)
      // loads the item through here too.
      const item = await queryOne(
        `${listSelectSql(c, true)}
         WHERE ${c.alias}.id = $1 AND ${c.alias}.user_id = $2
         GROUP BY ${c.alias}.id`,
        [id, session.user.id]
      );
      if (!item) {
        return NextResponse.json({ error: "Item not found" }, { status: 404 });
      }
      return NextResponse.json(item);
    } catch (error) {
      console.error(`GET /api/${c.label}/[id] error:`, error);
      return NextResponse.json(
        { error: `Failed to fetch ${c.label} item` },
        { status: 500 }
      );
    }
  }

  async function DELETE(
    request: NextRequest,
    { params }: { params: ItemParams }
  ) {
    try {
      const session = await getApiSession(request);
      if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const { id } = await params;
      // Same as GET and PATCH: a malformed id is "no such item" (VLT-65).
      if (!UUID_RE.test(id)) {
        return NextResponse.json({ error: "Item not found" }, { status: 404 });
      }

      // Read filenames before the cascade removes the rows so we can clean
      // them off disk after the parent delete commits.
      const images = await query<{ filename: string }>(
        `SELECT filename FROM ${c.imagesTable} WHERE ${c.imageFkColumn} = $1`,
        [id]
      );

      const deleted = await queryOne(
        `DELETE FROM ${c.table} WHERE id = $1 AND user_id = $2 RETURNING *`,
        [id, session.user.id]
      );
      if (!deleted) {
        return NextResponse.json({ error: "Item not found" }, { status: 404 });
      }

      await releaseUploads(session.user.id, images.map((img) => img.filename));
      return NextResponse.json({ success: true, deleted });
    } catch (error) {
      console.error(`DELETE /api/${c.label}/[id] error:`, error);
      return NextResponse.json(
        { error: `Failed to delete ${c.label} item` },
        { status: 500 }
      );
    }
  }

  async function PATCH(
    request: NextRequest,
    { params }: { params: ItemParams }
  ) {
    try {
      const session = await getApiSession(request);
      if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const { id } = await params;
      // Same as GET: a malformed id is "no such item", not a uuid-cast 500.
      if (!UUID_RE.test(id)) {
        return NextResponse.json({ error: "Item not found" }, { status: 404 });
      }

      const parsed = await readJsonObject(request);
      if ("error" in parsed) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
      }
      const { body } = parsed;
      const validationError = validateBody(body, c, false);
      if (validationError) {
        return NextResponse.json({ error: validationError }, { status: 400 });
      }
      const resolved = await resolveImagePaths(body.image_paths, session.user.id);
      if ("error" in resolved) {
        return NextResponse.json({ error: resolved.error }, { status: 400 });
      }

      // Build the SET clause. Only include columns that are explicitly
      // present in the request body — absent fields are preserved.
      // This makes partial PATCHes safe (e.g. an image-only PATCH from
      // the iOS app) without nuking unrelated columns. Sending a
      // present-but-empty value still clears the column, which matches
      // the previous behaviour for keys the client passed in.
      const setClauses: string[] = [];
      const values: unknown[] = [];
      let nextPlaceholder = 1;
      if ("category" in body) {
        setClauses.push(`category = $${nextPlaceholder}`);
        values.push(body.category || null);
        nextPlaceholder++;
      }
      for (const f of c.fields) {
        if (!(f.name in body)) continue;
        setClauses.push(`${f.name} = $${nextPlaceholder}`);
        values.push(normalizeField(body[f.name], f));
        nextPlaceholder++;
      }
      // Stamp specs_updated_at whenever this PATCH touches specs (CUR-1), so a
      // manual edit in the Edit modal records a fresh timestamp the same way an
      // AI generation does.
      if ("specs" in body) {
        setClauses.push("specs_updated_at = NOW()");
      }
      if (c.patchSetUpdatedAt && setClauses.length > 0) {
        setClauses.push("updated_at = NOW()");
      }

      // Ownership-check + RETURNING in one go. If the body had no
      // column-level changes (image-only PATCH), an empty SET clause
      // would be invalid SQL — fall back to a SELECT that does the
      // same ownership-check + RETURNING-equivalent shape.
      let item: Record<string, unknown> | null;
      if (setClauses.length > 0) {
        const idPlaceholder = nextPlaceholder;
        const userIdPlaceholder = nextPlaceholder + 1;
        values.push(id, session.user.id);
        item = await queryOne(
          `UPDATE ${c.table} SET ${setClauses.join(", ")}
           WHERE id = $${idPlaceholder} AND user_id = $${userIdPlaceholder}
           RETURNING *`,
          values
        );
      } else {
        item = await queryOne(
          `SELECT * FROM ${c.table} WHERE id = $1 AND user_id = $2`,
          [id, session.user.id]
        );
      }
      if (!item) {
        return NextResponse.json({ error: "Item not found" }, { status: 404 });
      }

      // Reorder existing images.
      const imageOrder = body.image_order;
      if (Array.isArray(imageOrder) && imageOrder.length > 0) {
        for (let i = 0; i < imageOrder.length; i++) {
          await query(
            `UPDATE ${c.imagesTable} SET sort_order = $1, is_primary = $2
             WHERE id = $3 AND ${c.imageFkColumn} = $4`,
            [i, i === 0, imageOrder[i], id]
          );
        }
      }

      // Delete removed images (DB rows + the owner's storage objects).
      const imagesToDelete = body.images_to_delete;
      if (Array.isArray(imagesToDelete) && imagesToDelete.length > 0) {
        const deletedImgs = await query<{ filename: string }>(
          `DELETE FROM ${c.imagesTable} WHERE id = ANY($1::uuid[]) AND ${c.imageFkColumn} = $2 RETURNING *`,
          [imagesToDelete, id]
        );
        await releaseUploads(session.user.id, deletedImgs.map((img) => img.filename));
      }

      // Append new images, picking up sort_order after the kept set.
      const newImages = resolved.images;
      if (newImages.length > 0) {
        const existingCount = await queryOne<{ count: string }>(
          `SELECT COUNT(*) AS count FROM ${c.imagesTable} WHERE ${c.imageFkColumn} = $1`,
          [id]
        );
        const hasExisting = parseInt(existingCount?.count ?? "0") > 0;
        const startIndex = Array.isArray(imageOrder)
          ? imageOrder.length
          : hasExisting
          ? parseInt(existingCount?.count ?? "0")
          : 0;
        await insertImagePaths(c, id, newImages, startIndex, hasExisting);
      }

      const fullItem = await queryOne(
        `${listSelectSql(c, false)}
         WHERE ${c.alias}.id = $1
         GROUP BY ${c.alias}.id`,
        [id]
      );

      return NextResponse.json(fullItem);
    } catch (error) {
      console.error(`PATCH /api/${c.label}/[id] error:`, error);
      return NextResponse.json(
        { error: `Failed to update ${c.label} item` },
        { status: 500 }
      );
    }
  }

  return { GET, PATCH, DELETE };
}

// ── Bulk-action factory (CUR-6) ──────────────────────────────────────────────
//
// One factory for all four modules. The route file at
// app/api/{module}/bulk-action/route.ts simply re-exports POST from this.
//
// Body shape:
//   { action: "set_insure" | "archive" | "delete", ids: string[], value?: boolean }
//
// Semantics:
//   - set_insure: requires `value: boolean`; UPDATEs `insure = $value` for all
//     `ids` belonging to the session user.
//   - archive: UPDATEs `archived_at = NOW()` for all rows where archived_at IS
//     NULL (idempotent — re-archiving an already-archived row is a no-op).
//   - delete: DELETEs the rows. Cascades remove image and valuation rows
//     automatically (FK ON DELETE CASCADE). Image objects in R2/disk are
//     swept by `releaseUploads` after the parent rows are gone.
//
// Authorization is enforced by SQL — every UPDATE/DELETE includes
// `WHERE id = ANY($ids) AND user_id = $session_user_id`. The returned
// `affected` count is the source of truth: if the user submitted 5 IDs but
// only owns 3 of them, the response will report `affected: 3`.

type BulkAction = "set_insure" | "archive" | "delete";

export function makeBulkActionHandler(c: CollectionConfig) {
  return async function POST(request: NextRequest) {
    try {
      const session = await getApiSession(request);
      if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      let body: { action?: string; ids?: unknown; value?: unknown };
      try {
        body = (await request.json()) as typeof body;
      } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
      }

      const action = body.action as BulkAction | undefined;
      if (action !== "set_insure" && action !== "archive" && action !== "delete") {
        return NextResponse.json(
          { error: "action must be one of: set_insure | archive | delete" },
          { status: 400 },
        );
      }

      const ids = Array.isArray(body.ids) ? body.ids.filter((id) => typeof id === "string") : null;
      if (!ids || ids.length === 0) {
        return NextResponse.json({ error: "ids must be a non-empty string[]" }, { status: 400 });
      }

      // Hard ceiling on bulk size — prevents a runaway client from
      // accidentally affecting hundreds of rows. 200 is generous for the
      // expected "select a category and toggle" workflow.
      if (ids.length > 200) {
        return NextResponse.json({ error: "Bulk actions are limited to 200 ids per request" }, { status: 400 });
      }

      if (action === "set_insure") {
        if (typeof body.value !== "boolean") {
          return NextResponse.json({ error: "set_insure requires `value: boolean`" }, { status: 400 });
        }
        const result = await query<{ id: string }>(
          `UPDATE ${c.table}
             SET insure = $1${c.patchSetUpdatedAt ? ", updated_at = NOW()" : ""}
           WHERE id = ANY($2::uuid[]) AND user_id = $3
           RETURNING id`,
          [body.value, ids, session.user.id],
        );
        return NextResponse.json({ action, affected: result.length, ids: result.map((r) => r.id) });
      }

      if (action === "archive") {
        const result = await query<{ id: string }>(
          `UPDATE ${c.table}
             SET archived_at = NOW()${c.patchSetUpdatedAt ? ", updated_at = NOW()" : ""}
           WHERE id = ANY($1::uuid[]) AND user_id = $2 AND archived_at IS NULL
           RETURNING id`,
          [ids, session.user.id],
        );
        return NextResponse.json({ action, affected: result.length, ids: result.map((r) => r.id) });
      }

      // action === "delete"
      // Read filenames before the cascade so we can sweep image files after
      // the parent delete commits (same pattern as makeItemHandlers.DELETE).
      const images = await query<{ filename: string }>(
        `SELECT img.filename
           FROM ${c.imagesTable} img
           JOIN ${c.table} ${c.alias} ON ${c.alias}.id = img.${c.imageFkColumn}
          WHERE img.${c.imageFkColumn} = ANY($1::uuid[]) AND ${c.alias}.user_id = $2`,
        [ids, session.user.id],
      );
      const deleted = await query<{ id: string }>(
        `DELETE FROM ${c.table}
          WHERE id = ANY($1::uuid[]) AND user_id = $2
          RETURNING id`,
        [ids, session.user.id],
      );
      await releaseUploads(session.user.id, images.map((img) => img.filename));
      return NextResponse.json({ action, affected: deleted.length, ids: deleted.map((r) => r.id) });
    } catch (error) {
      console.error(`POST /api/${c.label}/bulk-action error:`, error);
      return NextResponse.json(
        { error: `Failed to perform bulk action on ${c.label}` },
        { status: 500 },
      );
    }
  };
}
