import type { ExpressionSpecification } from "@maplibre/maplibre-gl-style-spec";

import type { AggregateStatus } from "./types";

/** 10-frontend-nextjs.md §F.2's fixed palette — the one place `aggregate_status` maps to a
 * colour, reused by both individual-pin and cluster styling so the two never drift apart. */
export const STATUS_COLORS: Record<AggregateStatus, string> = {
  available: "#22c55e",
  occupied: "#f59e0b",
  reserved: "#8b5cf6",
  faulted: "#ef4444",
  unavailable: "#6b7280",
  unknown: "#d1d5db",
};

/** Same precedence order 08-public-api-service.md §F defines for a single site's
 * aggregate_status, reused here for optional cluster tinting (§G.3): first match wins. */
export const STATUS_PRECEDENCE: AggregateStatus[] = [
  "faulted",
  "available",
  "reserved",
  "occupied",
  "unavailable",
  "unknown",
];

/** A MapLibre `match` expression on the `aggregate_status` feature property, for use as a
 * `circle-color` (or equivalent) paint property — data-driven styling, not per-marker JS. */
export function statusColorExpression(property = "aggregate_status"): ExpressionSpecification {
  const expression: unknown[] = ["match", ["get", property]];
  for (const [status, color] of Object.entries(STATUS_COLORS)) {
    expression.push(status, color);
  }
  expression.push(STATUS_COLORS.unknown);
  return expression as ExpressionSpecification;
}
