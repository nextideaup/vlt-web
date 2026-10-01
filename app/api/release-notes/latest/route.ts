import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { getApiSession } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

const PLATFORMS = ["ios", "android"] as const;

// GET /api/release-notes/latest?platform=ios
//   Header: Authorization: Bearer <access>     (or NextAuth session cookie)
//   -> 200 { slug, title, body }   the newest active entry for the platform
//   -> 204                         no active entry for the platform
//   -> 400                         unknown platform
//
// The launch-time "What's New" fetch (STD-REL-001 / VLT-57). The client shows
// the entry once per slug and stores the slug on dismiss. Rows are written only
// by scripts/sync-release-notes.js from content/release-notes.json on deploy;
// "newest" is the highest `position`, i.e. the last active entry in that file.
//
// Global, non-sensitive content, but auth-gated like Tire Logs' /whats-new:
// the iOS app makes this call from a signed-in session, and an open route
// would be one more unauthenticated surface for no benefit. The middleware
// already passes Bearer requests through to this handler.

export async function GET(req: NextRequest) {
  const session = await getApiSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const platform = (req.nextUrl.searchParams.get("platform") ?? "ios").trim().toLowerCase();
  if (!(PLATFORMS as readonly string[]).includes(platform)) {
    return NextResponse.json({ error: `platform must be one of ${PLATFORMS.join(", ")}` }, { status: 400 });
  }

  const note = await queryOne<{ slug: string; title: string; body: string }>(
    `SELECT slug, title, body
       FROM release_notes
      WHERE platform = $1 AND active
      ORDER BY position DESC, id DESC
      LIMIT 1`,
    [platform]
  );

  if (!note) return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });

  return NextResponse.json(
    { slug: note.slug, title: note.title, body: note.body },
    { headers: { "Cache-Control": "no-store" } }
  );
}
