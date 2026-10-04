import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import { v4 as uuidv4 } from "uuid";
import { getApiSession } from "@/lib/api-auth";
import { r2IsConfigured, r2PutObject } from "@/lib/storage/r2";
import { classifyImage } from "@/lib/moderation/nsfw";
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

    // R2 if configured (production / staging), local disk otherwise (dev).
    // The DB path format stays `/uploads/<filename>.ext` in both modes — the
    // serving route resolves it: redirect to a presigned R2 URL, or stream
    // from disk, depending on env.
    const useR2 = r2IsConfigured();
    const uploadsDir = path.join(process.cwd(), "public", "uploads");
    if (!useR2) {
      await fs.mkdir(uploadsDir, { recursive: true });
    }

    const uploadedFiles: {
      filename: string;
      original_name: string;
      path: string;
      mime_type: string;
      size: number;
      // Tier-1 moderation metadata. The caller passes these straight through
      // to the *_images INSERT (see insertImagePaths in lib/collection-handler.ts).
      // 'unreviewed' would only appear here if classification failed entirely
      // — the moderation lib fails open to 'flagged', but a stricter caller
      // could choose to treat null verdicts as 'unreviewed'.
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

      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const filename = `${uuidv4()}.${ext}`;
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

      if (useR2) {
        await r2PutObject(filename, buffer, file.type);
      } else {
        await fs.writeFile(path.join(uploadsDir, filename), buffer);
      }

      uploadedFiles.push({
        filename,
        original_name: file.name,
        path: `/uploads/${filename}`,
        mime_type: file.type,
        size: file.size,
        // verdict.status is 'clean' | 'flagged' here (hardBlocked already
        // returned above), so the narrowed type matches the DB column's
        // CHECK constraint subset.
        moderation_status: verdict.status as "clean" | "flagged",
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
