// VLT-47 (STD-FRM-002): the one set of rules every file surface runs its
// picker, drag-and-drop AND clipboard paste through.
//
// Pure — no React, no DOM — so it can be proven with a plain node script
// (scripts/check-attach-rules.mjs) and so the upload route can share the image
// limits with the browser. Keep it free of `@/` imports and of TypeScript-only
// runtime syntax (enums, namespaces, parameter properties): the check script
// loads this file with Node's built-in type stripping.

export interface AttachRules {
  /** Same grammar as <input accept>: comma-separated ".ext", "type/sub" or "type/*". */
  accept: string;
  /** Human words for what `accept` allows, used in rejection messages. */
  label: string;
  /** Per-file byte limit. Omitted = no client-side limit. */
  maxBytes?: number;
  /** Files one attach may add. Omitted = unlimited. */
  maxFiles?: number;
}

/** The parts of a File the rules read. A browser File satisfies it. */
export interface FileLike {
  name: string;
  type: string;
  size: number;
}

export type RejectReason = "type" | "size" | "count";

export interface Rejection<F extends FileLike> {
  file: F;
  reason: RejectReason;
}

export interface AttachSelection<F extends FileLike> {
  accepted: F[];
  rejected: Rejection<F>[];
}

/**
 * What one paste means. Decided once, so a paste is never both a text paste
 * and a file attach (STD-FRM-002: the two meanings must not be ambiguous).
 */
export type PastePlan<F extends FileLike> =
  | { kind: "native" }
  | { kind: "files"; accepted: F[]; rejected: Rejection<F>[] }
  | { kind: "text"; text: string }
  | { kind: "rejected"; rejected: Rejection<F>[] };

// ── The rules ────────────────────────────────────────────────────────────────

/** What /api/upload stores. The route imports these, so browser and server cannot drift. */
export const IMAGE_MIME_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
export const IMAGE_MAX_BYTES = 10 * 1024 * 1024;

export const IMAGE_ATTACH_RULES: AttachRules = {
  accept: IMAGE_MIME_TYPES.join(","),
  label: "JPG, PNG, WebP or GIF images",
  maxBytes: IMAGE_MAX_BYTES,
};

export const CSV_ATTACH_RULES: AttachRules = {
  accept: ".csv,text/csv",
  label: "a .csv file",
  maxFiles: 1,
};

export const JSON_ATTACH_RULES: AttachRules = {
  accept: ".json",
  label: "a Vault 1 .json export",
  maxFiles: 1,
};

// ── Matching ─────────────────────────────────────────────────────────────────

/** Reads `accept` the way the browser's <input accept> does: extensions match the name case-insensitively, MIME tokens match the type. */
export function matchesAccept(file: FileLike, accept: string): boolean {
  const tokens = accept
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  if (tokens.length === 0) return true;
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return tokens.some((token) => {
    if (token.startsWith(".")) return name.endsWith(token);
    if (token.endsWith("/*")) return type.startsWith(token.slice(0, -1));
    return type === token;
  });
}

/**
 * Splits a list of files into what the surface takes and what it refuses, and
 * why. Order is kept; type is checked before size, and the count limit is
 * spent only on files that passed type and size.
 */
export function selectAttachFiles<F extends FileLike>(files: F[], rules: AttachRules): AttachSelection<F> {
  const accepted: F[] = [];
  const rejected: Rejection<F>[] = [];
  for (const file of files) {
    if (!matchesAccept(file, rules.accept)) {
      rejected.push({ file, reason: "type" });
    } else if (rules.maxBytes !== undefined && file.size > rules.maxBytes) {
      rejected.push({ file, reason: "size" });
    } else if (rules.maxFiles !== undefined && accepted.length >= rules.maxFiles) {
      rejected.push({ file, reason: "count" });
    } else {
      accepted.push(file);
    }
  }
  return { accepted, rejected };
}

function formatMB(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
}

/** One short sentence for the surface to show, or null when nothing was refused. */
export function describeRejections<F extends FileLike>(rejected: Rejection<F>[], rules: AttachRules): string | null {
  if (rejected.length === 0) return null;
  const parts: string[] = [];
  const shown = rejected.slice(0, 3);
  for (const { file, reason } of shown) {
    const name = file.name || "The pasted file";
    if (reason === "type") parts.push(`${name} wasn't added — only ${rules.label} can be added here.`);
    else if (reason === "size") parts.push(`${name} wasn't added — it is larger than ${formatMB(rules.maxBytes ?? 0)}.`);
  }
  if (rejected.some((r) => r.reason === "count")) {
    parts.push(rules.maxFiles === 1 ? "Only one file at a time can be added here." : `Only ${rules.maxFiles} files at a time can be added here.`);
  }
  const unshown = rejected.slice(3).filter((r) => r.reason !== "count").length;
  if (unshown > 0) parts.push(`${unshown} more file${unshown === 1 ? "" : "s"} weren't added.`);
  return parts.join(" ");
}

// ── Paste ────────────────────────────────────────────────────────────────────

const EXT_FOR_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "text/csv": "csv",
  "application/json": "json",
};

/**
 * Clipboard files can arrive nameless or without an extension. /api/upload
 * derives the stored file's extension from the name, and the serve route
 * derives Content-Type from that extension, so give such files one from their
 * MIME type. Files that already have an extension keep their name.
 */
export function nameForPastedFile(name: string, type: string): string {
  if (/\.[a-z0-9]+$/i.test(name)) return name;
  const ext = EXT_FOR_MIME[type.toLowerCase()];
  if (!ext) return name;
  return `${name || "pasted"}.${ext}`;
}

/**
 * Decides what a paste on an open attach surface means.
 *
 * - Focus in a text field and the clipboard carries text → the browser's own
 *   text paste (copying spreadsheet cells puts text AND a picture of them on
 *   the clipboard; the field must get the text).
 * - Otherwise clipboard files go through `selectAttachFiles` — the same rules
 *   as the picker and drop.
 * - On a surface that takes text (CSV imports), text pasted outside a field
 *   is handed to it when no file was taken.
 */
export function planPaste<F extends FileLike>(input: {
  files: F[];
  text: string;
  targetEditable: boolean;
  rules: AttachRules;
  acceptsText: boolean;
}): PastePlan<F> {
  const { files, text, targetEditable, rules, acceptsText } = input;
  const hasText = text.trim().length > 0;
  if (targetEditable && hasText) return { kind: "native" };

  let rejected: Rejection<F>[] = [];
  if (files.length > 0) {
    const selection = selectAttachFiles(files, rules);
    if (selection.accepted.length > 0) {
      return { kind: "files", accepted: selection.accepted, rejected: selection.rejected };
    }
    rejected = selection.rejected;
  }
  if (acceptsText && hasText && !targetEditable) return { kind: "text", text };
  if (rejected.length > 0) return { kind: "rejected", rejected };
  return { kind: "native" };
}
