// VLT-47 (STD-FRM-002): proves the pure attach rules that every file surface
// runs picker, drop AND paste through (lib/attach/rules.ts).
//
// The repo has no test framework, so this is a plain node script:
//
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/check-attach-rules.mjs
//
// It imports the .ts module directly, so it needs a Node with built-in type
// stripping (22.18+ / 23.6+); the flag only silences Node's notice that it
// re-parsed that file as an ES module. It is NOT part of `npm run build` — the
// production image runs Node 20, which cannot load .ts files.
//
// Exit code 0 when every case passes, 1 otherwise. Prints a total so a run
// that executed nothing is visible as such.

import assert from "node:assert/strict";
import {
  CSV_ATTACH_RULES,
  IMAGE_ATTACH_RULES,
  IMAGE_MAX_BYTES,
  IMAGE_MIME_TYPES,
  JSON_ATTACH_RULES,
  describeRejections,
  matchesAccept,
  nameForPastedFile,
  planPaste,
  selectAttachFiles,
} from "../lib/attach/rules.ts";

const MB = 1024 * 1024;
const file = (name, type, size = 1000) => ({ name, type, size });

const cases = [];
const test = (name, fn) => cases.push({ name, fn });

// ── Type: the accept string is read the way <input accept> reads it ────────
test("image rules accept a PNG", () => {
  const r = selectAttachFiles([file("shot.png", "image/png")], IMAGE_ATTACH_RULES);
  assert.equal(r.accepted.length, 1);
  assert.equal(r.rejected.length, 0);
});
test("image rules reject a PDF as type", () => {
  const r = selectAttachFiles([file("receipt.pdf", "application/pdf")], IMAGE_ATTACH_RULES);
  assert.equal(r.accepted.length, 0);
  assert.deepEqual(r.rejected.map((x) => x.reason), ["type"]);
});
test("image rules reject HEIC (the upload route does not allow it)", () => {
  const r = selectAttachFiles([file("IMG_1.heic", "image/heic")], IMAGE_ATTACH_RULES);
  assert.deepEqual(r.rejected.map((x) => x.reason), ["type"]);
});
test("image accept list is exactly the upload route's MIME allowlist", () => {
  assert.deepEqual(IMAGE_ATTACH_RULES.accept.split(","), IMAGE_MIME_TYPES);
  assert.equal(IMAGE_ATTACH_RULES.maxBytes, IMAGE_MAX_BYTES);
  assert.equal(IMAGE_MAX_BYTES, 10 * MB);
});
test("CSV rules accept by extension, case-insensitively, whatever the MIME", () => {
  const r = selectAttachFiles([file("ITEMS.CSV", "")], CSV_ATTACH_RULES);
  assert.equal(r.accepted.length, 1);
  const win = selectAttachFiles([file("items.csv", "application/vnd.ms-excel")], CSV_ATTACH_RULES);
  assert.equal(win.accepted.length, 1);
});
test("CSV rules accept a nameless text/csv clipboard blob by MIME", () => {
  assert.equal(matchesAccept(file("", "text/csv"), CSV_ATTACH_RULES.accept), true);
});
test("CSV rules reject a .txt and a PNG", () => {
  const r = selectAttachFiles([file("items.txt", "text/plain")], CSV_ATTACH_RULES);
  assert.deepEqual(r.rejected.map((x) => x.reason), ["type"]);
  const p = selectAttachFiles([file("image.png", "image/png")], CSV_ATTACH_RULES);
  assert.deepEqual(p.rejected.map((x) => x.reason), ["type"]);
});
test("JSON rules accept .json and reject .csv", () => {
  assert.equal(selectAttachFiles([file("vault1-export.json", "application/json")], JSON_ATTACH_RULES).accepted.length, 1);
  assert.deepEqual(
    selectAttachFiles([file("items.csv", "text/csv")], JSON_ATTACH_RULES).rejected.map((x) => x.reason),
    ["type"],
  );
});
test("wildcard MIME tokens match the major type only", () => {
  assert.equal(matchesAccept(file("a.png", "image/png"), "image/*"), true);
  assert.equal(matchesAccept(file("a.png", "imagex/png"), "image/*"), false);
  assert.equal(matchesAccept(file("a.txt", "text/plain"), "image/*"), false);
});

// ── Size ────────────────────────────────────────────────────────────────────
test("an image of exactly 10 MB is accepted", () => {
  const r = selectAttachFiles([file("big.jpg", "image/jpeg", 10 * MB)], IMAGE_ATTACH_RULES);
  assert.equal(r.accepted.length, 1);
});
test("an image one byte over 10 MB is rejected as size", () => {
  const r = selectAttachFiles([file("huge.jpg", "image/jpeg", 10 * MB + 1)], IMAGE_ATTACH_RULES);
  assert.equal(r.accepted.length, 0);
  assert.deepEqual(r.rejected.map((x) => x.reason), ["size"]);
});
test("type is checked before size (a huge PDF is a type rejection)", () => {
  const r = selectAttachFiles([file("huge.pdf", "application/pdf", 50 * MB)], IMAGE_ATTACH_RULES);
  assert.deepEqual(r.rejected.map((x) => x.reason), ["type"]);
});

// ── Count ───────────────────────────────────────────────────────────────────
test("image surfaces take many files at once (no count limit)", () => {
  const many = Array.from({ length: 25 }, (_, i) => file(`p${i}.png`, "image/png"));
  assert.equal(selectAttachFiles(many, IMAGE_ATTACH_RULES).accepted.length, 25);
});
test("CSV surfaces take one file: the second is rejected as count", () => {
  const r = selectAttachFiles([file("a.csv", "text/csv"), file("b.csv", "text/csv")], CSV_ATTACH_RULES);
  assert.deepEqual(r.accepted.map((f) => f.name), ["a.csv"]);
  assert.deepEqual(r.rejected.map((x) => [x.file.name, x.reason]), [["b.csv", "count"]]);
});
test("the count limit spends on the first MATCHING file, not the first file", () => {
  const r = selectAttachFiles([file("image.png", "image/png"), file("a.csv", "text/csv")], CSV_ATTACH_RULES);
  assert.deepEqual(r.accepted.map((f) => f.name), ["a.csv"]);
  assert.deepEqual(r.rejected.map((x) => x.reason), ["type"]);
});
test("the JSON import takes one file", () => {
  const r = selectAttachFiles([file("a.json", ""), file("b.json", "")], JSON_ATTACH_RULES);
  assert.equal(r.accepted.length, 1);
  assert.deepEqual(r.rejected.map((x) => x.reason), ["count"]);
});

// ── Paste plan: which meaning a paste has, decided once ─────────────────────
const paste = (over) =>
  planPaste({ files: [], text: "", targetEditable: false, rules: IMAGE_ATTACH_RULES, acceptsText: false, ...over });

test("a pasted screenshot attaches on an image surface", () => {
  const p = paste({ files: [file("image.png", "image/png")] });
  assert.equal(p.kind, "files");
  assert.equal(p.accepted.length, 1);
});
test("paste validates exactly like the picker (same accepted set)", () => {
  const files = [file("a.png", "image/png"), file("b.pdf", "application/pdf"), file("c.jpg", "image/jpeg", 11 * MB)];
  const picked = selectAttachFiles(files, IMAGE_ATTACH_RULES);
  const pasted = paste({ files });
  assert.equal(pasted.kind, "files");
  assert.deepEqual(pasted.accepted, picked.accepted);
  assert.deepEqual(pasted.rejected, picked.rejected);
});
test("a screenshot pasted while a text field has focus still attaches", () => {
  const p = paste({ files: [file("image.png", "image/png")], targetEditable: true });
  assert.equal(p.kind, "files");
});
test("spreadsheet cells (text + image) pasted into a text field stay a text paste", () => {
  const p = paste({ files: [file("image.png", "image/png")], text: "Fender\tStrat", targetEditable: true });
  assert.equal(p.kind, "native");
});
test("plain text pasted into a text field is left to the browser", () => {
  assert.equal(paste({ text: "hello", targetEditable: true }).kind, "native");
});
test("plain text pasted on an image surface outside a field does nothing", () => {
  assert.equal(paste({ text: "hello" }).kind, "native");
});
test("a pasted PDF on an image surface is rejected, not silently dropped", () => {
  const p = paste({ files: [file("receipt.pdf", "application/pdf")] });
  assert.equal(p.kind, "rejected");
  assert.deepEqual(p.rejected.map((x) => x.reason), ["type"]);
});
test("an oversized pasted image is rejected as size", () => {
  const p = paste({ files: [file("image.png", "image/png", 12 * MB)] });
  assert.equal(p.kind, "rejected");
  assert.deepEqual(p.rejected.map((x) => x.reason), ["size"]);
});
test("CSV text pasted on a CSV surface outside a field becomes text", () => {
  const p = paste({ text: "brand,model\nFender,Strat", rules: CSV_ATTACH_RULES, acceptsText: true });
  assert.deepEqual(p, { kind: "text", text: "brand,model\nFender,Strat" });
});
test("a pasted CSV file wins over its accompanying text on a CSV surface", () => {
  const p = paste({ files: [file("items.csv", "text/csv")], text: "items.csv", rules: CSV_ATTACH_RULES, acceptsText: true });
  assert.equal(p.kind, "files");
  assert.deepEqual(p.accepted.map((f) => f.name), ["items.csv"]);
});
test("spreadsheet cells pasted on a CSV surface outside a field use the text, not the image", () => {
  const p = paste({ files: [file("image.png", "image/png")], text: "a,b\n1,2", rules: CSV_ATTACH_RULES, acceptsText: true });
  assert.equal(p.kind, "text");
});
test("CSV text pasted into the CSV paste box itself is left to the browser", () => {
  const p = paste({ text: "a,b\n1,2", rules: CSV_ATTACH_RULES, acceptsText: true, targetEditable: true });
  assert.equal(p.kind, "native");
});
test("whitespace-only text is not a paste", () => {
  assert.equal(paste({ text: "  \n ", rules: CSV_ATTACH_RULES, acceptsText: true }).kind, "native");
});
test("an empty clipboard is not a paste", () => {
  assert.equal(paste({}).kind, "native");
});

// ── Messages ────────────────────────────────────────────────────────────────
test("no rejections, no message", () => {
  assert.equal(describeRejections([], IMAGE_ATTACH_RULES), null);
});
test("a type rejection names the file and what is accepted", () => {
  const r = selectAttachFiles([file("receipt.pdf", "application/pdf")], IMAGE_ATTACH_RULES);
  const msg = describeRejections(r.rejected, IMAGE_ATTACH_RULES);
  assert.match(msg, /receipt\.pdf/);
  assert.match(msg, new RegExp(IMAGE_ATTACH_RULES.label));
});
test("a size rejection states the limit", () => {
  const r = selectAttachFiles([file("huge.jpg", "image/jpeg", 11 * MB)], IMAGE_ATTACH_RULES);
  assert.match(describeRejections(r.rejected, IMAGE_ATTACH_RULES), /huge\.jpg.*10 MB/);
});
test("a count rejection says one at a time", () => {
  const r = selectAttachFiles([file("a.csv", "text/csv"), file("b.csv", "text/csv")], CSV_ATTACH_RULES);
  assert.match(describeRejections(r.rejected, CSV_ATTACH_RULES), /one file at a time/i);
});

// ── Clipboard file names (the upload route derives the stored extension) ───
test("a nameless pasted PNG gets a .png name", () => {
  assert.equal(nameForPastedFile("", "image/png"), "pasted.png");
});
test("an extensionless pasted JPEG gets .jpg", () => {
  assert.equal(nameForPastedFile("image", "image/jpeg"), "image.jpg");
});
test("a pasted file that already has an extension keeps its name", () => {
  assert.equal(nameForPastedFile("image.png", "image/png"), "image.png");
});
test("an unknown MIME leaves the name alone", () => {
  assert.equal(nameForPastedFile("blob", "application/octet-stream"), "blob");
});

let passed = 0;
const failures = [];
for (const c of cases) {
  try {
    c.fn();
    passed++;
  } catch (err) {
    failures.push({ name: c.name, message: err.message.split("\n")[0] });
  }
}
for (const f of failures) console.log(`FAIL  ${f.name}\n      ${f.message}`);
console.log(`\nattach rules: ${cases.length} total, ${passed} passed, ${failures.length} failed`);
if (cases.length === 0 || failures.length > 0) process.exit(1);
