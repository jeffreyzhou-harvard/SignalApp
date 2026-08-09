import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Resolve the `@/` path alias (from tsconfig) in tests, so modules can use the
// project's stable `@/lib/...` imports rather than deep relative paths.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
