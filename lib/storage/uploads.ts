// The server's own record of the image objects it stores (VLT-67).
//
// Every object `/api/upload` (or the JSON importer) writes gets a row in the
// `uploads` ledger (migration 027): the key the server minted and the user it
// was minted for, plus the Tier-1 moderation verdict the server computed.
// Everything that later attaches, serves, exports or deletes an image object
// derives the key and the verdict from that row — never from a filename or a
// verdict a client sent back. Before this, the item API took `filename` (the
// storage key), `path` and `moderation_status` straight from the request body,
// so a client could point its own image row at another user's object (and
// delete it by deleting its own item), at `../` outside the uploads folder,
// or mark a flagged upload `clean`.

import path from "path";
import fs from "fs/promises";
import { v4 as uuidv4 } from "uuid";
import { query } from "@/lib/db";
import { r2DeleteObjects, r2GetObject, r2IsConfigured, r2PutObject } from "@/lib/storage/r2";

// A key the server mints: a v4 UUID, a dot, and an extension with no path
// separators or control characters. Every key /api/upload has ever issued has
// this shape (the extension used to be copied from the client's file name, so
// legacy keys can carry an odd one), and nothing else in the bucket does: the
// insurance PDFs live under `paperwork/<user>/…`. Because it starts with a
// UUID and has no separator it can be neither `..` nor a nested path.
// db/migrations/027_uploads_ledger.sql repeats this pattern for the backfill.
export const UPLOAD_KEY_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[^/\\\u0000-\u001f\u007f]{1,64}$/;

export function isUploadKey(v: unknown): v is string {
  return typeof v === "string" && UPLOAD_KEY_RE.test(v);
}

/** The public path an image row stores for a key; /api/uploads resolves it. */
export function uploadPathFor(key: string): string {
  return `/uploads/${key}`;
}

// The extension comes from the MIME type the server accepted, not from the
// client's file name.
const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export function extensionForMime(mimeType: string | null | undefined): string | null {
  return (mimeType && EXT_BY_MIME[mimeType.toLowerCase()]) || null;
}

export function newUploadKey(mimeType: string): string {
  return `${uuidv4()}.${extensionForMime(mimeType) ?? "jpg"}`;
}

function uploadsDir(): string {
  return path.join(process.cwd(), "public", "uploads");
}

// Local-disk location of a key, or null when the key is not a plain upload key
// or would resolve outside the uploads folder (belt and braces: a valid key
// cannot, by construction).
export function localUploadFile(key: string): string | null {
  if (!isUploadKey(key)) return null;
  const dir = uploadsDir();
  const file = path.resolve(dir, key);
  return path.dirname(file) === path.resolve(dir) ? file : null;
}

// ── storage I/O (R2 in production, public/uploads on disk otherwise) ─────────

export async function writeUploadObject(key: string, body: Buffer, contentType: string): Promise<void> {
  if (r2IsConfigured()) {
    await r2PutObject(key, body, contentType);
    return;
  }
  const file = localUploadFile(key);
  if (!file) throw new Error("refusing to write a non-upload key");
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, body);
}

export async function readUploadObject(key: string): Promise<Buffer> {
  if (r2IsConfigured()) {
    if (!isUploadKey(key)) throw new Error("refusing to read a non-upload key");
    return r2GetObject(key);
  }
  const file = localUploadFile(key);
  if (!file) throw new Error("refusing to read a non-upload key");
  return fs.readFile(file);
}

async function deleteUploadObjects(keys: string[]): Promise<void> {
  const plain = keys.filter(isUploadKey);
  if (plain.length === 0) return;
  if (r2IsConfigured()) {
    await r2DeleteObjects(plain);
    return;
  }
  for (const key of plain) {
    const file = localUploadFile(key);
    if (!file) continue;
    try {
      await fs.unlink(file);
    } catch {
      // already gone; nothing to do
    }
  }
}

/** Best-effort removal of an object the server just wrote and could not record. */
export async function discardUploadObject(key: string): Promise<void> {
  try {
    await deleteUploadObjects([key]);
  } catch (err) {
    console.warn("[storage] discarding an unrecorded upload failed:", err);
  }
}

// ── the ledger ───────────────────────────────────────────────────────────────

export interface ModerationRecord {
  moderation_status: "clean" | "flagged" | null;
  nsfw_score: number | null;
  nsfw_categories: unknown;
}

export interface UploadRecord extends ModerationRecord {
  key: string;
  original_name: string | null;
  mime_type: string | null;
  size: number | null;
}

export async function recordUpload(args: {
  key: string;
  userId: string;
  origin: "upload" | "import";
  originalName: string | null;
  mimeType: string | null;
  size: number | null;
  moderation: ModerationRecord | null;
}): Promise<void> {
  const m = args.moderation;
  await query(
    `INSERT INTO uploads (key, user_id, origin, original_name, mime_type, size, moderation_status, nsfw_score, nsfw_categories)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      args.key,
      args.userId,
      args.origin,
      args.originalName,
      args.mimeType,
      args.size,
      m?.moderation_status ?? null,
      m?.nsfw_score ?? null,
      m?.nsfw_categories == null ? null : JSON.stringify(m.nsfw_categories),
    ],
  );
}

export async function forgetUpload(key: string): Promise<void> {
  await query(`DELETE FROM uploads WHERE key = $1`, [key]);
}

/** The ledger rows among `keys` that were minted for `userId`. */
export async function ownedUploads(userId: string, keys: string[]): Promise<Map<string, UploadRecord>> {
  const plain = Array.from(new Set(keys.filter(isUploadKey)));
  const out = new Map<string, UploadRecord>();
  if (plain.length === 0) return out;
  const rows = await query<UploadRecord & { nsfw_score: string | number | null }>(
    `SELECT key, original_name, mime_type, size, moderation_status, nsfw_score, nsfw_categories
       FROM uploads
      WHERE user_id = $1 AND key = ANY($2::text[])`,
    [userId, plain],
  );
  for (const r of rows) {
    out.set(r.key, { ...r, nsfw_score: r.nsfw_score == null ? null : Number(r.nsfw_score) });
  }
  return out;
}

// The four image tables, for "is any row still pointing at this key?".
const IMAGE_TABLES = ["guitar_images", "watch_images", "auto_images", "iod_images"] as const;

/**
 * Called after image rows are deleted. Deletes the storage object behind each
 * key only when the key is a plain upload key, the ledger says it was minted
 * for `ownerId` (the owner of the item the rows belonged to), and no image row
 * anywhere still points at it. Anything else is left alone: an orphaned object
 * is a storage cost, a wrongly deleted one is somebody's photo.
 *
 * Best-effort, like the code it replaces: the rows are already gone, so a
 * storage failure is logged, never turned into a 500.
 */
export async function releaseUploads(ownerId: string, keys: string[]): Promise<void> {
  const plain = Array.from(new Set(keys.filter(isUploadKey)));
  if (plain.length === 0) return;
  try {
    const stillUsed = IMAGE_TABLES.map((t) => `NOT EXISTS (SELECT 1 FROM ${t} WHERE filename = u.key)`).join(" AND ");
    const rows = await query<{ key: string }>(
      `SELECT u.key FROM uploads u
        WHERE u.user_id = $1 AND u.key = ANY($2::text[]) AND ${stillUsed}`,
      [ownerId, plain],
    );
    const releasable = rows.map((r) => r.key);
    if (releasable.length === 0) return;
    await deleteUploadObjects(releasable);
    await query(`DELETE FROM uploads WHERE user_id = $1 AND key = ANY($2::text[])`, [ownerId, releasable]);
  } catch (err) {
    console.warn("[storage] releasing uploads failed:", err);
  }
}
