"use client";

import "@maptiler/sdk/dist/maptiler-sdk.css";

import { config as maptilerConfig, Map as MaptilerMap, MapStyle } from "@maptiler/sdk";
import type { GeoJSONSource, MapGeoJSONFeature, MapMouseEvent } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";

import { statusColorExpression } from "@/lib/statusColors";
import type { SiteSummary } from "@/lib/types";

import SearchBox from "./SearchBox";
import StationPanel from "./StationPanel";

const SITES_SOURCE_ID = "sites";
const CLUSTER_LAYER_ID = "sites-clusters";
const CLUSTER_COUNT_LAYER_ID = "sites-cluster-count";
const UNCLUSTERED_LAYER_ID = "sites-unclustered";

// 10-frontend-nextjs.md §F.1 — approximate, verify Montenegro's real extent before shipping.
const MONTENEGRO_CENTER: [number, number] = [19.3, 42.7];
const MONTENEGRO_BOUNDS: [[number, number], [number, number]] = [
  [18.4, 41.85],
  [20.4, 43.6],
];

function toFeatureCollection(sites: SiteSummary[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: sites.map((site) => ({
      type: "Feature",
      id: site.id,
      geometry: { type: "Point", coordinates: [site.longitude, site.latitude] },
      properties: {
        id: site.id,
        name: site.name,
        site_type: site.site_type,
        source: site.source,
        connector_types: site.connector_types,
        charge_point_count: site.charge_point_count,
        aggregate_status: site.aggregate_status,
        // clusterProperties (§G.3) fold points via `+`, so these need to be numbers per feature.
        is_faulted: site.aggregate_status === "faulted" ? 1 : 0,
        is_available: site.aggregate_status === "available" ? 1 : 0,
      },
    })),
  };
}

export default function MapView({ initialSites }: { initialSites: SiteSummary[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MaptilerMap | null>(null);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [mapInstance, setMapInstance] = useState<MaptilerMap | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    const apiKey = process.env.NEXT_PUBLIC_MAPTILER_API_KEY;
    if (!apiKey) {
      throw new Error("NEXT_PUBLIC_MAPTILER_API_KEY is not set");
    }
    maptilerConfig.apiKey = apiKey;

    const map = new MaptilerMap({
      container: containerRef.current,
      style: MapStyle.STREETS,
      center: MONTENEGRO_CENTER,
      zoom: 8,
      minZoom: 7,
      maxZoom: 19,
      maxBounds: MONTENEGRO_BOUNDS,
      // Default top-right placement collides with the detail panel (§E) and its close
      // button, which also docks top-right when open.
      navigationControl: "bottom-right",
      geolocateControl: "bottom-right",
    });
    mapRef.current = map;
    if (process.env.NODE_ENV !== "production") {
      // Non-production only: lets the Playwright smoke suite (§I) drive the map by real
      // feature/coordinate instead of guessing screen pixels against a canvas.
      (window as unknown as { __chargerMap?: MaptilerMap }).__chargerMap = map;
    }

    map.on("load", () => {
      map.addSource(SITES_SOURCE_ID, {
        type: "geojson",
        data: toFeatureCollection(initialSites),
        cluster: true,
        clusterRadius: 50,
        clusterMaxZoom: 14,
        // §G.3, optional: lets a cluster's own colour answer "is there likely something
        // available/faulted inside" before the user zooms in, using the same precedence §F.2
        // uses for a single site (faulted beats available).
        clusterProperties: {
          faulted_count: ["+", ["get", "is_faulted"]],
          available_count: ["+", ["get", "is_available"]],
        },
      });

      map.addLayer({
        id: CLUSTER_LAYER_ID,
        type: "circle",
        source: SITES_SOURCE_ID,
        filter: ["has", "point_count"],
        paint: {
          "circle-radius": ["step", ["get", "point_count"], 16, 10, 20, 30, 26],
          "circle-color": [
            "case",
            [">", ["get", "faulted_count"], 0],
            "#ef4444",
            [">", ["get", "available_count"], 0],
            "#22c55e",
            "#6b7280",
          ],
          "circle-opacity": 0.85,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });

      map.addLayer({
        id: CLUSTER_COUNT_LAYER_ID,
        type: "symbol",
        source: SITES_SOURCE_ID,
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-size": 12,
        },
        paint: { "text-color": "#ffffff" },
      });

      map.addLayer({
        id: UNCLUSTERED_LAYER_ID,
        type: "circle",
        source: SITES_SOURCE_ID,
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-radius": 9,
          "circle-color": statusColorExpression(),
          "circle-opacity": ["match", ["get", "aggregate_status"], "unknown", 0.15, 1],
          "circle-stroke-width": 2,
          "circle-stroke-color": statusColorExpression(),
        },
      });

      map.on("mouseenter", CLUSTER_LAYER_ID, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", CLUSTER_LAYER_ID, () => {
        map.getCanvas().style.cursor = "";
      });
      map.on("mouseenter", UNCLUSTERED_LAYER_ID, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", UNCLUSTERED_LAYER_ID, () => {
        map.getCanvas().style.cursor = "";
      });

      // §G.2: clicking a cluster zooms to that cluster's own expansion zoom, then §G.1's
      // automatic re-clustering reveals the now-separated points — no fly-apart animation.
      map.on("click", CLUSTER_LAYER_ID, async (event: MapMouseEvent) => {
        const features = map.queryRenderedFeatures(event.point, { layers: [CLUSTER_LAYER_ID] });
        const feature = features[0] as MapGeoJSONFeature | undefined;
        const clusterId = feature?.properties?.cluster_id;
        if (clusterId === undefined) {
          return;
        }
        const source = map.getSource(SITES_SOURCE_ID) as GeoJSONSource;
        const expansionZoom = await source.getClusterExpansionZoom(clusterId);
        const geometry = feature!.geometry as GeoJSON.Point;
        map.easeTo({
          center: geometry.coordinates as [number, number],
          zoom: expansionZoom,
          duration: 500,
        });
      });

      map.on("click", UNCLUSTERED_LAYER_ID, (event: MapMouseEvent) => {
        const features = map.queryRenderedFeatures(event.point, {
          layers: [UNCLUSTERED_LAYER_ID],
        });
        const siteId = features[0]?.properties?.id as string | undefined;
        if (siteId) {
          setSelectedSiteId(siteId);
        }
      });

      setMapInstance(map);
    });

    return () => {
      map.remove();
      mapRef.current = null;
      setMapInstance(null);
    };
    // initialSites is the server-fetched snapshot passed once on first render; the map's own
    // source data is refreshed in place (setData) rather than by re-running this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      <SearchBox map={mapInstance} />
      {selectedSiteId && (
        <StationPanel siteId={selectedSiteId} onClose={() => setSelectedSiteId(null)} />
      )}
    </div>
  );
}
