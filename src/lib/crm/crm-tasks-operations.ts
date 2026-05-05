import "server-only";

import { combineAppCalendarDateAndTimeToUtcIso } from "@/lib/datetime/app-timezone";
import { createServerSupabaseClient, getAuthenticatedUser } from "@/lib/supabase/server";
import type { CrmTaskListFilters } from "@/lib/crm/crm-task-types";
import type {
  CrmTaskPriority,
  CrmTaskRelatedType,
  CrmTaskRow,
  CrmTaskSource,
  CrmTaskStatus,
} from "@/lib/crm/crm-task-types";
import { addCalendarDaysToIsoDate, getCrmCalendarTodayIso } from "@/lib/crm/crm-local-date";

function sanitizeIlike(term: string): string {
  return term.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_").trim();
}

export function normalizeCrmListRowLimit(limit: unknown): number {
  const n = typeof limit === "number" ? limit : Number(limit);
  if (!Number.isFinite(n)) return 500;
  const cap = Math.max(1, Math.min(500, Math.floor(n)));
  return cap;
}

function mapRow(raw: Record<string, unknown>): CrmTaskRow | null {
  const id = typeof raw.id === "string" ? raw.id : null;
  const title = typeof raw.title === "string" ? raw.title : null;
  if (!id || !title) return null;
  const status = raw.status;
  const priority = raw.priority;
  const source = raw.source;
  if (
    status !== "open" &&
    status !== "in_progress" &&
    status !== "blocked" &&
    status !== "done" &&
    status !== "canceled"
  ) {
    return null;
  }
  if (priority !== "low" && priority !== "normal" && priority !== "high" && priority !== "urgent") {
    return null;
  }
  if (source !== "manual" && source !== "ai_voice_transcription" && source !== "ai_realtime") {
    return null;
  }
  let relType: CrmTaskRelatedType | null = null;
  if (raw.related_entity_type != null && raw.related_entity_type !== "") {
    const t = String(raw.related_entity_type);
    if (
      t === "lead" ||
      t === "recruit" ||
      t === "employee" ||
      t === "facility" ||
      t === "patient" ||
      t === "insurance_payer" ||
      t === "general"
    ) {
      relType = t;
    }
  }
  return {
    id,
    title,
    description: typeof raw.description === "string" ? raw.description : null,
    status,
    priority,
    due_at: typeof raw.due_at === "string" ? raw.due_at : null,
    related_entity_type: relType,
    related_entity_id: typeof raw.related_entity_id === "string" ? raw.related_entity_id : null,
    assigned_to: typeof raw.assigned_to === "string" ? raw.assigned_to : null,
    created_by: typeof raw.created_by === "string" ? raw.created_by : null,
    source,
    ai_transcript: typeof raw.ai_transcript === "string" ? raw.ai_transcript : null,
    completed_at: typeof raw.completed_at === "string" ? raw.completed_at : null,
    created_at: typeof raw.created_at === "string" ? raw.created_at : "",
    updated_at: typeof raw.updated_at === "string" ? raw.updated_at : "",
  };
}

/** List CRM tasks visible to the current session (RLS). */
export async function listCrmTasks(
  filters: CrmTaskListFilters
): Promise<{ ok: true; tasks: CrmTaskRow[] } | { ok: false; error: string }> {
  const supabase = await createServerSupabaseClient();
  const rowLimit = normalizeCrmListRowLimit(filters.result_limit ?? 500);
  let q = supabase.from("crm_tasks").select("*").order("created_at", { ascending: false }).limit(rowLimit);

  const pinnedLead = typeof filters.pinned_lead_id === "string" ? filters.pinned_lead_id.trim() : "";

  if (pinnedLead) {
    q = q.eq("related_entity_type", "lead").eq("related_entity_id", pinnedLead);
  } else {
    if (filters.related_entity_type != null) {
      q = q.eq("related_entity_type", filters.related_entity_type);
    }
    if (filters.related_entity_id != null && filters.related_entity_id.trim() !== "") {
      q = q.eq("related_entity_id", filters.related_entity_id.trim());
    }
  }

  if (filters.priority) {
    q = q.eq("priority", filters.priority);
  }

  const rawTerm = sanitizeIlike(filters.search ?? "");
  const term = rawTerm.length >= 2 ? rawTerm.slice(0, 120) : "";
  if (term.length > 0) {
    const p = `%${term}%`;
    q = q.or(`title.ilike.${p},description.ilike.${p}`);
  }

  switch (filters.tab) {
    case "open":
      q = q.in("status", ["open", "in_progress", "blocked"]);
      break;
    case "completed":
      q = q.eq("status", "done");
      break;
    case "due_today": {
      const todayIso = getCrmCalendarTodayIso();
      const tomorrowIso = addCalendarDaysToIsoDate(todayIso, 1);
      const start = combineAppCalendarDateAndTimeToUtcIso(todayIso, "00:00");
      const end = combineAppCalendarDateAndTimeToUtcIso(tomorrowIso, "00:00");
      if (start && end) {
        q = q.gte("due_at", start).lt("due_at", end).in("status", ["open", "in_progress", "blocked"]);
      }
      break;
    }
    case "overdue": {
      const nowIso = new Date().toISOString();
      q = q
        .not("due_at", "is", null)
        .lt("due_at", nowIso)
        .in("status", ["open", "in_progress", "blocked"]);
      break;
    }
    case "all":
    default:
      break;
  }

  const { data, error } = await q;
  if (error) {
    console.warn("[crm_tasks] list", error.message);
    return { ok: false, error: error.message };
  }
  const tasks = (data ?? [])
    .map((r) => mapRow(r as Record<string, unknown>))
    .filter((t): t is CrmTaskRow => t != null);
  return { ok: true, tasks };
}

/** Browser/server action payload — `source`, `completed_at`, and `created_by` are never accepted from callers. */
export type CreateCrmTaskInput = {
  title: string;
  description?: string | null;
  priority?: CrmTaskPriority;
  due_at?: string | null;
  related_entity_type?: CrmTaskRelatedType | null;
  related_entity_id?: string | null;
  assigned_to?: string | null;
};

export type CrmTaskCreateIntent = "manual" | "voice_review" | "realtime_bridge";

/** Internal inserts only — maps to `manual`, `ai_voice_transcription`, or `ai_realtime`. */
export async function createCrmTask(
  input: CreateCrmTaskInput,
  intent: CrmTaskCreateIntent,
  extras?: { voice_transcript?: string | null }
): Promise<{ ok: true; task: CrmTaskRow } | { ok: false; error: string }> {
  const user = await getAuthenticatedUser();
  if (!user) {
    return { ok: false, error: "Unauthorized" };
  }
  const title = (input.title ?? "").trim();
  if (!title) {
    return { ok: false, error: "Title required" };
  }

  const source: CrmTaskSource =
    intent === "voice_review" ? "ai_voice_transcription" : intent === "realtime_bridge" ? "ai_realtime" : "manual";

  let ai_transcript: string | null = null;
  if (intent === "voice_review") {
    const tx = extras?.voice_transcript?.trim() ?? "";
    if (!tx) return { ok: false, error: "Voice-reviewed tasks require transcript text" };
    ai_transcript = tx.slice(0, 350_000);
  }

  const supabase = await createServerSupabaseClient();
  const row = {
    title,
    description:
      input.description != null && String(input.description).trim() !== ""
        ? String(input.description)
        : null,
    status: "open" as CrmTaskStatus,
    priority: input.priority ?? "normal",
    due_at: input.due_at ?? null,
    related_entity_type: input.related_entity_type ?? null,
    related_entity_id: input.related_entity_id ?? null,
    assigned_to: input.assigned_to ?? null,
    source,
    ai_transcript,
    // Omit created_by — trigger sets auth.uid().
  };

  const { data, error } = await supabase.from("crm_tasks").insert(row).select("*").single();
  if (error) {
    console.warn("[crm_tasks] create", error.message);
    return { ok: false, error: error.message };
  }
  const task = mapRow(data as Record<string, unknown>);
  if (!task) return { ok: false, error: "Invalid row" };
  return { ok: true, task };
}

/** Allowed staff edits — status transitions must use workflow actions (`complete*` / `reopen*` / `cancel*`). */
export type StaffCrmTaskPatch = Partial<{
  title: string;
  description: string | null;
  priority: CrmTaskPriority;
  due_at: string | null;
  related_entity_type: CrmTaskRelatedType | null;
  related_entity_id: string | null;
  assigned_to: string | null;
}>;

type WorkflowCrmTaskStatusPatch = Partial<Pick<{ status: CrmTaskStatus }, "status">>;

export async function updateCrmTask(
  id: string,
  patch: StaffCrmTaskPatch | WorkflowCrmTaskStatusPatch,
  mode: "staff_fields" | "workflow"
): Promise<{ ok: true; task: CrmTaskRow } | { ok: false; error: string }> {
  const tid = id.trim();
  if (!tid) return { ok: false, error: "Missing id" };

  const clean: Record<string, unknown> = {};
  if (mode === "staff_fields") {
    const p = patch as StaffCrmTaskPatch;
    if (p.title !== undefined) clean.title = p.title.trim();
    if (p.description !== undefined) clean.description = p.description;
    if (p.priority !== undefined) clean.priority = p.priority;
    if (p.due_at !== undefined) clean.due_at = p.due_at;
    if (p.related_entity_type !== undefined) clean.related_entity_type = p.related_entity_type;
    if (p.related_entity_id !== undefined) clean.related_entity_id = p.related_entity_id;
    if (p.assigned_to !== undefined) clean.assigned_to = p.assigned_to;
  } else {
    const p = patch as WorkflowCrmTaskStatusPatch;
    const st = p.status;
    if (
      st === "open" ||
      st === "in_progress" ||
      st === "blocked" ||
      st === "done" ||
      st === "canceled"
    ) {
      clean.status = st;
    }
    // Trigger owns `completed_at` transitions alongside status.
  }

  const supabase = await createServerSupabaseClient();
  if (Object.keys(clean).length === 0) {
    const cur = await supabase.from("crm_tasks").select("*").eq("id", tid).maybeSingle();
    const task = cur.data ? mapRow(cur.data as Record<string, unknown>) : null;
    if (!task) return { ok: false, error: "Not found" };
    return { ok: true, task };
  }

  const { data, error } = await supabase
    .from("crm_tasks")
    .update(clean)
    .eq("id", tid)
    .select("*")
    .maybeSingle();
  if (error) {
    console.warn("[crm_tasks] update", error.message);
    return { ok: false, error: error.message };
  }
  const task = data ? mapRow(data as Record<string, unknown>) : null;
  if (!task) return { ok: false, error: "Not found" };
  return { ok: true, task };
}

export async function completeCrmTask(id: string): Promise<{ ok: true; task: CrmTaskRow } | { ok: false; error: string }> {
  return updateCrmTask(id, { status: "done" }, "workflow");
}

export async function reopenCrmTask(id: string): Promise<{ ok: true; task: CrmTaskRow } | { ok: false; error: string }> {
  return updateCrmTask(id, { status: "open" }, "workflow");
}

export async function cancelCrmTask(id: string): Promise<{ ok: true; task: CrmTaskRow } | { ok: false; error: string }> {
  return updateCrmTask(id, { status: "canceled" }, "workflow");
}
