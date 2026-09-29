import { defineConfig } from "@playwright/test";

/** Smoke test (10-frontend-nextjs.md §I). Needs `npm run dev` and a real 08-public-api-service
 * instance (with at least one Montenegro cluster of sites seeded) already running — this
 * project prefers real infrastructure over mocks (05-normal-charge-flow-tests.md's philosophy,
 * applied here as far as practical to a frontend). */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:3000",
    viewport: { width: 1280, height: 900 },
  },
});
