-- ── VLT-67: the server's record of the image objects it stores ─────────────
--
-- Until now an image row's storage key (`filename`), `path` and moderation
-- verdict all came from the request body. A client could point its own image
-- row at another user's object and delete it by deleting its own item, point
-- it at `../` outside the uploads folder, or mark a flagged upload `clean`.
--
-- `uploads` is the ledger that replaces that trust: one row per object the
-- server stored, keyed by the key the server minted, owned by the user it was
-- minted for, carrying the Tier-1 verdict the server computed. lib/storage/
-- uploads.ts attaches, exports and deletes objects only through it.
--
--   origin 'upload'   — written by POST /api/upload, with the NSFW.js verdict
--   origin 'import'   — bytes re-stored by POST /api/data/import; no verdict
--                       (the imported rows land 'unreviewed')
--   origin 'backfill' — reconstructed below from image rows that existed
--                       before this migration; no verdict (we never recorded
--                       which verdicts the server, not a client, had set)

CREATE TABLE IF NOT EXISTS uploads (
  key               TEXT PRIMARY KEY,
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  origin            TEXT NOT NULL DEFAULT 'upload' CHECK (origin IN ('upload', 'import', 'backfill')),
  original_name     TEXT,
  mime_type         VARCHAR(100),
  size              INTEGER,
  moderation_status TEXT CHECK (moderation_status IN ('clean', 'flagged')),
  nsfw_score        NUMERIC(5, 4),
  nsfw_categories   JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_uploads_user_id ON uploads (user_id);

-- releaseUploads asks "does any image row still point at this key?" on every
-- delete.
CREATE INDEX IF NOT EXISTS idx_guitar_images_filename ON guitar_images (filename);
CREATE INDEX IF NOT EXISTS idx_watch_images_filename  ON watch_images (filename);
CREATE INDEX IF NOT EXISTS idx_auto_images_filename   ON auto_images (filename);
CREATE INDEX IF NOT EXISTS idx_iod_images_filename    ON iod_images (filename);

-- Backfill ownership for objects that are already attached, so deleting an
-- existing item still cleans up its own objects. Only keys that have the shape
-- /api/upload mints (lib/storage/uploads.ts UPLOAD_KEY_RE) and whose row path
-- is `/uploads/<key>` qualify, and only when every row pointing at the key
-- belongs to ONE user. A key two users' rows point at is exactly what a
-- planted row looks like; it gets no owner, so nobody's delete removes it.
INSERT INTO uploads (key, user_id, origin, created_at)
SELECT refs.filename, (array_agg(refs.user_id))[1], 'backfill', MIN(refs.created_at)
  FROM (
    SELECT img.filename, img.path, img.created_at, it.user_id
      FROM guitar_images img JOIN guitar_items it ON it.id = img.guitar_item_id
    UNION ALL
    SELECT img.filename, img.path, img.created_at, it.user_id
      FROM watch_images img JOIN watch_items it ON it.id = img.watch_item_id
    UNION ALL
    SELECT img.filename, img.path, img.created_at, it.user_id
      FROM auto_images img JOIN automobiles it ON it.id = img.auto_id
    UNION ALL
    SELECT img.filename, img.path, img.created_at, it.user_id
      FROM iod_images img JOIN items_of_distinction it ON it.id = img.iod_id
  ) refs
 WHERE refs.user_id IS NOT NULL
   AND refs.filename ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[^/\\[:cntrl:]]{1,64}$'
   AND refs.path = '/uploads/' || refs.filename
 GROUP BY refs.filename
HAVING COUNT(DISTINCT refs.user_id) = 1
ON CONFLICT (key) DO NOTHING;
