import path from "node:path";
import { defineConfig } from "vitest/config";

// VLT-69: the repository's first test runner. Pure modules only for now; the
// `@/` alias mirrors tsconfig's paths so a test imports what the app imports.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: {
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
  },
});
