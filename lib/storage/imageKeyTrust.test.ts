// VLT-67: the server, not the client, decides which storage object an image
// row points at and what moderation verdict it carries.
//
// Before this item every image row took `filename` (the storage key), `path`
// and the moderation fields from the request body. The tests below drive the
// real route handlers against a throwaway Postgres and LOCAL-DISK storage
// (public/uploads under the checkout), plus an in-memory stand-in for R2, and
// show what a hostile client could do with that:
//   - plant another user's key on its own item, then delete the item, which
//     deleted the victim's object;
//   - plant a `../` filename, which reached outside the uploads folder on delete;
//   - claim `moderation_status: "clean"` for an upload the classifier flagged;
//   - do the same through the JSON import, and read another user's bytes back
//     through the export.
//
// Needs DATABASE_URL (the NIU `ci` suite provides a fresh one per run). Without
// it the suite is skipped, never pointed at anything else.

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  userId: null as string | null,
  r2: false,
  objects: new Map<string, Buffer>(),
  verdict: {
    status: "clean" as "clean" | "flagged" | "blocked",
    nsfw_score: 0.0123,
    categories: [{ className: "Neutral", probability: 0.98 }],
    hardBlocked: false,
  },
}));

vi.mock("@/lib/api-auth", () => ({
  getApiSession: async () =>
    state.userId ? { user: { id: state.userId, email: "t@example.test", name: null } } : null,
}));
vi.mock("next-auth", () => ({
  getServerSession: async () => (state.userId ? { user: { id: state.userId } } : null),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
// The classifier itself (NSFW.js) is not under test: it returns whatever
// verdict the test sets, the way the real one would for a given image.
vi.mock("@/lib/moderation/nsfw", () => ({ classifyImage: async () => ({ ...state.verdict }) }));
// R2 stand-in: an in-memory bucket. r2IsConfigured() follows state.r2, so the
// same tests exercise the production (R2) branch and the local-disk branch.
vi.mock("@/lib/storage/r2", () => ({
  r2IsConfigured: () => state.r2,
  r2PutObject: async (key: string, body: Buffer) => {
    state.objects.set(key, Buffer.from(body));
  },
  r2GetObject: async (key: string) => {
    const b = state.objects.get(key);
    if (!b) throw new Error(`NoSuchKey: ${key}`);
    return b;
  },
  r2DeleteObjects: async (keys: string[]) => {
    for (const k of keys) state.objects.delete(k);
  },
  r2GetPresignedUrl: async (key: string) => `https://r2.example.test/${key}?X-Amz-Signature=test`,
  R2_PRESIGN_TTL_SECONDS: 3600,
}));

import { POST as uploadPOST } from "@/app/api/upload/route";
import { GET as serveGET } from "@/app/api/uploads/[...path]/route";
import { POST as importPOST } from "@/app/api/data/import/route";
import { POST as exportPOST } from "@/app/api/data/export/route";
import { DELETE as legacyAutoImageDELETE } from "@/app/api/automobiles/[id]/images/[imageId]/route";
import { makeBulkActionHandler, makeItemHandlers, makeListHandlers } from "@/lib/collection-handler";
import { autoConfig } from "@/lib/collections/auto";
import { guitarConfig } from "@/lib/collections/guitar";
import { query, queryOne } from "@/lib/db";

const guitars = makeListHandlers(guitarConfig);
const guitar = makeItemHandlers(guitarConfig);
const guitarBulk = makeBulkActionHandler(guitarConfig);
const autos = makeListHandlers(autoConfig);

const PUBLIC_DIR = path.join(process.cwd(), "public");
const UPLOADS_DIR = path.join(PUBLIC_DIR, "uploads");
const RUN = randomUUID().slice(0, 8);
const createdFiles = new Set<string>();

// Never let this suite near a hosted database, whatever DATABASE_URL says.
function isThrowawayDatabase(url: string | undefined): boolean {
  if (!url || process.env.NODE_ENV === "production") return false;
  try {
    const host = new URL(url).hostname;
    return !/(\.railway\.internal|\.rlwy\.net|\.railway\.app)$/i.test(host);
  } catch {
    return false;
  }
}
const HAS_DB = isThrowawayDatabase(process.env.DATABASE_URL);

// ── request helpers ──────────────────────────────────────────────────────────

const as = (userId: string | null) => {
  state.userId = userId;
};

function jsonReq(method: string, url: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const params = <T extends object>(p: T) => ({ params: Promise.resolve(p) });

// Response bodies are read loosely: the assertions name the fields they need.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function read(res: Response): Promise<{ status: number; json: any }> {
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

interface Uploaded {
  filename: string;
  original_name: string;
  path: string;
  mime_type: string;
  size: number;
  moderation_status: string;
  nsfw_score: number;
  nsfw_categories: unknown[];
}

async function upload(userId: string, bytes: string, name = "photo.jpg", type = "image/jpeg"): Promise<Uploaded> {
  as(userId);
  const form = new FormData();
  form.append("files", new File([Buffer.from(bytes)], name, { type }));
  const res = await read(await uploadPOST(new NextRequest("http://localhost/api/upload", { method: "POST", body: form })));
  expect(res.status, JSON.stringify(res.json)).toBe(201);
  const f = res.json.files[0] as Uploaded;
  createdFiles.add(path.join(UPLOADS_DIR, f.filename));
  return f;
}

const guitarBody = (extra: Record<string, unknown> = {}) => ({
  category: "electric-guitars",
  brand: `VLT67-${RUN}`,
  model: "Harness",
  condition: "Excellent",
  ...extra,
});

async function createGuitar(userId: string, imagePaths: unknown[]) {
  as(userId);
  return read(await guitars.POST(jsonReq("POST", "/api/guitars", guitarBody({ image_paths: imagePaths }))));
}

async function deleteGuitar(userId: string, id: string) {
  as(userId);
  return read(await guitar.DELETE(jsonReq("DELETE", `/api/guitars/${id}`), params({ id })));
}

const onDisk = (key: string) => fs.existsSync(path.join(UPLOADS_DIR, key));

function canary(label: string, contents = `vlt67 canary ${label}`): { abs: string; rel: string } {
  const name = `vlt67-${RUN}-${label}.txt`;
  const abs = path.join(PUBLIC_DIR, name);
  fs.writeFileSync(abs, contents);
  createdFiles.add(abs);
  // From inside public/uploads, `../<name>` is public/<name>.
  return { abs, rel: `../${name}` };
}

async function mkUser(label: string): Promise<string> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO users (email, name) VALUES ($1, $2) RETURNING id`,
    [`vlt67-${RUN}-${label}@example.test`, `VLT-67 ${label}`],
  );
  return row!.id;
}

// Image rows written straight into the table: the shape existing production
// data could already have, whatever the API now refuses.
async function plantRow(table: string, fk: string, itemId: string, filename: string) {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO ${table} (${fk}, filename, original_name, path, mime_type, size, is_primary, sort_order)
     VALUES ($1, $2, 'planted.jpg', $3, 'image/jpeg', 1, false, 99) RETURNING id`,
    [itemId, filename, `/uploads/${filename}`],
  );
  return row!.id;
}

// ── suite ────────────────────────────────────────────────────────────────────

describe.skipIf(!HAS_DB)("VLT-67: storage keys and moderation verdicts come from the server", () => {
  let alice: string;
  let mallory: string;

  beforeAll(async () => {
    // The same migration runner the Dockerfile CMD uses on deploy.
    execFileSync(process.execPath, [path.join(process.cwd(), "scripts", "migrate.js")], {
      env: process.env,
      stdio: "pipe",
    });
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    alice = await mkUser("alice");
    mallory = await mkUser("mallory");
  }, 60_000);

  beforeEach(() => {
    state.r2 = false;
    state.verdict = { status: "clean", nsfw_score: 0.0123, categories: [{ className: "Neutral", probability: 0.98 }], hardBlocked: false };
  });

  afterAll(async () => {
    for (const f of createdFiles) fs.rmSync(f, { force: true });
    if (alice || mallory) {
      await query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [[alice, mallory].filter(Boolean)]);
    }
    await globalThis._pgPool?.end();
    globalThis._pgPool = undefined;
  });

  // ── AC 1: planting another user's key ──────────────────────────────────────

  it("refuses another user's key on create, and deleting the planter's item leaves the victim's file (local disk)", async () => {
    const a = await upload(alice, "alice's photo");
    expect((await createGuitar(alice, [a])).status).toBe(201);

    const plant = await createGuitar(mallory, [
      { filename: a.filename, path: a.path, original_name: "mine.jpg", mime_type: "image/jpeg", size: 1 },
    ]);
    if (plant.status === 201) await deleteGuitar(mallory, plant.json.id);

    expect({ plantStatus: plant.status, aliceFileSurvives: onDisk(a.filename) }).toEqual({
      plantStatus: 400,
      aliceFileSurvives: true,
    });
    expect(plant.json.error).toMatch(/image_paths\[0\]/);
  });

  it("refuses another user's key on PATCH, and the victim's R2 object survives the planter's delete", async () => {
    state.r2 = true;
    const a = await upload(alice, "alice's R2 photo");
    expect(state.objects.has(a.filename)).toBe(true);
    expect((await createGuitar(alice, [a])).status).toBe(201);

    const own = await createGuitar(mallory, []);
    expect(own.status).toBe(201);
    as(mallory);
    const plant = await read(
      await guitar.PATCH(
        jsonReq("PATCH", `/api/guitars/${own.json.id}`, { image_paths: [{ filename: a.filename, path: a.path }] }),
        params({ id: own.json.id }),
      ),
    );
    await deleteGuitar(mallory, own.json.id);

    expect({ plantStatus: plant.status, aliceObjectSurvives: state.objects.has(a.filename) }).toEqual({
      plantStatus: 400,
      aliceObjectSurvives: true,
    });
  });

  it("refuses a ../ filename, and deleting the item cannot reach outside the uploads folder", async () => {
    const c = canary("traversal-create");
    const plant = await createGuitar(mallory, [{ filename: c.rel, path: `/uploads/${c.rel}`, original_name: "x.jpg" }]);
    if (plant.status === 201) await deleteGuitar(mallory, plant.json.id);

    expect({ plantStatus: plant.status, canarySurvives: fs.existsSync(c.abs) }).toEqual({
      plantStatus: 400,
      canarySurvives: true,
    });
  });

  it("refuses a filename the server never issued, even one that looks like a key", async () => {
    const made = `${randomUUID()}.jpg`;
    const res = await createGuitar(mallory, [{ filename: made, path: `/uploads/${made}` }]);
    expect(res.status).toBe(400);
  });

  // ── AC 1: rows that are already in the database ────────────────────────────

  it.each(["item DELETE", "PATCH images_to_delete", "bulk delete"])(
    "a row already pointing at another user's key or at ../ is harmless on %s",
    async (via) => {
      const a = await upload(alice, `alice's photo for ${via}`);
      expect((await createGuitar(alice, [a])).status).toBe(201);
      const c = canary(`existing-${via.replace(/\W+/g, "-")}`);

      const own = await createGuitar(mallory, []);
      const id = own.json.id as string;
      const r1 = await plantRow("guitar_images", "guitar_item_id", id, a.filename);
      const r2 = await plantRow("guitar_images", "guitar_item_id", id, c.rel);

      as(mallory);
      if (via === "item DELETE") {
        expect((await deleteGuitar(mallory, id)).status).toBe(200);
      } else if (via === "PATCH images_to_delete") {
        const res = await guitar.PATCH(
          jsonReq("PATCH", `/api/guitars/${id}`, { images_to_delete: [r1, r2] }),
          params({ id }),
        );
        expect(res.status).toBe(200);
      } else {
        const res = await guitarBulk(jsonReq("POST", "/api/guitars/bulk-action", { action: "delete", ids: [id] }));
        expect(res.status).toBe(200);
      }

      expect({ aliceFileSurvives: onDisk(a.filename), canarySurvives: fs.existsSync(c.abs) }).toEqual({
        aliceFileSurvives: true,
        canarySurvives: true,
      });
    },
  );

  it("the old per-image DELETE route refuses a non-owner and never follows ../", async () => {
    const a = await upload(alice, "alice's car photo");
    as(alice);
    const car = await read(
      await autos.POST(jsonReq("POST", "/api/automobiles", { category: "collection", brand: "VLT67", model: "Car", image_paths: [a] })),
    );
    expect(car.status).toBe(201);
    const aliceImageId = car.json.images[0].id as string;

    as(mallory);
    const cross = await legacyAutoImageDELETE(
      jsonReq("DELETE", `/api/automobiles/${car.json.id}/images/${aliceImageId}`),
      params({ id: car.json.id as string, imageId: aliceImageId }),
    );
    const aliceRow = await queryOne(`SELECT id FROM auto_images WHERE id = $1`, [aliceImageId]);

    // Mallory's own car, with a ../ row already in the table.
    const c = canary("legacy-route");
    const mine = await read(await autos.POST(jsonReq("POST", "/api/automobiles", { category: "collection", brand: "VLT67", model: "Mine" })));
    const planted = await plantRow("auto_images", "auto_id", mine.json.id, c.rel);
    as(mallory);
    await legacyAutoImageDELETE(
      jsonReq("DELETE", `/api/automobiles/${mine.json.id}/images/${planted}`),
      params({ id: mine.json.id as string, imageId: planted }),
    );

    expect({
      crossUserStatus: cross.status,
      aliceRowSurvives: aliceRow !== null,
      aliceFileSurvives: onDisk(a.filename),
      canarySurvives: fs.existsSync(c.abs),
    }).toEqual({ crossUserStatus: 404, aliceRowSurvives: true, aliceFileSurvives: true, canarySurvives: true });
  });

  // ── AC 2: moderation ───────────────────────────────────────────────────────

  it("a client claiming clean for a flagged upload does not take effect (POST and PATCH)", async () => {
    state.verdict = { status: "flagged", nsfw_score: 0.7, categories: [{ className: "Sexy", probability: 0.7 }], hardBlocked: false };
    const m1 = await upload(mallory, "flagged one");
    const m2 = await upload(mallory, "flagged two");
    expect(m1.moderation_status).toBe("flagged");

    const claim = { moderation_status: "clean", nsfw_score: 0, nsfw_categories: [] };
    const created = await createGuitar(mallory, [{ ...m1, ...claim }]);
    expect(created.status).toBe(201);
    as(mallory);
    const patched = await guitar.PATCH(
      jsonReq("PATCH", `/api/guitars/${created.json.id}`, { image_paths: [{ ...m2, ...claim }] }),
      params({ id: created.json.id }),
    );
    expect(patched.status).toBe(200);

    const rows = await query<{ moderation_status: string; nsfw_score: string | null }>(
      `SELECT moderation_status, nsfw_score FROM guitar_images WHERE guitar_item_id = $1 ORDER BY sort_order`,
      [created.json.id],
    );
    expect(rows.map((r) => [r.moderation_status, r.nsfw_score === null ? null : Number(r.nsfw_score)])).toEqual([
      ["flagged", 0.7],
      ["flagged", 0.7],
    ]);
  });

  it("an upload attached without moderation fields still carries the server's verdict", async () => {
    state.verdict = { status: "flagged", nsfw_score: 0.66, categories: [{ className: "Sexy", probability: 0.66 }], hardBlocked: false };
    const m = await upload(mallory, "flagged, fields stripped");
    const created = await createGuitar(mallory, [{ filename: m.filename, path: m.path, original_name: m.original_name }]);
    expect(created.status).toBe(201);
    const row = await queryOne<{ moderation_status: string }>(
      `SELECT moderation_status FROM guitar_images WHERE guitar_item_id = $1`,
      [created.json.id],
    );
    expect(row?.moderation_status).toBe("flagged");
  });

  // ── the JSON import / export doors ────────────────────────────────────────

  it("import cannot overwrite another user's object, write outside uploads, plant a key, or assert a verdict", async () => {
    const a = await upload(alice, "alice's original bytes");
    expect((await createGuitar(alice, [a])).status).toBe(201);
    const outside = path.join(PUBLIC_DIR, `vlt67-${RUN}-import-written.txt`);
    createdFiles.add(outside);
    const evil = Buffer.from("mallory's replacement bytes").toString("base64");

    as(mallory);
    const res = await read(
      await importPOST(
        jsonReq("POST", "/api/data/import", {
          version: "1.3",
          collections: {
            guitars: [
              {
                ...guitarBody({ model: "Imported" }),
                images: [
                  { filename: a.filename, path: a.path, mime_type: "image/jpeg", data_base64: evil, moderation_status: "approved" },
                  { filename: `../${path.basename(outside)}`, path: "/uploads/x", mime_type: "image/jpeg", data_base64: evil },
                  { filename: a.filename, path: a.path, mime_type: "image/jpeg", moderation_status: "clean" },
                ],
              },
            ],
          },
        }),
      ),
    );
    expect(res.status).toBe(200);
    const imported = await query<{ filename: string; moderation_status: string }>(
      `SELECT img.filename, img.moderation_status
         FROM guitar_images img JOIN guitar_items g ON g.id = img.guitar_item_id
        WHERE g.user_id = $1 AND g.model = 'Imported'`,
      [mallory],
    );
    for (const r of imported) createdFiles.add(path.join(UPLOADS_DIR, r.filename));

    expect({
      aliceBytesUnchanged: fs.readFileSync(path.join(UPLOADS_DIR, a.filename), "utf8") === "alice's original bytes",
      wroteOutsideUploads: fs.existsSync(outside),
      malloryRowsUsingAliceKey: imported.filter((r) => r.filename === a.filename).length,
      malloryRowsWithAssertedVerdict: imported.filter((r) => r.moderation_status !== "unreviewed").length,
    }).toEqual({
      aliceBytesUnchanged: true,
      wroteOutsideUploads: false,
      malloryRowsUsingAliceKey: 0,
      malloryRowsWithAssertedVerdict: 0,
    });
  });

  it("export does not hand back the bytes of a key the exporter does not own, or of a ../ path", async () => {
    const a = await upload(alice, "alice's private bytes");
    expect((await createGuitar(alice, [a])).status).toBe(201);
    const secret = canary("export-secret", "server-side secret");
    const own = await createGuitar(mallory, []);
    await plantRow("guitar_images", "guitar_item_id", own.json.id, a.filename);
    await plantRow("guitar_images", "guitar_item_id", own.json.id, secret.rel);

    as(mallory);
    const res = await read(
      await exportPOST(jsonReq("POST", "/api/data/export", { collections: ["guitars"], include_image_data: true })),
    );
    expect(res.status).toBe(200);
    const leaked = (res.json.collections.guitars as { images: { data_base64?: string }[] }[])
      .flatMap((g) => g.images)
      .map((i) => (i.data_base64 ? Buffer.from(i.data_base64, "base64").toString("utf8") : null))
      .filter((s) => s === "alice's private bytes" || s === "server-side secret");
    expect(leaked).toEqual([]);
  });

  it("the serve route only presigns plain upload keys, not other objects in the bucket", async () => {
    state.r2 = true;
    const a = await upload(alice, "served");
    const ok = await serveGET(jsonReq("GET", `/api/uploads/${a.filename}`), params({ path: [a.filename] }));
    const paperwork = await serveGET(
      jsonReq("GET", `/api/uploads/paperwork/${alice}/insurance/x.pdf`),
      params({ path: ["paperwork", alice, "insurance", "x.pdf"] }),
    );
    expect({ plainKey: ok.status, otherObject: paperwork.status }).toEqual({ plainKey: 302, otherObject: 404 });
  });

  // ── existing data: migration 027's ownership backfill ──────────────────────

  it("the backfill owns a key used by one user's rows and leaves a key two users' rows share unowned", async () => {
    // Rows as they exist in production before 027: keys in the image tables,
    // nothing in the ledger.
    const soleKey = `${randomUUID()}.jpg`;
    const sharedKey = `${randomUUID()}.jpg`;
    for (const k of [soleKey, sharedKey]) {
      fs.writeFileSync(path.join(UPLOADS_DIR, k), `legacy ${k}`);
      createdFiles.add(path.join(UPLOADS_DIR, k));
    }
    const aliceItem = (await createGuitar(alice, [])).json.id as string;
    const malloryItem = (await createGuitar(mallory, [])).json.id as string;
    await plantRow("guitar_images", "guitar_item_id", aliceItem, soleKey);
    await plantRow("guitar_images", "guitar_item_id", aliceItem, sharedKey);
    await plantRow("guitar_images", "guitar_item_id", malloryItem, sharedKey);

    const migration = fs.readFileSync(path.join(process.cwd(), "db", "migrations", "027_uploads_ledger.sql"), "utf8");
    const backfill = migration.slice(migration.indexOf("INSERT INTO uploads"));
    await query(backfill);

    const owners = await query<{ key: string; user_id: string; origin: string }>(
      `SELECT key, user_id, origin FROM uploads WHERE key = ANY($1::text[])`,
      [[soleKey, sharedKey]],
    );
    expect(owners).toEqual([{ key: soleKey, user_id: alice, origin: "backfill" }]);

    // Mallory deleting her item leaves the shared object; Alice deleting hers
    // removes the object only she used, and still leaves the shared one.
    await deleteGuitar(mallory, malloryItem);
    await deleteGuitar(alice, aliceItem);
    expect({ sole: onDisk(soleKey), shared: onDisk(sharedKey) }).toEqual({ sole: false, shared: true });
  });

  // ── controls: what a real client does must keep working ───────────────────

  it("control: an owner's own upload, attach, PATCH-remove and delete still clean up their files", async () => {
    const a1 = await upload(alice, "keep then remove");
    const a2 = await upload(alice, "removed by PATCH");
    const created = await createGuitar(alice, [a1, a2]);
    expect(created.status).toBe(201);
    const ids = (created.json.images as { id: string; filename: string }[]).reduce<Record<string, string>>(
      (m, i) => ({ ...m, [i.filename]: i.id }),
      {},
    );

    as(alice);
    const patched = await guitar.PATCH(
      jsonReq("PATCH", `/api/guitars/${created.json.id}`, { images_to_delete: [ids[a2.filename]] }),
      params({ id: created.json.id }),
    );
    expect(patched.status).toBe(200);
    expect(onDisk(a2.filename)).toBe(false);
    expect(onDisk(a1.filename)).toBe(true);

    expect((await deleteGuitar(alice, created.json.id)).status).toBe(200);
    expect(onDisk(a1.filename)).toBe(false);
  });

  it("an import with image data stores it under a new key the importer owns, and can re-attach its own keys", async () => {
    const own = await upload(alice, "alice's backed-up bytes");
    as(alice);
    const res = await read(
      await importPOST(
        jsonReq("POST", "/api/data/import", {
          version: "1.3",
          collections: {
            guitars: [
              {
                ...guitarBody({ model: "Restored" }),
                images: [
                  { filename: `${randomUUID()}.png`, path: "/uploads/old.png", mime_type: "image/png",
                    data_base64: Buffer.from("restored bytes").toString("base64") },
                  { filename: own.filename, path: own.path, mime_type: "image/jpeg" },
                ],
              },
            ],
          },
        }),
      ),
    );
    expect(res.status).toBe(200);
    expect(res.json.results.guitars).toMatchObject({ imported: 1, images_imported: 2, image_bytes_written: 1, errors: [] });
    const rows = await query<{ filename: string; path: string; moderation_status: string }>(
      `SELECT img.filename, img.path, img.moderation_status
         FROM guitar_images img JOIN guitar_items g ON g.id = img.guitar_item_id
        WHERE g.user_id = $1 AND g.model = 'Restored' ORDER BY img.filename = $2`,
      [alice, own.filename],
    );
    for (const r of rows) createdFiles.add(path.join(UPLOADS_DIR, r.filename));
    const [restored, reattached] = rows;
    expect(restored.filename).toMatch(/^[0-9a-f-]{36}\.png$/);
    expect(restored.path).toBe(`/uploads/${restored.filename}`);
    expect(restored.moderation_status).toBe("unreviewed");
    expect(fs.readFileSync(path.join(UPLOADS_DIR, restored.filename), "utf8")).toBe("restored bytes");
    expect(reattached).toMatchObject({ filename: own.filename, moderation_status: "clean" });
  });

  it("control: the iOS UploadedImage shape attaches on create and PATCH", async () => {
    state.r2 = true;
    const a = await upload(alice, "ios one", "image-1.jpg");
    const b = await upload(alice, "ios two", "image-2.jpg");
    const ios = (f: Uploaded) => ({
      ...f,
      nsfw_categories: f.nsfw_categories.map((c) => ({ class_name: (c as { className: string }).className, probability: 0.9 })),
    });
    const created = await createGuitar(alice, [ios(a)]);
    expect(created.status).toBe(201);
    as(alice);
    const patched = await read(
      await guitar.PATCH(jsonReq("PATCH", `/api/guitars/${created.json.id}`, { image_paths: [ios(b)] }), params({ id: created.json.id })),
    );
    expect(patched.status).toBe(200);
    expect(patched.json.images.map((i: { path: string }) => i.path)).toEqual([a.path, b.path]);

    expect((await deleteGuitar(alice, created.json.id)).status).toBe(200);
    expect([state.objects.has(a.filename), state.objects.has(b.filename)]).toEqual([false, false]);
  });
});
