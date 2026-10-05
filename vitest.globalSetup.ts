import { execFileSync } from "node:child_process";
import path from "node:path";

import { isThrowawayDatabase } from "./lib/testing/throwawayDb";

// Apply the migrations ONCE, before any test file runs. The DB-backed test
// files run in parallel; each migrating a fresh database itself would race on
// the same CREATE TABLEs. Same runner the Dockerfile CMD uses on deploy.
export default function setup(): void {
  if (!isThrowawayDatabase(process.env.DATABASE_URL)) return;
  execFileSync(process.execPath, [path.join(process.cwd(), "scripts", "migrate.js")], {
    env: process.env,
    stdio: "pipe",
  });
}
