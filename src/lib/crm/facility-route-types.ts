export const ROUTE_PLAN_STATUSES = ["draft", "planned", "in_progress", "completed", "canceled"] as const;
export type RoutePlanStatus = (typeof ROUTE_PLAN_STATUSES)[number];

export const ROUTE_STOP_STATUSES = ["pending", "checked_in", "completed", "skipped", "canceled"] as const;
export type RouteStopStatus = (typeof ROUTE_STOP_STATUSES)[number];

export const ROUTE_SKIP_REASONS = [
  "Closed",
  "No time",
  "Wrong address",
  "Not interested",
  "Duplicate facility",
  "Other",
] as const;
export type RouteSkipReason = (typeof ROUTE_SKIP_REASONS)[number];

export type RoutePlanRow = {
  id: string;
  name: string;
  route_date: string;
  assigned_rep_id: string | null;
  created_by: string | null;
  status: RoutePlanStatus;
  start_latitude: number | null;
  start_longitude: number | null;
  start_address: string | null;
  started_at: string | null;
  completed_at: string | null;
  completed_by: string | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type RouteStopRow = {
  id: string;
  route_plan_id: string;
  stop_order: number;
  facility_id: string | null;
  google_place_id: string | null;
  name: string;
  address: string | null;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
  source: string | null;
  portal_status: string | null;
  status: RouteStopStatus;
  planned_arrival_at: string | null;
  checked_in_at: string | null;
  checked_in_latitude: number | null;
  checked_in_longitude: number | null;
  checked_out_at: string | null;
  completed_at: string | null;
  skipped_at: string | null;
  skip_reason: string | null;
  linked_activity_id: string | null;
  linked_photo_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type RoutePlanCard = RoutePlanRow & {
  assigned_rep_label: string | null;
  created_by_label: string | null;
  stop_count: number;
  pending_count: number;
  completed_count: number;
  skipped_count: number;
  checked_in_count: number;
};

export type RoutePlanDetail = RoutePlanCard & {
  stops: RouteStopCard[];
};

export type RouteStopCard = RouteStopRow & {
  distance_miles: number | null;
};

export type CreateRoutePlanStopInput = {
  facility_id?: string | null;
  google_place_id?: string | null;
  name: string;
  address?: string | null;
  phone?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  source?: string | null;
  portal_status?: string | null;
  notes?: string | null;
};

export type CreateRoutePlanInput = {
  name: string;
  route_date: string;
  assigned_rep_id?: string | null;
  notes?: string | null;
  start_latitude?: number | null;
  start_longitude?: number | null;
  start_address?: string | null;
  status?: RoutePlanStatus;
  stops: CreateRoutePlanStopInput[];
  metadata?: Record<string, unknown> | null;
};

export type RoutePerformanceSummary = {
  routesPlanned: number;
  routesStarted: number;
  routesCompleted: number;
  stopsPlanned: number;
  stopsCompleted: number;
  stopsSkipped: number;
  completionRate: number | null;
  avgStopsPerRoute: number | null;
  visitsLoggedFromRoute: number;
  photoProofFromRoute: number;
  referralsFromRoute: number;
};

export const ROUTE_PLAN_STATUS_LABELS: Record<RoutePlanStatus, string> = {
  draft: "Draft",
  planned: "Planned",
  in_progress: "In progress",
  completed: "Completed",
  canceled: "Canceled",
};

export const ROUTE_STOP_STATUS_LABELS: Record<RouteStopStatus, string> = {
  pending: "Pending",
  checked_in: "Checked in",
  completed: "Completed",
  skipped: "Skipped",
  canceled: "Canceled",
};
