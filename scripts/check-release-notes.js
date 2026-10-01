#!/usr/bin/env node
// Validates content/release-notes.json (STD-REL-001 / VLT-57). Wired as the
// `prebuild` npm script, so a malformed release-notes PR fails `npm run build`
// — which both the `ci` check and the Railway image build run — instead of
// being discovered by the deploy-time sync.

const { CONTENT_PATH, loadReleaseNotes, validateReleaseNotes } = require("./release-notes-content");

let problems;
try {
  problems = validateReleaseNotes(loadReleaseNotes());
} catch (err) {
  problems = [`could not read ${CONTENT_PATH}: ${err && err.message ? err.message : err}`];
}

if (problems.length > 0) {
  console.error("[release-notes-check] content/release-notes.json is invalid:");
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log("[release-notes-check] content/release-notes.json OK");
