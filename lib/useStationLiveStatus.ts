"use client";

import { useEffect, useState } from "react";

import type { ConnectorOut, LiveEvent } from "./types";

/** One connector's live-merged view: REST's last-known status, overwritten by whatever a
 * `connector_status` event says next, plus the transaction currently open on it (if any). */
export interface LiveConnectorState extends ConnectorOut {
  transaction_id: number | null;
  latest_meter_value: number | null;
}

export type LiveConnectorsState = Record<number, LiveConnectorState>;

function wsBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_WS_BASE_URL;
  if (!url) {
    throw new Error("NEXT_PUBLIC_WS_BASE_URL is not set");
  }
  return url;
}

function applyEvent(state: LiveConnectorsState, event: LiveEvent): LiveConnectorsState {
  const connectorId = event.connector_id;
  const existing = state[connectorId] ?? {
    connector_id: connectorId,
    status: "Unavailable",
    error_code: "NoError",
    transaction_id: null,
    latest_meter_value: null,
  };

  switch (event.type) {
    case "connector_status":
      return {
        ...state,
        [connectorId]: {
          ...existing,
          status: event.data.status,
          error_code: event.data.error_code,
        },
      };
    case "transaction_started":
      return {
        ...state,
        [connectorId]: { ...existing, transaction_id: event.data.transaction_id },
      };
    case "transaction_stopped":
      return {
        ...state,
        [connectorId]: { ...existing, transaction_id: null, latest_meter_value: null },
      };
    case "meter_value": {
      const reading = event.data.meter_value as { value?: string | number } | null;
      const value = reading && "value" in reading ? Number(reading.value) : null;
      return {
        ...state,
        [connectorId]: {
          ...existing,
          latest_meter_value: Number.isFinite(value) ? (value as number) : existing.latest_meter_value,
        },
      };
    }
    // fault_opened/fault_cleared surface through the connector's own next connector_status
    // (main.py publishes both), and reservation_* don't change what this hook renders (§E
    // covers the panel's own status/meter display, not reservation bookkeeping) — no-op here.
    default:
      return state;
  }
}

/** Opens `WS /api/v1/ws/sites/{siteId}` (08 §G) for the lifetime of `siteId`, merging every
 * incoming event into per-connector state keyed by `connector_id` (10 §E, point 3). Cleans up
 * the socket both on unmount and whenever `siteId` changes — never leaves a stale socket open. */
export function useStationLiveStatus(siteId: string | null) {
  const [trackedSiteId, setTrackedSiteId] = useState(siteId);
  const [live, setLive] = useState<LiveConnectorsState>({});
  const [connected, setConnected] = useState(false);

  // Reset during render (not in the effect below) the moment `siteId` itself changes, so a
  // switch to a new site never briefly shows the previous site's live state.
  if (siteId !== trackedSiteId) {
    setTrackedSiteId(siteId);
    setLive({});
    setConnected(false);
  }

  useEffect(() => {
    if (!siteId) {
      return;
    }

    const socket = new WebSocket(`${wsBaseUrl()}/api/v1/ws/sites/${encodeURIComponent(siteId)}`);

    socket.addEventListener("open", () => setConnected(true));
    socket.addEventListener("close", () => setConnected(false));
    socket.addEventListener("message", (message) => {
      try {
        const event = JSON.parse(message.data) as LiveEvent;
        setLive((prev) => applyEvent(prev, event));
      } catch {
        // Malformed frame: ignore it, the next one will still arrive.
      }
    });

    return () => {
      socket.close();
    };
  }, [siteId]);

  return { live, connected };
}
