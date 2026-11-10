import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: {
    environment: "node",
    include: ["lib/**/__tests__/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["lib/engine/**/*.ts"],
      exclude: ["lib/engine/__tests__/**", "lib/engine/placeholder-items.ts"],
      thresholds: {
        branches: 100,
        functions: 100,
        lines: 100,
        statements: 100,
      },
    },
  },
});
