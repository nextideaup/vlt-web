// Generic CRUD handler factory for the four collection modules. Each module's
// route.ts and [id]/route.ts call makeListHandlers / makeItemHandlers with
// their CollectionConfig — the per-module differences live entirely in those
// configs.

import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import { getApiSession } from "@/lib/api-auth";
import { query, queryOne } from "@/lib/db";
import { r2IsConfigured, r2DeleteObjects } from "@/lib/storage/r2";
import type { CollectionConfig, FieldSpec } from "@/lib/collections/types";

const VALID_CONDITIONS = ["Mint", "Excellent", "Very Good", "Good", "Fair", "Poor"] as const;

interface ImagePath {
  filename: string;
  original_name: string | null;
  path: string;
  mime_type?: string | null;
  size?: number | null;
  // Tier-1 moderation metadata produced by /api/upload (lib/moderation/nsfw.ts).
  // Optional for backwards compatibility — any caller that posts an image
  // path without these fields lands at the DB default ('unreviewed').
  moderation_status?: "clean" | "flagged" | "unreviewed" | null;
  nsfw_score?: number | null;
  nsfw_categories?: { className: string; probability: number }[] | null;
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
  if (spec.type === "boolean") {
    return value === true || value === "true";
  }
  // JSONB columns (the freeform `specs` array). node-postgres binds a JS array
  // as a Postgres array literal, which a jsonb column rejects — so serialize it
  // ourselves. An empty array collapses to SQL NULL to keep "no specs" tidy.
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

function validateBody(
  body: Record<string, unknown>,
  c: CollectionConfig,
  isCreate: boolean
): string | null {
  if (isCreate) {
    if (!body.category || typeof body.category !== "string") return "category is required";
    if (!c.validCategories.includes(body.category)) return "Invalid category";
  } else if (body.category != null && body.category !== "") {
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

  return null;
}

// ── Image side-effects ────────────────────────────────────────────────────────

// Best-effort deletion of the underlying image objects. R2 in production,
// local public/uploads in dev. Failures here are logged but never propagated
// — the parent row is already gone (cascade), so we'd rather end up with an
// orphan storage object than a 500 on a successful PATCH/DELETE.
async function deleteImageFiles(images: { filename: string }[]): Promise<void> {
  if (images.length === 0) return;
  if (r2IsConfigured()) {
    try {
      await r2DeleteObjects(images.map((img) => img.filename));
    } catch (err) {
      console.warn("[storage] R2 delete failed:", err);
    }
    return;
  }
  const uploadsDir = path.join(process.cwd(), "public", "uploads");
  for (const image of images) {
    try {
      await fs.unlink(path.join(uploadsDir, image.filename));
    } catch {
      // file may already be gone; nothing to do
    }
  }
}

async function insertImagePaths(
  c: CollectionConfig,
  itemId: string,
  imagePaths: ImagePath[],
  startIndex: number,
  hasExisting: boolean
): Promise<void> {
  for (let i = 0; i < imagePaths.length; i++) {
    const img = imagePaths[i];
    // Moderation columns (migration 017) — pass through the verdict from
    // /api/upload when present. Falling back to the DB default ('unreviewed'
    // + null score) keeps callers that predate the moderation pipeline
    // working unchanged; the public-gallery feature will treat 'unreviewed'
    // the same as 'flagged' until it gets a Tier-2 pass.
    await query(
      `INSERT INTO ${c.imagesTable} (${c.imageFkColumn}, filename, original_name, path, mime_type, size, is_primary, sort_order, moderation_status, nsfw_score, nsfw_categories)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, 'unreviewed'), $10, $11)`,
      [
        itemId,
        img.filename,
        img.original_name,
        img.path,
        img.mime_type ?? null,
        img.size ?? null,
        !hasExisting && i === 0,
        startIndex + i,
        img.moderation_status ?? null,
        img.nsfw_score ?? null,
        img.nsfw_categories ? JSON.stringify(img.nsfw_categories) : null,
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

      const body = (await request.json()) as Record<string, unknown>;
      const validationError = validateBody(body, c, true);
      if (validationError) {
        return NextResponse.json({ error: validationError }, { status: 400 });
      }

      const columns = ["category", ...c.fields.map((f) => f.name), "user_id"];
      const values: unknown[] = [
        body.category,
        ...c.fields.map((f) => normalizeField(body[f.name], f)),
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

      const imagePaths = body.image_paths;
      if (Array.isArray(imagePaths) && imagePaths.length > 0) {
        await insertImagePaths(c, item.id, imagePaths as ImagePath[], 0, false);
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

      await deleteImageFiles(images);
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

      const body = (await request.json()) as Record<string, unknown>;
      const validationError = validateBody(body, c, false);
      if (validationError) {
        return NextResponse.json({ error: validationError }, { status: 400 });
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

      // Delete removed images (DB rows + files on disk).
      const imagesToDelete = body.images_to_delete;
      if (Array.isArray(imagesToDelete) && imagesToDelete.length > 0) {
        const deletedImgs = await query<{ filename: string }>(
          `DELETE FROM ${c.imagesTable} WHERE id = ANY($1::uuid[]) AND ${c.imageFkColumn} = $2 RETURNING *`,
          [imagesToDelete, id]
        );
        await deleteImageFiles(deletedImgs);
      }

      // Append new images, picking up sort_order after the kept set.
      const newImages = body.image_paths;
      if (Array.isArray(newImages) && newImages.length > 0) {
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
        await insertImagePaths(c, id, newImages as ImagePath[], startIndex, hasExisting);
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
//     automatically (FK ON DELETE CASCADE). Image files in R2/disk are
//     swept by `deleteImageFiles` after the parent rows are gone.
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
      await deleteImageFiles(images);
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
