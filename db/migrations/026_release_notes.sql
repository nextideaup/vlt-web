-- 026_release_notes.sql
-- In-app "What's New" release notes (STD-REL-001 / VLT-57). One row per
-- native release; the iOS app fetches the newest active row for its platform at
-- launch and shows it once per slug.
--
-- This table is NOT edited by hand. Its rows come from content/release-notes.json,
-- which scripts/sync-release-notes.js upserts by slug on every container boot
-- (Dockerfile CMD, right after scripts/migrate.js). Publishing or correcting
-- notes is a PR to that file — never SQL against production.
--
-- `position` is the entry's index in the content file. The endpoint serves the
-- highest position, so the LAST active entry in the file is what users see —
-- ordering follows the reviewed file, not the order rows happened to be inserted.

CREATE TABLE IF NOT EXISTS release_notes (
  id          SERIAL      PRIMARY KEY,
  slug        TEXT        NOT NULL UNIQUE,
  platform    TEXT        NOT NULL DEFAULT 'ios' CHECK (platform IN ('ios', 'android')),
  title       TEXT        NOT NULL,
  body        TEXT        NOT NULL,
  active      BOOLEAN     NOT NULL DEFAULT TRUE,
  position    INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- "Newest active entry for a platform" — the only read path.
CREATE INDEX IF NOT EXISTS idx_release_notes_platform_active
  ON release_notes (platform, position DESC)
  WHERE active;
