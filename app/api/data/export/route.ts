import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { ownedUploads, readUploadObject } from "@/lib/storage/uploads";

// Embed every item's full valuation history alongside the item so an import
// re-creates the dashboard's "latest price" and the user's prior AI valuations
// (which cost money to regenerate). Image rows are embedded too — see the
// "Images" section below for the bytes-vs-metadata tradeoff.

interface Row { id: string; [key: string]: unknown; }

interface ImageRow {
  id: string;
  filename: string;
  original_name: string | null;
  path: string;
  mime_type: string | null;
  size: number | null;
  is_primary: boolean;
  sort_order: number;
  created_at: string;
  moderation_status: string;
  nsfw_score: string | null;
  nsfw_categories: unknown;
  // Carried only when include_image_data=true on the request. Base64-encoded
  // raw bytes — see Images section below.
  data_base64?: string;
}

async function withValuations(
  items: Row[],
  valuationsTable: string,
  fkColumn: string,
): Promise<Row[]> {
  if (items.length === 0) return items;
  const ids = items.map((i) => i.id);
  const valuations = await query<Row>(
    `SELECT * FROM ${valuationsTable}
     WHERE ${fkColumn} = ANY($1::uuid[])
     ORDER BY created_at ASC`,
    [ids],
  );
  const byItem = new Map<string, Row[]>();
  for (const v of valuations) {
    const itemId = v[fkColumn] as string;
    const list = byItem.get(itemId) ?? [];
    list.push(v);
    byItem.set(itemId, list);
  }
  return items.map((i) => ({ ...i, valuations: byItem.get(i.id) ?? [] }));
}

// ── Images ───────────────────────────────────────────────────────────────────
//
// Always emit image-row metadata (id, filename, path, sort_order, moderation
// columns, etc.) so the importer can recreate the rows verbatim — this also
// preserves the NSFW.js verdict, which is expensive to regenerate.
//
// Image *bytes* are an opt-in: pass `include_image_data: true` on the export
// request and each row gets a `data_base64` field with the raw object bytes.
// The default (false) keeps the JSON small for "I'm migrating to a new
// environment that shares my R2 bucket" use; bytes-on is the right choice
// for "I want a real backup that survives an R2 wipe".
//
// On byte fetch failure (R2 object missing, disk path missing, etc.) we log
// and skip the byte payload but still emit the row. A partial export beats
// a thrown 500 — the importer side handles missing-bytes gracefully.
//
// Bytes are read only for keys the `uploads` ledger records against the
// exporting user (VLT-67). A row's `filename` used to be whatever a client had
// sent, so reading it as given handed back another user's object, or a file
// outside the uploads folder, to anyone who planted its name.
const BYTE_CONCURRENCY = 8;

async function readBytes(filename: string): Promise<Buffer | null> {
  try {
    return await readUploadObject(filename);
  } catch (err) {
    console.warn(`[export] failed to read bytes for ${filename}:`, err);
    return null;
  }
}

async function withImages(
  userId: string,
  items: Row[],
  imagesTable: string,
  fkColumn: string,
  includeBytes: boolean,
): Promise<Row[]> {
  if (items.length === 0) return items;
  const ids = items.map((i) => i.id);
  const images = await query<ImageRow & { [key: string]: unknown }>(
    `SELECT id, ${fkColumn}, filename, original_name, path, mime_type, size,
            is_primary, sort_order, created_at,
            moderation_status, nsfw_score, nsfw_categories
       FROM ${imagesTable}
      WHERE ${fkColumn} = ANY($1::uuid[])
      ORDER BY sort_order ASC, is_primary DESC, created_at ASC`,
    [ids],
  );

  if (includeBytes && images.length > 0) {
    const owned = await ownedUploads(userId, images.map((img) => img.filename));
    const readable = images.filter((img) => owned.has(img.filename));
    // Concurrent byte fetches with a small cap — avoids hammering R2 with
    // hundreds of parallel GETs on a large export. 8 is well under any
    // reasonable per-account rate limit and keeps wall-clock manageable.
    for (let i = 0; i < readable.length; i += BYTE_CONCURRENCY) {
      const slice = readable.slice(i, i + BYTE_CONCURRENCY);
      await Promise.all(
        slice.map(async (img) => {
          const bytes = await readBytes(img.filename);
          if (bytes) img.data_base64 = bytes.toString("base64");
        }),
      );
    }
  }

  const byItem = new Map<string, ImageRow[]>();
  for (const img of images) {
    const itemId = img[fkColumn] as string;
    const list = byItem.get(itemId) ?? [];
    list.push(img);
    byItem.set(itemId, list);
  }
  return items.map((i) => ({ ...i, images: byItem.get(i.id) ?? [] }));
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  try {
    const body = (await req.json()) as {
      collections: string[];
      include_image_data?: boolean;
    };
    const collections = body.collections;
    const includeBytes = body.include_image_data === true;

    const result: Record<string, unknown[]> = {};

    if (collections.includes("guitars")) {
      const items = await query<Row>(
        `SELECT * FROM guitar_items WHERE user_id = $1 ORDER BY created_at`,
        [userId],
      );
      const withVals = await withValuations(items, "guitar_valuations", "guitar_item_id");
      result.guitars = await withImages(userId, withVals, "guitar_images", "guitar_item_id", includeBytes);
    }

    if (collections.includes("watches")) {
      const items = await query<Row>(
        `SELECT * FROM watch_items WHERE user_id = $1 ORDER BY created_at`,
        [userId],
      );
      const withVals = await withValuations(items, "watch_valuations", "watch_item_id");
      result.watches = await withImages(userId, withVals, "watch_images", "watch_item_id", includeBytes);
    }

    if (collections.includes("automobiles")) {
      const items = await query<Row>(
        `SELECT * FROM automobiles WHERE user_id = $1 ORDER BY created_at`,
        [userId],
      );
      const withVals = await withValuations(items, "auto_valuations", "auto_id");
      result.automobiles = await withImages(userId, withVals, "auto_images", "auto_id", includeBytes);
    }

    if (collections.includes("collectibles")) {
      const items = await query<Row>(
        `SELECT * FROM items_of_distinction WHERE user_id = $1 ORDER BY created_at`,
        [userId],
      );
      const withVals = await withValuations(items, "iod_valuations", "iod_id");
      result.collectibles = await withImages(userId, withVals, "iod_images", "iod_id", includeBytes);
    }

    // CUR-9: include insurance_valuation_norms as a top-level export key so
    // a roundtrip rehydrates a fresh DB with the same norm table (saving
    // the ~$1 + a minute of Anthropic calls to re-research). Config-level,
    // not user-scoped — these multipliers apply to every user.
    //
    // paperwork_generations is NOT exported (history-only, regenerable).
    const insuranceValuationNorms = await query<Row>(
      `SELECT module, category, multiplier::float AS multiplier, notes, updated_at
         FROM insurance_valuation_norms
         ORDER BY module, category`,
      [],
    );

    const payload = {
      // 1.3: item `specs` (JSONB label/value/source rows, migration 019) now
      // round-trip. They ride along automatically via `SELECT *`; the importer
      // persists them (1.0–1.3 all accepted — older payloads simply have no
      // `specs`).
      // 1.2: image rows now round-trip (metadata always; bytes when
      // `include_image_data: true`). Importer accepts 1.0/1.1/1.2 — older
      // payloads simply have no `images` array.
      version: "1.3",
      exported_at: new Date().toISOString(),
      // Surfaces the byte-embedding choice in the payload itself so a viewer
      // (or future tooling) can tell at a glance whether this file is a
      // metadata-only or full backup.
      includes_image_data: includeBytes,
      collections: result,
      insurance_valuation_norms: insuranceValuationNorms,
    };

    return NextResponse.json(payload);
  } catch (err) {
    console.error("[export]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
