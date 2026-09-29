import { expect, test } from "@playwright/test";
import type { Map as MapLibreMap } from "maplibre-gl";

/**
 * 11-demo-fleet.md §G.5. Assumes the demo fleet is running: `npm run dev`, the public API, and
 * `seed_demo_fleet.py` + `run_demo_fleet.py` in the chargers repo.
 *
 * The site's coordinates come from the real API, then the test flies the real map there (via
 * `window.__chargerMap`, non-production only — see components/MapView.tsx) and clicks the pin
 * it actually rendered, as smoke.spec.ts does.
 */

const API_BASE_URL = process.env.PLAYWRIGHT_API_BASE_URL ?? "http://localhost:8000";
const SITE_NAME = "Rest stop Pelev Brijeg"; // PlugShare 1351739: four 200 kW CCS2 chargers

test("Pelev Brijeg shows four CCS2 200 kW chargers and the demo note", async ({ page, request }) => {
  const sites = (await (await request.get(`${API_BASE_URL}/api/v1/sites`)).json()) as {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
  }[];
  const site = sites.find((s) => s.name === SITE_NAME);
  expect(site, `${SITE_NAME} is not in GET /api/v1/sites`).toBeDefined();

  await page.goto("/");
  const pinHandle = await page.waitForFunction(
    ({ id, lngLat }) => {
      const map = (window as unknown as { __chargerMap?: MapLibreMap }).__chargerMap;
      if (!map || !map.getLayer("sites-unclustered")) return null;
      if (map.getZoom() < 16) {
        map.jumpTo({ center: lngLat, zoom: 17 });
        return null;
      }
      const feature = map
        .queryRenderedFeatures({ layers: ["sites-unclustered"] })
        .find((f) => f.properties?.id === id);
      if (!feature) return null;
      const point = map.project((feature.geometry as GeoJSON.Point).coordinates as [number, number]);
      return { x: point.x, y: point.y };
    },
    { id: site!.id, lngLat: [site!.longitude, site!.latitude] as [number, number] },
    { timeout: 20_000, polling: 250 },
  );
  const pin = (await pinHandle.jsonValue())!;
  await page.mouse.click(pin.x, pin.y);

  await expect(page.getByRole("heading", { name: SITE_NAME })).toBeVisible({ timeout: 5000 });
  await expect(page.getByRole("heading", { name: /^Charger \d/ })).toHaveCount(4);
  await expect(page.getByText("CCS2 · 200 kW DC", { exact: true })).toHaveCount(4);
  await expect(page.getByText("Up to 200 kW")).toBeVisible();
  await expect(page.getByText("Demo data — simulated chargers.")).toBeVisible();
});
