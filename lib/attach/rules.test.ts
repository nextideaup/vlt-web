import { describe, expect, it } from "vitest";

import {
  CSV_ATTACH_RULES,
  IMAGE_ATTACH_RULES,
  IMAGE_MAX_BYTES,
  describeRejections,
  matchesAccept,
  nameForPastedFile,
  planPaste,
  selectAttachFiles,
  type FileLike,
} from "./rules";

// VLT-69: VLT-47's attach rules, which every picker, drop and paste on the
// seven file surfaces runs through.

const file = (name: string, type: string, size = 1000): FileLike => ({ name, type, size });

describe("matchesAccept", () => {
  it("matches extensions case-insensitively, MIME tokens exactly and type/* by prefix", () => {
    expect(matchesAccept(file("Photo.JPG", ""), ".jpg")).toBe(true);
    expect(matchesAccept(file("a.png", "image/png"), "image/png")).toBe(true);
    expect(matchesAccept(file("a.png", "image/png"), "image/*")).toBe(true);
    expect(matchesAccept(file("a.pdf", "application/pdf"), "image/*")).toBe(false);
    expect(matchesAccept(file("a.csv", "text/plain"), ".csv,text/csv")).toBe(true);
  });

  it("an empty accept takes anything, as <input accept=\"\"> does", () => {
    expect(matchesAccept(file("x.bin", "application/octet-stream"), "")).toBe(true);
  });
});

describe("selectAttachFiles", () => {
  it("checks type before size, and keeps the order", () => {
    const big = file("big.png", "image/png", IMAGE_MAX_BYTES + 1);
    const pdf = file("doc.pdf", "application/pdf", IMAGE_MAX_BYTES + 1);
    const ok = file("ok.webp", "image/webp");
    const r = selectAttachFiles([big, pdf, ok], IMAGE_ATTACH_RULES);
    expect(r.accepted).toEqual([ok]);
    expect(r.rejected).toEqual([
      { file: big, reason: "size" },
      { file: pdf, reason: "type" },
    ]);
  });

  it("spends the count limit only on files that passed type and size", () => {
    const wrong = file("notes.txt", "text/plain");
    const first = file("a.csv", "text/csv");
    const second = file("b.csv", "text/csv");
    const r = selectAttachFiles([wrong, first, second], CSV_ATTACH_RULES);
    expect(r.accepted).toEqual([first]);
    expect(r.rejected.map((x) => x.reason)).toEqual(["type", "count"]);
  });
});

describe("describeRejections", () => {
  it("is null when nothing was refused", () => {
    expect(describeRejections([], IMAGE_ATTACH_RULES)).toBeNull();
  });

  it("names the file and the reason, in the surface's own words", () => {
    const text = describeRejections([{ file: file("doc.pdf", "application/pdf"), reason: "type" }], IMAGE_ATTACH_RULES);
    expect(text).toBe("doc.pdf wasn't added — only JPG, PNG, WebP or GIF images can be added here.");
    const size = describeRejections([{ file: file("big.png", "image/png"), reason: "size" }], IMAGE_ATTACH_RULES);
    expect(size).toBe("big.png wasn't added — it is larger than 10 MB.");
  });
});

describe("nameForPastedFile", () => {
  it("gives a nameless or extensionless clipboard file an extension from its MIME type", () => {
    expect(nameForPastedFile("", "image/png")).toBe("pasted.png");
    expect(nameForPastedFile("image", "image/jpeg")).toBe("image.jpg");
    expect(nameForPastedFile("shot.png", "image/jpeg")).toBe("shot.png");
    expect(nameForPastedFile("blob", "application/x-unknown")).toBe("blob");
  });
});

describe("planPaste", () => {
  const base = { rules: IMAGE_ATTACH_RULES, acceptsText: false };

  it("text in a focused field is the browser's own paste, even with a picture beside it", () => {
    expect(planPaste({ ...base, files: [file("cells.png", "image/png")], text: "a\tb", targetEditable: true })).toEqual({
      kind: "native",
    });
  });

  it("clipboard files outside a field go through the same rules as the picker", () => {
    const img = file("p.png", "image/png");
    expect(planPaste({ ...base, files: [img], text: "", targetEditable: false })).toEqual({
      kind: "files",
      accepted: [img],
      rejected: [],
    });
  });

  it("a text surface takes text pasted outside a field when no file was taken", () => {
    expect(planPaste({ files: [], text: "a,b\n1,2", targetEditable: false, rules: CSV_ATTACH_RULES, acceptsText: true })).toEqual({
      kind: "text",
      text: "a,b\n1,2",
    });
  });

  it("only refused files is a rejection, never a silent no-op", () => {
    const pdf = file("doc.pdf", "application/pdf");
    expect(planPaste({ ...base, files: [pdf], text: "", targetEditable: false })).toEqual({
      kind: "rejected",
      rejected: [{ file: pdf, reason: "type" }],
    });
  });
});
