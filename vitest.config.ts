import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    // A legacy asset-route test creates a short-lived post in the shared blog
    // root. Keep files sequential so no reader can observe its cleanup race;
    // all CMS mutation tests use independent os.tmpdir() roots.
    fileParallelism: false,
    include: ["tests/**/*.test.ts"],
  },
});
