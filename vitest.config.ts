import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// `@/…` mirrors the tsconfig path alias so tests import lib/route modules the
// same way the app does.
const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: { "@": rootDir },
  },
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts"],
    exclude: ["legacy/**", "node_modules/**", ".next/**"],
    coverage: {
      provider: "v8",
      include: ["lib/**/*.ts"],
      exclude: ["legacy/**", "node_modules/**", ".next/**", "tests/**"],
    },
  },
});
