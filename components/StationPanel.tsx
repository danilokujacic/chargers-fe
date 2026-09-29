"use client";

import { useEffect, useState } from "react";

import { getSite } from "@/lib/api";
import { STATUS_COLORS } from "@/lib/statusColors";
import type { AggregateStatus, ChargePointInSite, SiteDetail } from "@/lib/types";
import { useStationLiveStatus } from "@/lib/useStationLiveStatus";

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
  const [expanded, setExpanded] = useState<string | null>(
    chargePoints.length === 1 ? chargePoints[0].identity : null,
  );

  // §E.4: a single-ChargePoint site skips straight to that charger's own view.
  if (chargePoints.length === 1) {
    return <ChargePointView chargePoint={chargePoints[0]} live={live} />;
  }

  return (
    <div className="space-y-2">
      {chargePoints.map((cp) => (
        <div key={cp.identity} className="rounded border border-gray-200">
          <button
            onClick={() => setExpanded(expanded === cp.identity ? null : cp.identity)}
            className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium text-gray-800"
          >
            {cp.identity}
            <span className="text-gray-400">{expanded === cp.identity ? "−" : "+"}</span>
          </button>
          {expanded === cp.identity && (
            <div className="border-t border-gray-100 px-3 py-2">
              <ChargePointView chargePoint={cp} live={live} />
            </div>
          )}
        </div>
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
        const liveConnector = live[connector.connector_id];
        const status = liveConnector?.status ?? connector.status;
        const errorCode = liveConnector?.error_code ?? connector.error_code;
        return (
          <li key={connector.connector_id} className="rounded bg-gray-50 px-3 py-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-gray-700">Connector {connector.connector_id}</span>
              <span className="font-medium text-gray-900">{status}</span>
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
