#!/usr/bin/env node
// Sync content/release-notes.json -> the release_notes table (STD-REL-001 / VLT-57).
//
// Runs on every container boot from the Dockerfile CMD, right after
// scripts/migrate.js and before the server starts:
//
//   node scripts/migrate.js && node scripts/sync-release-notes.js && exec node server.js
//
// So publishing notes for a release is a PR that appends an entry to the
// content file: the row lands on staging and production when that deploy boots,
// with no SQL access and no admin endpoint. Never insert rows by hand.
//
// Semantics (ported from Tire Logs' scripts/sync-whats-new.mjs):
//   - Upsert by slug, in one transaction. Editing an existing entry fixes its
//     copy without re-showing it; a new slug shows the sheet once more.
//   - `position` = the entry's index in the file; the endpoint serves the
//     highest active position, so the file's order decides what is "newest".
//   - Rows that are not in the file are NOT deleted (as in Tire Logs). They are
//     logged as a warning, because a row with no file entry is exactly what
//     STD-REL-001 calls a finding. Retract an entry with `"active": false`.
//   - FAIL-SOFT: release notes must never keep the app from booting. Any
//     failure logs `[release-notes-sync]` lines and exits 0; the endpoint keeps
//     serving whatever rows it already had.

const path = require("path");
const { Pool } = require("pg");
const { loadReleaseNotes, validateReleaseNotes } = require("./release-notes-content");

try {
  require("dotenv").config({ path: path.join(__dirname, "../.env.local") });
} catch {
  // not installed — fine in production
}

async function sync() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("[release-notes-sync] DATABASE_URL is not set — skipping");
    return;
  }

  const entries = loadReleaseNotes();
  const problems = validateReleaseNotes(entries);
  if (problems.length > 0) {
    console.error("[release-notes-sync] content/release-notes.json is invalid — skipping:");
    for (const p of problems) console.error(`  - ${p}`);
    return;
  }

  const ssl = process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined;
  const pool = new Pool({ connectionString, ssl, max: 1 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const [position, e] of entries.entries()) {
      await client.query(
        `INSERT INTO release_notes (slug, platform, title, body, active, position)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (slug) DO UPDATE SET
           platform   = EXCLUDED.platform,
           title      = EXCLUDED.title,
           body       = EXCLUDED.body,
           active     = EXCLUDED.active,
           position   = EXCLUDED.position,
           updated_at = CASE
             WHEN (release_notes.platform, release_notes.title, release_notes.body,
                   release_notes.active, release_notes.position)
                  IS DISTINCT FROM
                  (EXCLUDED.platform, EXCLUDED.title, EXCLUDED.body,
                   EXCLUDED.active, EXCLUDED.position)
             THEN NOW() ELSE release_notes.updated_at END`,
        [e.slug, e.platform, e.title, e.body, e.active, position]
      );
    }
    await client.query("COMMIT");

    const slugs = entries.map((e) => e.slug);
    const strays = await client.query(
      "SELECT slug FROM release_notes WHERE NOT (slug = ANY($1::text[])) ORDER BY slug",
      [slugs]
    );
    console.log(
      `[release-notes-sync] upserted ${entries.length} entr${entries.length === 1 ? "y" : "ies"}; ` +
        `newest: ${slugs[slugs.length - 1]}`
    );
    if (strays.rows.length > 0) {
      console.warn(
        `[release-notes-sync] WARNING: rows with no entry in content/release-notes.json: ` +
          strays.rows.map((r) => r.slug).join(", ")
      );
    }
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

sync()
  .catch((err) => {
    console.error(
      `[release-notes-sync] failed (${err && err.message ? err.message : err}${err && err.code ? `, code ${err.code}` : ""}) — continuing boot`
    );
  })
  .finally(() => process.exit(0));
