import { expect, test } from "@playwright/test";
import type { Map as MapLibreMap } from "maplibre-gl";

/**
 * 10-frontend-nextjs.md §I / §J. Needs `npm run dev` plus a real 08-public-api-service instance
 * (with 09-plugshare-import.md's sites and at least one operator Site seeded) already running.
 *
 * A MapLibre map is a WebGL canvas with no per-pin DOM, and MapTiler's real tile/style CDN has
 * variable latency, so waiting a fixed number of milliseconds before interacting is flaky in
 * practice (the sites layer may not have any rendered features yet). Every test below instead
 * polls the real map instance (exposed on `window.__chargerMap` in non-production builds only —
 * see components/MapView.tsx) until the feature it needs actually exists, then clicks its
 * projected screen coordinate.
 */

async function waitForClusterFeature(page: import("@playwright/test").Page) {
  return page.waitForFunction(
    () => {
      const map = (window as unknown as { __chargerMap?: MapLibreMap }).__chargerMap as
        | MapLibreMap
        | undefined;
      if (!map) return null;
      const features = map.queryRenderedFeatures({ layers: ["sites-clusters"] });
      if (features.length === 0) return null;
      const feature = features[0];
      const point = map.project((feature.geometry as GeoJSON.Point).coordinates as [number, number]);
      return { x: point.x, y: point.y, clusterId: feature.properties?.cluster_id };
    },
    undefined,
    { timeout: 20_000, polling: 250 },
  );
}

test("page is a full-bleed map with no other content", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();
  await expect(page.locator("h1, nav")).toHaveCount(0);
});

test("clicking a cluster zooms the camera in", async ({ page }) => {
  await page.goto("/");
  const clusterHandle = await waitForClusterFeature(page);
  const cluster = (await clusterHandle.jsonValue())!;

  const zoomBefore = await page.evaluate(
    () => (window as unknown as { __chargerMap: MapLibreMap }).__chargerMap.getZoom(),
  );
  await page.mouse.click(cluster.x, cluster.y);
  await page.waitForFunction(
    (before) =>
      (window as unknown as { __chargerMap: MapLibreMap }).__chargerMap.getZoom() > before,
    zoomBefore,
    { timeout: 10_000 },
  );
});

test("clicking an individual pin opens the panel with a live status", async ({ page }) => {
  await page.goto("/");

  // Fly straight to a real, known unclustered pin rather than repeatedly clicking clusters:
  // deterministic regardless of how the seed data happens to be spatially distributed.
  const pinHandle = await page.waitForFunction(
    () => {
      const map = (window as unknown as { __chargerMap?: MapLibreMap }).__chargerMap;
      if (!map) return null;
      const zoomed = map.queryRenderedFeatures({ layers: ["sites-unclustered"] });
      if (zoomed.length > 0) {
        const feature = zoomed[0];
        const point = map.project(
          (feature.geometry as GeoJSON.Point).coordinates as [number, number],
        );
        return { x: point.x, y: point.y };
      }
      // Nothing unclustered yet at the current zoom: zoom in on the first cluster found and
      // let the next poll re-check for unclustered points revealed by that.
      const clusters = map.queryRenderedFeatures({ layers: ["sites-clusters"] });
      if (clusters.length > 0) {
        const coords = (clusters[0].geometry as GeoJSON.Point).coordinates as [number, number];
        map.easeTo({ center: coords, zoom: Math.min(map.getZoom() + 3, 18), duration: 0 });
      }
      return null;
    },
    undefined,
    { timeout: 20_000, polling: 300 },
  );
  const pin = (await pinHandle.jsonValue())!;

  await page.mouse.click(pin.x, pin.y);
  await expect(page.getByRole("button", { name: "Close" })).toBeVisible({ timeout: 5000 });
  await expect(
    page.getByText(/preparing|charging|finishing|available|unavailable|unknown/i),
  ).toBeVisible();
});
