// The one answer to "may the DB-backed tests touch this database?" (VLT-67/68).
//
// Yes for a local or LAN Postgres, and for the per-run database the NIU CI
// runner creates (`ci_<sha>_<suite>_<attempt>`, the shape its _SAFE_DB_NAME
// guard enforces) on its own Railway-hosted throwaway server. No for any other
// Railway database, and never under NODE_ENV=production — whatever
// DATABASE_URL says.
export function isThrowawayDatabase(url: string | undefined): boolean {
  if (!url || process.env.NODE_ENV === "production") return false;
  try {
    const u = new URL(url);
    const database = decodeURIComponent(u.pathname.replace(/^\//, ""));
    if (/^ci_[0-9a-f]{6,40}(?:_[a-z0-9_]{1,24})?_\d{1,4}$/.test(database)) return true;
    return !/(\.railway\.internal|\.rlwy\.net|\.railway\.app)$/i.test(u.hostname);
  } catch {
    return false;
  }
}
