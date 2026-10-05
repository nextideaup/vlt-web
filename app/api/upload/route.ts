import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { classifyImage } from "@/lib/moderation/nsfw";
import {
  discardUploadObject,
  newUploadKey,
  recordUpload,
  uploadPathFor,
  writeUploadObject,
} from "@/lib/storage/uploads";
import { IMAGE_MAX_BYTES, IMAGE_MIME_TYPES } from "@/lib/attach/rules";

// Shared with the browser's picker/drop/paste rules (lib/attach/rules.ts,
// VLT-47) so a file the image editors accept is one this route stores.
const ALLOWED_MIME_TYPES = IMAGE_MIME_TYPES;
const MAX_FILE_SIZE = IMAGE_MAX_BYTES; // 10MB

export async function POST(request: NextRequest) {
  try {
    const session = await getApiSession(request);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const formData = await request.formData();
    const files = formData.getAll("files") as File[];

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
    }

    // R2 if configured (production / staging), local disk otherwise (dev) —
    // lib/storage/uploads.ts decides. The DB path format stays
    // `/uploads/<key>` in both modes; the serving route resolves it.

    const uploadedFiles: {
      filename: string;
      original_name: string;
      path: string;
      mime_type: string;
      size: number;
      // Tier-1 moderation metadata, for the client to show. The image row's
      // verdict is NOT taken from what the client sends back: it comes from
      // the `uploads` ledger row written below (VLT-67).
      moderation_status: "clean" | "flagged";
      nsfw_score: number;
      nsfw_categories: { className: string; probability: number }[];
    }[] = [];

    for (const file of files) {
      if (!ALLOWED_MIME_TYPES.includes(file.type)) {
        return NextResponse.json(
          { error: `File type ${file.type} is not allowed` },
          { status: 400 }
        );
      }

      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: `File ${file.name} exceeds maximum size of 10MB` },
          { status: 400 }
        );
      }

      // The key is minted here, extension from the accepted MIME type — never
      // from the client's file name (VLT-67).
      const filename = newUploadKey(file.type);
      const buffer = Buffer.from(await file.arrayBuffer());

      // Tier-1 content moderation. Classify BEFORE writing to storage so a
      // hard-block leaves no orphan object in R2. The classifier fails open
      // (returns 'flagged' on error) so transient model issues don't break
      // uploads — they just over-flag for the upcoming admin review queue.
      const verdict = await classifyImage(buffer);
      if (verdict.hardBlocked) {
        return NextResponse.json(
          {
            error:
              "This image was rejected by our content filter. If you believe this is a mistake, please contact support.",
          },
          { status: 400 }
        );
      }

      // verdict.status is 'clean' | 'flagged' here (hardBlocked already
      // returned above), so the narrowed type matches the DB column's
      // CHECK constraint subset.
      const moderation_status = verdict.status as "clean" | "flagged";

      await writeUploadObject(filename, buffer, file.type);
      // Record the key against this user, with the server's verdict. Only a
      // key in this ledger, owned by the caller, can later be attached to an
      // item (lib/collection-handler.ts) or deleted with one.
      try {
        await recordUpload({
          key: filename,
          userId: session.user.id,
          origin: "upload",
          originalName: file.name,
          mimeType: file.type,
          size: file.size,
          moderation: { moderation_status, nsfw_score: verdict.nsfw_score, nsfw_categories: verdict.categories },
        });
      } catch (err) {
        // No ledger row means no owner: remove the object rather than leave
        // one nobody can attach or delete.
        await discardUploadObject(filename);
        throw err;
      }

      uploadedFiles.push({
        filename,
        original_name: file.name,
        path: uploadPathFor(filename),
        mime_type: file.type,
        size: file.size,
        moderation_status,
        nsfw_score: verdict.nsfw_score,
        nsfw_categories: verdict.categories,
      });
    }

    return NextResponse.json({ files: uploadedFiles }, { status: 201 });
  } catch (error) {
    console.error("POST /api/upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload files" },
      { status: 500 }
    );
  }
}
