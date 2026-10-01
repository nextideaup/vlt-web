// Shared loader + validator for content/release-notes.json (STD-REL-001 / VLT-57).
//
// Used by:
//   - scripts/check-release-notes.js — runs as `prebuild`, so a malformed file
//     fails `npm run build` (the `ci` gate and the Railway image build) before
//     it can reach a deploy.
//   - scripts/sync-release-notes.js — the deploy-time upsert; validates again
//     so it never writes a half-valid file.
//
// Plain CommonJS with no dependencies: it runs in the production container,
// where Next's standalone output ships only what routes import.

const fs = require("fs");
const path = require("path");

const CONTENT_PATH = path.join(__dirname, "../content/release-notes.json");
const PLATFORMS = ["ios", "android"];
// The iOS sheet styles a block's first line as a heading only up to this length
// (WhatsNewNote.blocks in vault1-ios). One character over and it silently
// renders as body copy — Tire Logs shipped exactly that bug in build 40.
const HEADING_MAX = 40;

function loadReleaseNotes(file = CONTENT_PATH) {
  const doc = JSON.parse(fs.readFileSync(file, "utf8"));
  return Array.isArray(doc && doc.entries) ? doc.entries : null;
}

/** Returns a list of human-readable problems; empty means the file is valid. */
function validateReleaseNotes(entries) {
  const problems = [];
  if (!Array.isArray(entries) || entries.length === 0) {
    return ["`entries` must be a non-empty array"];
  }

  const seen = new Set();
  entries.forEach((e, i) => {
    const at = `entry ${i} (${e && e.slug ? e.slug : "no slug"})`;
    if (!e || typeof e !== "object") {
      problems.push(`${at}: not an object`);
      return;
    }
    for (const field of ["slug", "title", "body"]) {
      if (typeof e[field] !== "string" || e[field].trim() === "") {
        problems.push(`${at}: \`${field}\` must be a non-empty string`);
      }
    }
    if (!PLATFORMS.includes(e.platform)) {
      problems.push(`${at}: \`platform\` must be one of ${PLATFORMS.join(", ")}`);
    }
    if (typeof e.active !== "boolean") {
      problems.push(`${at}: \`active\` must be true or false`);
    }
    if (typeof e.slug === "string") {
      if (!/^[a-z0-9][a-z0-9.-]*$/.test(e.slug)) {
        problems.push(`${at}: slug must be lowercase letters, digits, dots and dashes`);
      }
      if (seen.has(e.slug)) problems.push(`${at}: duplicate slug (slugs are the upsert key)`);
      seen.add(e.slug);
    }

    const text = `${e.title || ""}\n${e.body || ""}`;
    if (/\p{Extended_Pictographic}/u.test(text)) problems.push(`${at}: contains emoji`);
    if (/\bAI\b/i.test(text)) problems.push(`${at}: contains "AI" wording (NIU-18)`);
    if (/\b[A-Z]{2,5}-\d+\b/.test(text)) problems.push(`${at}: contains a ticket reference`);

    if (typeof e.body === "string") {
      for (const block of e.body.split("\n\n")) {
        const lines = block.split("\n").filter((l) => l.trim().length > 0);
        if (lines.length > 1 && lines[0].trim().length > HEADING_MAX) {
          problems.push(
            `${at}: heading "${lines[0].trim()}" is ${lines[0].trim().length} characters; ` +
              `the app renders headings over ${HEADING_MAX} as body text`
          );
        }
      }
    }
  });

  // The app is shown the last active entry for its platform, so the last entry
  // in the file — the release being shipped — must be active.
  const last = entries[entries.length - 1];
  if (last && last.active !== true) problems.push("the last entry (the newest release) must be active");

  return problems;
}

module.exports = { CONTENT_PATH, PLATFORMS, HEADING_MAX, loadReleaseNotes, validateReleaseNotes };
