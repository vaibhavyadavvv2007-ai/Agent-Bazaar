import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: { environment: "node" },
  css: { postcss: { plugins: [] } }, // node tests never touch CSS tooling
  resolve: {
    alias: { "@": path.resolve() },
  },
});
