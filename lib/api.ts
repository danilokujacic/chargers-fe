import type { ChargePointDetail, SiteDetail, SiteSummary } from "./types";

/** `08-public-api-service.md` §F's REST base. Server Components and Client Components both read
 * this the same way; only the `NEXT_PUBLIC_` prefix makes it reach client code too. */
function apiBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!url) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL is not set");
  }
  return url;
}

async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBaseUrl()}${path}`, init);
  if (!res.ok) {
    throw new Error(`${path} -> HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

/** `GET /api/v1/sites` (08 §F) — every pin on the map. `cache: "no-store"`: this data is meant
 * to be current, called at request time from a Server Component, not cached across requests. */
export function listSites(): Promise<SiteSummary[]> {
  return getJson<SiteSummary[]>("/api/v1/sites", { cache: "no-store" });
}

/** `GET /api/v1/sites/{id}` (08 §F) — full detail for one clicked Site, including its
 * ChargePoints and their per-connector status. */
export function getSite(id: string): Promise<SiteDetail> {
  return getJson<SiteDetail>(`/api/v1/sites/${encodeURIComponent(id)}`, { cache: "no-store" });
}

/** `GET /api/v1/charge-points/{identity}` (08 §F) — one charger on its own. */
export function getChargePoint(identity: string): Promise<ChargePointDetail> {
  return getJson<ChargePointDetail>(
    `/api/v1/charge-points/${encodeURIComponent(identity)}`,
    { cache: "no-store" },
  );
}
