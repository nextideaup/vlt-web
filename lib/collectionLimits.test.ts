// VLT-68: bad input the collection API used to answer with a 500 — a price over
// its NUMERIC(p,2) column, an image original_name or a text field over its
// VARCHAR column, a non-UUID in images_to_delete / image_order / the bulk ids,
// and a null bulk body — is a 400 naming the field, refused before any write.
// The column limits live on each module's CollectionConfig; the first test
// holds them to the live schema so a migration cannot drift from them.
//
// Needs DATABASE_URL (the NIU `ci` suite provides a fresh one per run), guarded
// by lib/testing/throwawayDb.ts.

import { randomUUID } from "node:crypto";

import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock("@/lib/api-auth", () => ({
  getApiSession: async () =>
    state.userId ? { user: { id: state.userId, email: "t@example.test", name: null } } : null,
}));
vi.mock("@/lib/storage/r2", () => ({
  r2IsConfigured: () => false,
  r2PutObject: async () => undefined,
  r2GetObject: async () => Buffer.alloc(0),
  r2DeleteObjects: async () => undefined,
  r2GetPresignedUrl: async () => "",
  R2_PRESIGN_TTL_SECONDS: 3600,
}));

import { makeBulkActionHandler, makeItemHandlers, makeListHandlers } from "@/lib/collection-handler";
import { autoConfig } from "@/lib/collections/auto";
import { guitarConfig } from "@/lib/collections/guitar";
import { iodConfig } from "@/lib/collections/iod";
import type { CollectionConfig } from "@/lib/collections/types";
import { watchConfig } from "@/lib/collections/watch";
import { query, queryOne } from "@/lib/db";
import { isThrowawayDatabase } from "@/lib/testing/throwawayDb";

const HAS_DB = isThrowawayDatabase(process.env.DATABASE_URL);
const RUN = randomUUID().slice(0, 8);
const CONFIGS: CollectionConfig[] = [guitarConfig, watchConfig, autoConfig, iodConfig];

function jsonReq(method: string, url: string, body?: unknown, raw?: string): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { "content-type": "application/json" },
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
}
const params = <T extends object>(p: T) => ({ params: Promise.resolve(p) });
async function read(res: Response): Promise<{ status: number; json: Record<string, unknown> }> {
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

describe.skipIf(!HAS_DB)("VLT-68: column limits and id lists are 400s, before any write", () => {
  let user: string;

  beforeAll(async () => {
    // Migrations: applied once by vitest.globalSetup.ts.
    const row = await queryOne<{ id: string }>(`INSERT INTO users (email) VALUES ($1) RETURNING id`, [
      `vlt68-${RUN}@example.test`,
    ]);
    user = row!.id;
    state.userId = user;
  }, 60_000);

  afterAll(async () => {
    if (user) await query(`DELETE FROM users WHERE id = $1`, [user]);
    await globalThis._pgPool?.end();
    globalThis._pgPool = undefined;
  });

  it("every module's declared limits match the live columns, and every limited column declares one", async () => {
    const cols = await query<{
      table_name: string;
      column_name: string;
      data_type: string;
      character_maximum_length: number | null;
      numeric_precision: number | null;
      numeric_scale: number | null;
    }>(
      `SELECT table_name, column_name, data_type, character_maximum_length, numeric_precision, numeric_scale
         FROM information_schema.columns WHERE table_schema = current_schema()`,
    );
    const col = (t: string, c: string) => cols.find((x) => x.table_name === t && x.column_name === c);
    const drift: string[] = [];
    for (const c of CONFIGS) {
      for (const f of c.fields) {
        const db = col(c.table, f.name);
        if (!db) continue;
        if (db.data_type === "character varying" && f.maxLength !== (db.character_maximum_length ?? undefined)) {
          // condition is checked against its fixed list instead
          if (f.name !== "condition") drift.push(`${c.table}.${f.name}: maxLength ${f.maxLength} vs VARCHAR(${db.character_maximum_length})`);
        }
        if (db.data_type === "numeric" && (f.precision ?? null) !== db.numeric_precision) {
          drift.push(`${c.table}.${f.name}: precision ${f.precision} vs NUMERIC(${db.numeric_precision})`);
        }
        if (db.data_type === "numeric" && db.numeric_precision != null && (f.scale ?? null) !== db.numeric_scale) {
          drift.push(`${c.table}.${f.name}: scale ${f.scale} vs NUMERIC(_,${db.numeric_scale})`);
        }
      }
      const name = col(c.imagesTable, "original_name");
      if (c.imageOriginalNameMaxLength !== name?.character_maximum_length) {
        drift.push(`${c.imagesTable}.original_name: ${c.imageOriginalNameMaxLength} vs VARCHAR(${name?.character_maximum_length})`);
      }
    }
    expect(drift).toEqual([]);
  });

  it.each(CONFIGS.map((c) => [c.moduleSlug, c] as const))(
    "%s: a price over its column, or text over its column, is a 400 and writes nothing",
    async (_slug, c) => {
      const list = makeListHandlers(c);
      const money = c.fields.find((f) => f.name === "purchase_price")!;
      const over = 10 ** (money.precision! - money.scale!);
      const max = (over - 10 ** -money.scale!).toFixed(money.scale!);
      const text = c.fields.find((f) => f.maxLength)!;
      const base = baseBody(c);
      const count = async () =>
        Number((await queryOne<{ n: string }>(`SELECT COUNT(*) AS n FROM ${c.table} WHERE user_id = $1`, [user]))!.n);

      const before = await count();
      const priceOver = await read(await list.POST(jsonReq("POST", "/x", { ...base, purchase_price: String(over) })));
      const textOver = await read(await list.POST(jsonReq("POST", "/x", { ...base, [text.name]: "x".repeat(text.maxLength! + 1) })));
      const after = await count();
      const atMax = await read(await list.POST(jsonReq("POST", "/x", { ...base, purchase_price: max })));

      expect({
        priceOver: [priceOver.status, String(priceOver.json.error).includes("purchase_price")],
        textOver: [textOver.status, String(textOver.json.error).includes(text.name)],
        written: after - before,
        atMax: [atMax.status, atMax.json.purchase_price],
      }).toEqual({ priceOver: [400, true], textOver: [400, true], written: 0, atMax: [201, max] });
    },
  );

  it("an image original_name over the images column is a 400 before the item is written (no orphan)", async () => {
    const list = makeListHandlers(guitarConfig);
    const key = `${randomUUID()}.jpg`;
    await query(`INSERT INTO uploads (key, user_id, origin, mime_type, size) VALUES ($1, $2, 'upload', 'image/jpeg', 1)`, [key, user]);
    const items = async () =>
      Number((await queryOne<{ n: string }>(`SELECT COUNT(*) AS n FROM guitar_items WHERE user_id = $1`, [user]))!.n);
    const before = await items();
    const res = await read(
      await list.POST(
        jsonReq("POST", "/x", { ...baseBody(guitarConfig), image_paths: [{ filename: key, path: `/uploads/${key}`, original_name: "a".repeat(256) }] }),
      ),
    );
    expect({ status: res.status, names: String(res.json.error).includes("original_name"), written: (await items()) - before }).toEqual({
      status: 400,
      names: true,
      written: 0,
    });
  });

  it("a non-UUID in images_to_delete or image_order is a 400 and the rest of the PATCH is not applied", async () => {
    const list = makeListHandlers(guitarConfig);
    const item = makeItemHandlers(guitarConfig);
    const created = await read(await list.POST(jsonReq("POST", "/x", { ...baseBody(guitarConfig), notes: "kept" })));
    const id = created.json.id as string;
    const results = [];
    for (const field of ["images_to_delete", "image_order"]) {
      const res = await read(await item.PATCH(jsonReq("PATCH", "/x", { notes: "must not persist", [field]: ["x"] }), params({ id })));
      results.push([field, res.status, String(res.json.error).includes(field)]);
    }
    const notes = (await queryOne<{ notes: string }>(`SELECT notes FROM guitar_items WHERE id = $1`, [id]))!.notes;
    expect({ results, notes }).toEqual({
      results: [
        ["images_to_delete", 400, true],
        ["image_order", 400, true],
      ],
      notes: "kept",
    });
  });

  it("the bulk action refuses a non-UUID id and a null body with a 400, and a real id still works", async () => {
    const list = makeListHandlers(guitarConfig);
    const bulk = makeBulkActionHandler(guitarConfig);
    const id = (await read(await list.POST(jsonReq("POST", "/x", baseBody(guitarConfig))))).json.id as string;
    const statuses: Record<string, number> = {};
    for (const action of ["archive", "delete", "set_insure"]) {
      statuses[action] = (await bulk(jsonReq("POST", "/x", { action, ids: [id, "x"], value: true }))).status;
    }
    statuses.nullBody = (await bulk(jsonReq("POST", "/x", undefined, "null"))).status;
    const survived = (await queryOne(`SELECT id FROM guitar_items WHERE id = $1 AND archived_at IS NULL`, [id])) !== null;
    const real = await read(await bulk(jsonReq("POST", "/x", { action: "archive", ids: [id] })));
    expect({ statuses, survived, real: [real.status, real.json.affected] }).toEqual({
      statuses: { archive: 400, delete: 400, set_insure: 400, nullBody: 400 },
      survived: true,
      real: [200, 1],
    });
  });
});

function baseBody(c: CollectionConfig): Record<string, unknown> {
  switch (c.moduleSlug) {
    case "guitars":
      return { category: "electric-guitars", brand: `VLT68-${RUN}`, model: "T", condition: "Good" };
    case "watches":
      return { category: "luxury-watches", brand: `VLT68-${RUN}`, model: "T", condition: "Good" };
    case "automobiles":
      return { category: "collection", brand: `VLT68-${RUN}`, model: "T" };
    default:
      return { category: "collectibles", short_description: `VLT68-${RUN}` };
  }
}
