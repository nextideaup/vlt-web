import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { query, queryOne } from "@/lib/db";
import { IoDImage } from "@/lib/types";
import path from "path";
import fs from "fs/promises";
import { v4 as uuidv4 } from "uuid";

export const dynamic = "force-dynamic";

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getApiSession(request);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    // Only the item's owner sees its image rows (VLT-67: they carry the
    // storage keys).
    const images = await query<IoDImage>(
      `SELECT img.* FROM iod_images img
         JOIN items_of_distinction it ON it.id = img.iod_id
        WHERE img.iod_id = $1 AND it.user_id = $2
        ORDER BY img.sort_order ASC, img.is_primary DESC, img.created_at ASC`,
      [id, session.user.id]
    );
    return NextResponse.json(images);
  } catch (error) {
    console.error("GET /api/iod/[id]/images error:", error);
    return NextResponse.json({ error: "Failed to fetch images" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getApiSession(request);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;

    // Verify the parent exists and belongs to the caller (VLT-67).
    const parent = await queryOne<{ id: string }>(
      `SELECT id FROM items_of_distinction WHERE id = $1 AND user_id = $2`,
      [id, session.user.id]
    );
    if (!parent) {
      return NextResponse.json({ error: "Item of distinction not found" }, { status: 404 });
    }

    const formData = await request.formData();
    const files = formData.getAll("files") as File[];

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
    }

    const uploadsDir = path.join(process.cwd(), "public", "uploads", "iod", id);
    await fs.mkdir(uploadsDir, { recursive: true });

    const countRow = await queryOne<{ count: string; max_sort: string | null }>(
      `SELECT COUNT(*) as count, MAX(sort_order) as max_sort FROM iod_images WHERE iod_id = $1`,
      [id]
    );
    const existingCount = parseInt(countRow?.count ?? "0");
    let sortOffset = countRow?.max_sort != null ? parseInt(countRow.max_sort) + 1 : 0;

    const savedImages: IoDImage[] = [];

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
      const filePath = path.join(uploadsDir, filename);

      const buffer = Buffer.from(await file.arrayBuffer());
      await fs.writeFile(filePath, buffer);

      const relativePath = `/uploads/iod/${id}/${filename}`;
      const isPrimary = existingCount === 0 && sortOffset === 0;

      const img = await queryOne<IoDImage>(
        `INSERT INTO iod_images (iod_id, filename, original_name, path, mime_type, size, is_primary, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [id, filename, file.name, relativePath, file.type, file.size, isPrimary, sortOffset]
      );

      if (img) savedImages.push(img);
      sortOffset++;
    }

    return NextResponse.json({ images: savedImages }, { status: 201 });
  } catch (error) {
    console.error("POST /api/iod/[id]/images error:", error);
    return NextResponse.json({ error: "Failed to upload images" }, { status: 500 });
  }
}
