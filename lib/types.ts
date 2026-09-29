/**
 * Mirrors api/schemas.py exactly (08-public-api-service.md §F) plus the Redis event envelope
 * (§E.2). Keep in lockstep with that file — a change to either without the other is a contract
 * break.
 */

export type SiteType = "gas_station" | "hotel" | "parking" | "other" | "standalone";
export type SiteSource = "operator" | "external_reference";
export type AggregateStatus =
  | "available"
  | "occupied"
  | "reserved"
  | "faulted"
  | "unavailable"
  | "unknown";

export interface SiteSummary {
  id: string;
  name: string;
  site_type: SiteType;
  source: SiteSource;
  latitude: number;
  longitude: number;
  connector_types: string[] | null;
  charge_point_count: number;
  aggregate_status: AggregateStatus;
}

export interface ConnectorOut {
  connector_id: number;
  status: string;
  error_code: string;
}

export interface ChargePointInSite {
  identity: string;
  connectors: ConnectorOut[];
}

export interface SiteDetail {
  id: string;
  name: string;
  site_type: SiteType;
  source: SiteSource;
  latitude: number;
  longitude: number;
  address: string | null;
  connector_types: string[] | null;
  charge_points: ChargePointInSite[];
}

export interface CurrentTransaction {
  transaction_id: number;
  meter_start: number;
  latest_meter_value: number | null;
}

export interface ChargePointDetail {
  identity: string;
  site_id: string | null;
  connectors: ConnectorOut[];
  current_transaction: CurrentTransaction | null;
}

/** One JSON object published on Redis's `charging-events` channel, forwarded verbatim over the
 * WebSocket (08 §E.2 / §G). `connector_id` and `data`'s shape both depend on `type`. */
export type LiveEventType =
  | "connector_status"
  | "transaction_started"
  | "transaction_stopped"
  | "meter_value"
  | "fault_opened"
  | "fault_cleared"
  | "reservation_created"
  | "reservation_released";

export interface LiveEventDataByType {
  connector_status: { status: string; error_code: string };
  transaction_started: { transaction_id: number; id_tag: string; meter_start: number };
  transaction_stopped: { transaction_id: number; meter_stop: number };
  meter_value: { transaction_id: number; meter_value: unknown };
  fault_opened: { error_code: string; info: string | null };
  fault_cleared: Record<string, never>;
  reservation_created: { reservation_id: string; id_tag: string; expiry_date: string };
  reservation_released: { reservation_id: string; reason: "consumed" | "cancelled" | "expired" };
}

export type LiveEvent = {
  [T in LiveEventType]: {
    type: T;
    charge_point_identity: string;
    connector_id: number;
    at: string;
    data: LiveEventDataByType[T];
  };
}[LiveEventType];
