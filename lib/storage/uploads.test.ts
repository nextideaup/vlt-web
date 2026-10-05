import path from "node:path";

import { describe, expect, it } from "vitest";

import { extensionForMime, isUploadKey, localUploadFile, newUploadKey, uploadPathFor } from "@/lib/storage/uploads";

// VLT-67: the one definition of "a plain upload key" that attach, serve,
// export and delete all go through.

describe("isUploadKey", () => {
  it("accepts the keys /api/upload mints, including legacy extensions", () => {
    expect(isUploadKey("0b9c2d3e-1111-4222-8333-944455556666.jpg")).toBe(true);
    expect(isUploadKey("0b9c2d3e-1111-4222-8333-944455556666.img_1234")).toBe(true);
    expect(isUploadKey(newUploadKey("image/png"))).toBe(true);
  });

  it("refuses traversal, nesting, other objects in the bucket and non-strings", () => {
    for (const bad of [
      "../secret.txt",
      "..",
      "0b9c2d3e-1111-4222-8333-944455556666./x",
      "0b9c2d3e-1111-4222-8333-944455556666.a\\b",
      "0b9c2d3e-1111-4222-8333-944455556666.a\nb",
      "paperwork/0b9c2d3e-1111-4222-8333-944455556666/insurance/x.pdf",
      "/uploads/0b9c2d3e-1111-4222-8333-944455556666.jpg",
      "0B9C2D3E-1111-4222-8333-944455556666.jpg",
      "photo.jpg",
      "",
      null,
      42,
    ]) {
      expect(isUploadKey(bad), JSON.stringify(bad)).toBe(false);
    }
  });
});

describe("key minting and local paths", () => {
  it("takes the extension from the accepted MIME type, not a file name", () => {
    expect(extensionForMime("image/jpeg")).toBe("jpg");
    expect(extensionForMime("IMAGE/PNG")).toBe("png");
    expect(extensionForMime("text/html")).toBeNull();
    expect(newUploadKey("image/webp")).toMatch(/^[0-9a-f-]{36}\.webp$/);
  });

  it("resolves a key inside public/uploads and nothing else", () => {
    const key = "0b9c2d3e-1111-4222-8333-944455556666.jpg";
    expect(localUploadFile(key)).toBe(path.join(process.cwd(), "public", "uploads", key));
    expect(localUploadFile("../x.txt")).toBeNull();
    expect(uploadPathFor(key)).toBe(`/uploads/${key}`);
  });
});
