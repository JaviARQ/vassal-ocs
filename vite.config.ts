import { defineConfig } from "vite";

// Static-site config. Builds to /dist which can be hosted anywhere (incl. an
// iOS-reachable static host). `base: "./"` keeps asset URLs relative so the
// build also works when opened from a subpath.
export default defineConfig({
  base: "./",
  server: { host: true, port: 5173 },
  build: { target: "es2022", sourcemap: true },
  // Prefer .ts sources over the tsc-emitted .js twins living next to them, so
  // vitest and the dev server never pick up stale build artifacts.
  resolve: { extensions: [".ts", ".mts", ".mjs", ".js", ".json"] },
});
