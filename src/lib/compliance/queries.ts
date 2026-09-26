import "server-only";

import { supabaseAdmin } from "@/lib/admin";
import { quarterBounds, quarterRangeIso } from "@/lib/compliance/period";
import { countsFromIncidentTypes, type QapiLiveCounts } from "@/lib/compliance/status";
import type {
  AttestationRow,
  DrillRow,
  EmergencyReviewRow,
  IncidentRow,
  MeetingRow,
  NaMark,
  OnCallRow,
  ProjectRow,
  ProjectUpdateRow,
  QapiReviewRow,
  SafetyRow,
  YearSummary,
} from "@/lib/compliance/types";

export async function readCompliance<T>(
  work: () => Promise<T>
): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  try {
    return { ok: true, data: await work() };
  } catch (error) {
    const message = error instanceof ComplianceDataError ? error.message : "Compliance Logs could not be loaded.";
    return { ok: false, message };
  }
}

export class ComplianceDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ComplianceDataError";
  }
}

function throwIf(error: { message: string } | null): void {
  if (!error) return;
  if (/does not exist|schema cache/i.test(error.message)) {
    throw new ComplianceDataError(
      "Compliance Logs tables are not in the database yet. Apply migration supabase/migrations/20260923120000_compliance_logs.sql."
    );
  }
  throw new ComplianceDataError(error.message);
}

export async function loadYearSummary(year: number): Promise<YearSummary> {
  const { start } = quarterRangeIso(year, 1);
  const yearEnd = quarterRangeIso(year, 4).end;
  const [meetings, safety, reviews, drills, qapi, onCall, attestations, incidents, projects, naMarks] =
    await Promise.all([
      supabaseAdmin.from("compliance_meetings").select("quarter, status").eq("year", year),
      supabaseAdmin.from("compliance_safety_checks").select("quarter, status").eq("year", year),
      supabaseAdmin.from("compliance_emergency_reviews").select("quarter, status").eq("year", year),
      supabaseAdmin.from("compliance_emergency_drills").select("quarter, status").eq("year", year),
      supabaseAdmin.from("compliance_qapi_reviews").select("quarter, status").eq("year", year),
      supabaseAdmin
        .from("compliance_on_call_logs")
        .select("occurred_at")
        .gte("occurred_at", start)
        .lt("occurred_at", yearEnd),
      supabaseAdmin
        .from("compliance_on_call_attestations")
        .select("period_kind, quarter, month")
        .eq("year", year),
      supabaseAdmin
        .from("compliance_incident_logs")
        .select("occurred_on")
        .gte("occurred_on", `${year}-01-01`)
        .lte("occurred_on", `${year}-12-31`),
      supabaseAdmin
        .from("compliance_qapi_projects")
        .select("id, project_name, status, updated_at")
        .order("updated_at", { ascending: false }),
      supabaseAdmin.from("compliance_na_marks").select("quarter, item_key").eq("year", year),
    ]);

  for (const result of [meetings, safety, reviews, drills, qapi, onCall, attestations, incidents, projects, naMarks]) {
    throwIf(result.error);
  }

  return {
    meetings: meetings.data ?? [],
    safety: safety.data ?? [],
    reviews: reviews.data ?? [],
    drills: drills.data ?? [],
    qapi: qapi.data ?? [],
    onCallAt: (onCall.data ?? []).map((row) => row.occurred_at as string),
    attestations: attestations.data ?? [],
    incidentDates: (incidents.data ?? []).map((row) => row.occurred_on as string),
    projects: projects.data ?? [],
    naMarks: naMarks.data ?? [],
  };
}

export async function listMeetings(year: number, quarter: number): Promise<MeetingRow[]> {
  const { data, error } = await supabaseAdmin
    .from("compliance_meetings")
    .select("*")
    .eq("year", year)
    .eq("quarter", quarter)
    .order("meeting_date", { ascending: false, nullsFirst: false });
  throwIf(error);
  return (data ?? []) as MeetingRow[];
}

export async function getMeeting(id: string): Promise<MeetingRow | null> {
  const { data, error } = await supabaseAdmin.from("compliance_meetings").select("*").eq("id", id).maybeSingle();
  throwIf(error);
  return (data as MeetingRow | null) ?? null;
}

export async function listOnCall(startIso: string, endIso: string): Promise<OnCallRow[]> {
  const { data, error } = await supabaseAdmin
    .from("compliance_on_call_logs")
    .select("*")
    .gte("occurred_at", startIso)
    .lt("occurred_at", endIso)
    .order("occurred_at", { ascending: false });
  throwIf(error);
  return (data ?? []) as OnCallRow[];
}

export async function getOnCall(id: string): Promise<OnCallRow | null> {
  const { data, error } = await supabaseAdmin.from("compliance_on_call_logs").select("*").eq("id", id).maybeSingle();
  throwIf(error);
  return (data as OnCallRow | null) ?? null;
}

export async function getAttestation(
  kind: "quarter" | "month",
  year: number,
  period: number
): Promise<AttestationRow | null> {
  let query = supabaseAdmin.from("compliance_on_call_attestations").select("*").eq("period_kind", kind).eq("year", year);
  query = kind === "quarter" ? query.eq("quarter", period) : query.eq("month", period);
  const { data, error } = await query.maybeSingle();
  throwIf(error);
  return (data as AttestationRow | null) ?? null;
}

export async function getSafety(year: number, quarter: number): Promise<SafetyRow | null> {
  const { data, error } = await supabaseAdmin
    .from("compliance_safety_checks")
    .select("*")
    .eq("year", year)
    .eq("quarter", quarter)
    .maybeSingle();
  throwIf(error);
  return (data as SafetyRow | null) ?? null;
}

export async function getEmergencyReview(year: number, quarter: number): Promise<EmergencyReviewRow | null> {
  const { data, error } = await supabaseAdmin
    .from("compliance_emergency_reviews")
    .select("*")
    .eq("year", year)
    .eq("quarter", quarter)
    .maybeSingle();
  throwIf(error);
  return (data as EmergencyReviewRow | null) ?? null;
}

export async function listDrills(year: number, quarter?: number): Promise<DrillRow[]> {
  let query = supabaseAdmin.from("compliance_emergency_drills").select("*").eq("year", year);
  if (quarter) query = query.eq("quarter", quarter);
  const { data, error } = await query.order("exercise_date", { ascending: false, nullsFirst: false });
  throwIf(error);
  return (data ?? []) as DrillRow[];
}

export async function getDrill(id: string): Promise<DrillRow | null> {
  const { data, error } = await supabaseAdmin.from("compliance_emergency_drills").select("*").eq("id", id).maybeSingle();
  throwIf(error);
  return (data as DrillRow | null) ?? null;
}

export async function getQapiReview(year: number, quarter: number): Promise<QapiReviewRow | null> {
  const { data, error } = await supabaseAdmin
    .from("compliance_qapi_reviews")
    .select("*")
    .eq("year", year)
    .eq("quarter", quarter)
    .maybeSingle();
  throwIf(error);
  return (data as QapiReviewRow | null) ?? null;
}

export async function incidentTypesBetween(startYmd: string, endYmd: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from("compliance_incident_logs")
    .select("incident_type")
    .gte("occurred_on", startYmd)
    .lte("occurred_on", endYmd);
  throwIf(error);
  return (data ?? []).map((row) => row.incident_type as string);
}

export async function qapiLiveCounts(year: number, quarter: number): Promise<QapiLiveCounts> {
  const { start, end } = quarterBounds(year, quarter);
  return countsFromIncidentTypes(await incidentTypesBetween(start, end));
}

export async function listProjects(): Promise<ProjectRow[]> {
  const { data, error } = await supabaseAdmin
    .from("compliance_qapi_projects")
    .select("*")
    .order("updated_at", { ascending: false });
  throwIf(error);
  return (data ?? []) as ProjectRow[];
}

export async function getActiveProject(): Promise<ProjectRow | null> {
  const { data, error } = await supabaseAdmin
    .from("compliance_qapi_projects")
    .select("*")
    .in("status", ["planning", "active", "monitoring"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  throwIf(error);
  return (data as ProjectRow | null) ?? null;
}

export async function getProject(id: string): Promise<{ project: ProjectRow; updates: ProjectUpdateRow[] } | null> {
  const { data, error } = await supabaseAdmin.from("compliance_qapi_projects").select("*").eq("id", id).maybeSingle();
  throwIf(error);
  if (!data) return null;
  const updates = await supabaseAdmin
    .from("compliance_qapi_project_updates")
    .select("*")
    .eq("project_id", id)
    .order("update_date", { ascending: false })
    .order("created_at", { ascending: false });
  throwIf(updates.error);
  return { project: data as ProjectRow, updates: (updates.data ?? []) as ProjectUpdateRow[] };
}

export async function listIncidents(startYmd: string, endYmd: string): Promise<IncidentRow[]> {
  const { data, error } = await supabaseAdmin
    .from("compliance_incident_logs")
    .select("*")
    .gte("occurred_on", startYmd)
    .lte("occurred_on", endYmd)
    .order("occurred_on", { ascending: false });
  throwIf(error);
  return (data ?? []) as IncidentRow[];
}

export async function getIncident(id: string): Promise<IncidentRow | null> {
  const { data, error } = await supabaseAdmin.from("compliance_incident_logs").select("*").eq("id", id).maybeSingle();
  throwIf(error);
  return (data as IncidentRow | null) ?? null;
}

export async function listNaMarks(year: number, quarter: number): Promise<NaMark[]> {
  const { data, error } = await supabaseAdmin
    .from("compliance_na_marks")
    .select("*")
    .eq("year", year)
    .eq("quarter", quarter);
  throwIf(error);
  return (data ?? []) as NaMark[];
}

export function activeProjectFromSummary(projects: YearSummary["projects"]): YearSummary["projects"][number] | null {
  return projects.find((project) => project.status !== "completed") ?? projects[0] ?? null;
}
