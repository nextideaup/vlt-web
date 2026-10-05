import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { r2IsConfigured, r2GetPresignedUrl, R2_PRESIGN_TTL_SECONDS } from "@/lib/storage/r2";
import { isUploadKey } from "@/lib/storage/uploads";

const UPLOADS_DIR = path.join(process.cwd(), "public", "uploads");

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  // Next 15: params is a Promise. Destructure under a different name to avoid
  // shadowing the imported `path` module.
  const { path: pathSegments } = await params;
  // Sanitise: take only basename of each segment to prevent traversal
  const safeName = pathSegments.map((s) => path.basename(s)).join("/");

  // R2 path: generate a short-lived presigned URL and 302-redirect to it.
  // The browser follows the redirect to r2.cloudflarestorage.com which
  // returns the image directly. Cache the *redirect* for a fraction of the
  // URL's TTL so the browser doesn't re-presign on every <img> miss.
  //
  // This route is public (middleware excludes /uploads and /api/uploads:
  // marketplace listings hand these URLs to eBay/Reverb), so it presigns only
  // a single plain upload key — the shape /api/upload mints — and never any
  // other object in the bucket, such as the insurance PDFs under
  // `paperwork/<user>/…` (VLT-67).
  if (r2IsConfigured()) {
    if (pathSegments.length !== 1 || !isUploadKey(safeName)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    try {
      const url = await r2GetPresignedUrl(safeName);
      const redirectCacheSeconds = Math.floor(R2_PRESIGN_TTL_SECONDS / 4);
      return NextResponse.redirect(url, {
        status: 302,
        headers: { "Cache-Control": `private, max-age=${redirectCacheSeconds}` },
      });
    } catch (err) {
      console.error("[uploads] R2 presign failed:", err);
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }

  // Local-disk fallback (dev). Double-check resolved path stays inside
  // UPLOADS_DIR to block traversal.
  const filePath = path.join(UPLOADS_DIR, safeName);
  if (!filePath.startsWith(UPLOADS_DIR + path.sep) && filePath !== UPLOADS_DIR) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME[ext] ?? "application/octet-stream";

    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
