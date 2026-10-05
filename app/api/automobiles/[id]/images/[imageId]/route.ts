import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { queryOne } from "@/lib/db";
import { releaseUploads } from "@/lib/storage/uploads";
import { AutoImage } from "@/lib/types";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; imageId: string }> }
) {
  try {
    const session = await getApiSession(request);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id, imageId } = await params;
    if (!UUID_RE.test(id) || !UUID_RE.test(imageId)) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }

    // The row goes only if its item belongs to the caller (VLT-67).
    const image = await queryOne<AutoImage>(
      `DELETE FROM auto_images img
         USING automobiles it
        WHERE img.id = $1 AND img.auto_id = $2 AND it.id = img.auto_id AND it.user_id = $3
        RETURNING img.*`,
      [imageId, id, session.user.id]
    );

    if (!image) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }

    // The storage object goes only if it is a plain upload key the caller
    // uploaded and nothing else points at it — never a path built from the
    // row's filename (VLT-67).
    await releaseUploads(session.user.id, [image.filename]);

    return NextResponse.json({ success: true, deleted: image });
  } catch (error) {
    console.error("DELETE /api/automobiles/[id]/images/[imageId] error:", error);
    return NextResponse.json({ error: "Failed to delete image" }, { status: 500 });
  }
}
