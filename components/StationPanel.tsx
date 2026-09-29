"use client";

import { useEffect, useState } from "react";

import { getSite } from "@/lib/api";
import { connectorStatusColor, STATUS_COLORS } from "@/lib/statusColors";
import type { AggregateStatus, ChargePointInSite, ConnectorOut, SiteDetail } from "@/lib/types";
import { liveKey, useStationLiveStatus } from "@/lib/useStationLiveStatus";

/** kW with no decimals when whole ("22 kW"), otherwise one ("15.4 kW"). */
function formatKw(kw: number): string {
  return `${Number.isInteger(kw) ? kw : kw.toFixed(1)} kW`;
}

/** "CCS2 · 200 kW DC", or "Type 2 · AC" with no known rating, or "Connector N" for a connector
 * nobody described (every real charger today). */
function connectorLabel(connector: ConnectorOut): string {
  if (!connector.connector_type) {
    return `Connector ${connector.connector_id}`;
  }
  const power = [
    connector.max_power_kw != null ? formatKw(connector.max_power_kw) : null,
    connector.power_type,
  ]
    .filter(Boolean)
    .join(" ");
  return power ? `${connector.connector_type} · ${power}` : connector.connector_type;
}

/** The highest rated kW of any connector at the site, or null when none states one. */
function siteMaxKw(detail: SiteDetail): number | null {
  const ratings = detail.charge_points
    .flatMap((cp) => cp.connectors.map((connector) => connector.max_power_kw))
    .filter((kw): kw is number => kw != null);
  return ratings.length > 0 ? Math.max(...ratings) : null;
}

/** A `ChargePoint` is one physical charger — OCPP 1.6's own term. A `Site` (this panel) is the
 * place that holds one or more of them (a fuel station, hotel car park, etc.). */
export default function StationPanel({
  siteId,
  onClose,
}: {
  siteId: string;
  onClose: () => void;
}) {
  const [trackedSiteId, setTrackedSiteId] = useState(siteId);
  const [detail, setDetail] = useState<SiteDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset during render (not in the effect below) the moment `siteId` changes, so a click on a
  // different pin never briefly renders the previous site's detail.
  if (siteId !== trackedSiteId) {
    setTrackedSiteId(siteId);
    setDetail(null);
    setError(null);
  }

  useEffect(() => {
    let cancelled = false;
    getSite(siteId)
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load this site.");
      });
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  // §E.5: an external_reference site has no live connection at all — no WebSocket for it.
  const isExternalReference = detail?.source === "external_reference";
  const { live, connected } = useStationLiveStatus(
    detail && !isExternalReference ? siteId : null,
  );
  const maxKw = detail ? siteMaxKw(detail) : null;

  return (
    <div className="absolute top-0 right-0 h-full w-full max-w-sm overflow-y-auto bg-white p-4 shadow-xl sm:m-3 sm:h-[calc(100%-1.5rem)] sm:rounded-lg">
      <button
        onClick={onClose}
        className="absolute top-3 right-3 text-gray-400 hover:text-gray-700"
        aria-label="Close"
      >
        ✕
      </button>

      {error && <p className="mt-8 text-sm text-red-600">{error}</p>}

      {!error && !detail && (
        <div className="mt-8 animate-pulse space-y-3">
          <div className="h-5 w-2/3 rounded bg-gray-200" />
          <div className="h-4 w-1/2 rounded bg-gray-200" />
          <div className="h-24 rounded bg-gray-100" />
        </div>
      )}

      {detail && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-gray-900">{detail.name}</h2>
          {detail.address && <p className="text-sm text-gray-500">{detail.address}</p>}
          {maxKw != null && (
            <p className="text-sm text-gray-700">Up to {formatKw(maxKw)}</p>
          )}
          {detail.connector_types && (
            <p className="mt-1 text-xs text-gray-500">
              Connectors: {detail.connector_types.join(", ")}
            </p>
          )}

          {isExternalReference ? (
            <div className="mt-4">
              <StatusBadge status="unknown" />
              <p className="mt-2 text-xs text-gray-500">
                Imported reference data — this system has no live connection to this location.
              </p>
            </div>
          ) : (
            <div className="mt-4">
              <p className="mb-2 text-xs text-gray-400">
                {connected ? "Live" : "Connecting…"}
              </p>
              <ChargePointsView chargePoints={detail.charge_points} live={live} />
            </div>
          )}

          {detail.source === "simulated" && (
            <p className="mt-6 text-xs text-gray-400">Demo data — simulated chargers.</p>
          )}
        </div>
      )}
    </div>
  );
}

function ChargePointsView({
  chargePoints,
  live,
}: {
  chargePoints: ChargePointInSite[];
  live: ReturnType<typeof useStationLiveStatus>["live"];
}) {
  // Every charger's connectors, all visible at once (11-demo-fleet.md §G.3): at most five
  // chargers per site, and collapsing them would hide the live changes the panel exists to show.
  // Numbered in the API's order, which is sorted by identity.
  return (
    <div className="space-y-3">
      {chargePoints.map((cp, index) => (
        <section key={cp.identity}>
          <h3 className="mb-1 flex items-baseline gap-2 text-sm font-medium text-gray-800">
            Charger {index + 1}
            <span className="text-xs font-normal text-gray-400">{cp.identity}</span>
          </h3>
          <ChargePointView chargePoint={cp} live={live} />
        </section>
      ))}
    </div>
  );
}

function ChargePointView({
  chargePoint,
  live,
}: {
  chargePoint: ChargePointInSite;
  live: ReturnType<typeof useStationLiveStatus>["live"];
}) {
  return (
    <ul className="space-y-2">
      {chargePoint.connectors.map((connector) => {
        const liveConnector = live[liveKey(chargePoint.identity, connector.connector_id)];
        const status = liveConnector?.status ?? connector.status;
        const errorCode = liveConnector?.error_code ?? connector.error_code;
        return (
          <li key={connector.connector_id} className="rounded bg-gray-50 px-3 py-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-gray-700">{connectorLabel(connector)}</span>
              <span className="font-medium" style={{ color: connectorStatusColor(status) }}>
                {status}
              </span>
            </div>
            {errorCode !== "NoError" && (
              <p className="mt-1 text-xs text-red-600">{errorCode}</p>
            )}
            {liveConnector?.transaction_id != null && (
              <p className="mt-1 text-xs text-gray-500">
                Session #{liveConnector.transaction_id}
                {liveConnector.latest_meter_value != null &&
                  ` · ${liveConnector.latest_meter_value} Wh`}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function StatusBadge({ status }: { status: AggregateStatus }) {
  return (
    <span
      className="inline-block rounded-full px-2 py-1 text-xs font-medium text-white"
      style={{ backgroundColor: STATUS_COLORS[status] }}
    >
      {status}
    </span>
  );
}
