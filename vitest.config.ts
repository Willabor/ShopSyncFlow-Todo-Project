// Client unit-test config. Lives separately from vite.config.ts so the
// `test` block doesn't leak into vite's createServer types (server/vite.ts).
// Plain `vitest` picks this file up automatically; server tests keep their
// own explicit vitest.config.server.ts.
import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      globals: true,
      environment: "jsdom",
      setupFiles: ["./client/src/test/setup.ts"],
      include: ["**/*.test.{ts,tsx}"],
      exclude: ["node_modules", "dist", "e2e"],
    },
  }),
);
