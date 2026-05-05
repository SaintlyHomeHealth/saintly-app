import "server-only";

import "server-only";

import { supabaseAdmin } from "@/lib/admin";
import { completeCrmTask, createCrmTask, listCrmTasks } from "@/lib/crm/crm-tasks-operations";
import { buildContactSearchOrClause } from "@/lib/crm/crm-leads-search";
import { contactRowsActiveOnly } from "@/lib/crm/contacts-active";
import { leadRowsActiveOnly } from "@/lib/crm/leads-active";
import type { CrmTaskPriority, CrmTaskRelatedType } from "@/lib/crm/crm-task-types";
import {
  consumePendingTaskCompleteToken,
  consumePendingTaskPrepareToken,
  mintPendingToken,
} from "@/lib/crm/realtime-crm-pending-token";

export const SAINTLY_CRM_REALTIME_TOOLS: readonly Record<string, unknown>[] = [
  {
    type: "function",
    name: "get_current_context",
    description:
      "Return CRM UI context from the browser (lead on lead pages). Call when you must know active record linkage.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    type: "function",
    name: "prepare_create_task",
    description:
      "Draft a CRM task token. Announce summary and explicitly ask confirmation; only commit after verbal yes.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        due_at_iso: { type: "string" },
        priority: { type: "string", enum: ["low", "normal", "high", "urgent"] },
        related_entity_type: {
          type: "string",
          enum: ["lead", "recruit", "employee", "facility", "patient", "insurance_payer", "general"],
        },
        related_entity_id: { type: "string" },
      },
      required: ["title", "priority"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "commit_create_task",
    description: "Save task after verbal confirmation.",
    parameters: {
      type: "object",
      properties: { pending_token: { type: "string" } },
      required: ["pending_token"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "list_tasks",
    description:
      "List tasks read-only (scope: today|overdue|open). Today uses America/Phoenix calendar days.",
    parameters: {
      type: "object",
      properties: { scope: { type: "string", enum: ["today", "overdue", "open"] } },
      required: ["scope"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "prepare_complete_task",
    description: "Stage finishing a task; confirm aloud before committing.",
    parameters: {
      type: "object",
      properties: { task_id: { type: "string" } },
      required: ["task_id"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "commit_complete_task",
    description: "Mark staged task done after verbal confirmation.",
    parameters: {
      type: "object",
      properties: { pending_token: { type: "string" } },
      required: ["pending_token"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "search_leads",
    description:
      "Search leads by contact name/phone/email (max 15). No billing or PHI beyond visible fields.",
    parameters: {
      type: "object",
      properties: { query: { type: "string" }, limit: { type: "number" } },
      required: ["query"],
      additionalProperties: false,
    },
  },
];

export type SaintlyRealtimeToolContext = {
  lead_id: string | null;
  recruit_id: string | null;
  employee_id: string | null;
  facility_id: string | null;
  patient_id: string | null;
  insurance_payer_id: string | null;
};

function isPriority(s: unknown): s is CrmTaskPriority {
  return s === "low" || s === "normal" || s === "high" || s === "urgent";
}

function isRelatedType(s: unknown): s is CrmTaskRelatedType {
  return (
    s === "lead" ||
    s === "recruit" ||
    s === "employee" ||
    s === "facility" ||
    s === "patient" ||
    s === "insurance_payer" ||
    s === "general"
  );
}

async function execSearchLeads(query: string, limitRaw: unknown) {
  const q = query.trim();
  if (!q) return { ok: true as const, leads: [] as { lead_id: string; label: string }[] };

  let limit = typeof limitRaw === "number" && Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 12;
  limit = Math.min(15, Math.max(5, limit));

  const contactOr = buildContactSearchOrClause(q);
  if (!contactOr) {
    return { ok: true as const, leads: [] as { lead_id: string; label: string }[] };
  }

  const { data: hits, error: contactErr } = await contactRowsActiveOnly(
    supabaseAdmin.from("contacts").select("id").or(contactOr).limit(300)
  );
  if (contactErr) {
    console.warn("[realtime-tools] search_leads contacts", contactErr.message);
    return { ok: false as const, error: contactErr.message };
  }

  const contactIds = [...new Set((hits ?? []).map((h) => String((h as { id?: unknown }).id)).filter(Boolean))];
  if (contactIds.length === 0) {
    return { ok: true as const, leads: [] as { lead_id: string; label: string }[] };
  }

  const { data, error } = await leadRowsActiveOnly(
    supabaseAdmin
      .from("leads")
      .select(`id, contact_id, contacts:contact_id(full_name, first_name, last_name, primary_phone, email)`)
      .in("contact_id", contactIds)
      .limit(limit)
  );

  if (error) {
    console.warn("[realtime-tools] search_leads", error.message);
    return { ok: false as const, error: error.message };
  }

  type Emb = Record<string, unknown>;
  type Row = { id: string; contacts: Emb | Emb[] | null };

  function labelFromContact(c: Emb): string {
    const fn = typeof c.full_name === "string" ? c.full_name.trim() : "";
    if (fn) return fn;
    const f = typeof c.first_name === "string" ? c.first_name : "";
    const ln = typeof c.last_name === "string" ? c.last_name : "";
    const phone = typeof c.primary_phone === "string" ? c.primary_phone.trim() : "";
    const joined = `${f} ${ln}`.trim();
    const base = `${joined || "Lead"}`;
    return phone ? `${base} · ${phone}` : base;
  }

  const leads: { lead_id: string; label: string }[] = [];

  for (const raw of data ?? []) {
    const r = raw as Row;
    if (!r.id) continue;
    let emb: Emb | null = null;
    if (Array.isArray(r.contacts)) emb = r.contacts[0] ?? null;
    else emb = r.contacts;
    const lbl = emb && typeof emb === "object" ? `${labelFromContact(emb)} (${r.id.slice(0, 8)}…)` : r.id;
    leads.push({ lead_id: r.id, label: lbl.slice(0, 260) });
  }

  return { ok: true as const, leads };
}

function deriveDefaultRelated(
  ctx: SaintlyRealtimeToolContext
): { type: CrmTaskRelatedType; id: string } | { type: null; id: null } {
  if (ctx.lead_id?.trim()) return { type: "lead", id: ctx.lead_id.trim() };
  if (ctx.patient_id?.trim()) return { type: "patient", id: ctx.patient_id.trim() };
  if (ctx.employee_id?.trim()) return { type: "employee", id: ctx.employee_id.trim() };
  if (ctx.facility_id?.trim()) return { type: "facility", id: ctx.facility_id.trim() };
  if (ctx.recruit_id?.trim()) return { type: "recruit", id: ctx.recruit_id.trim() };
  if (ctx.insurance_payer_id?.trim())
    return { type: "insurance_payer", id: ctx.insurance_payer_id.trim() };
  return { type: null, id: null };
}

function okOut(payload: Record<string, unknown>): { ok: true; outputJson: string } {
  return { ok: true, outputJson: JSON.stringify(payload) };
}

function failOut(message: string): { ok: false; outputJson: string } {
  return { ok: false, outputJson: JSON.stringify({ error: message }) };
}

/** Handles one Realtime function call via user-scoped mutations (cookies / RLS). */
export async function dispatchSaintlyRealtimeCrmTool(opts: {
  toolName: string;
  rawArgsJson: string;
  actorUserId: string;
  sessionContext: SaintlyRealtimeToolContext;
}): Promise<{ ok: true; outputJson: string } | { ok: false; outputJson: string }> {
  let args: unknown;
  try {
    args = JSON.parse(opts.rawArgsJson) as unknown;
  } catch {
    return failOut("arguments must be JSON");
  }

  const ctx = opts.sessionContext;
  const tool = opts.toolName;

  if (tool === "get_current_context") {
    const rel = deriveDefaultRelated(ctx);
    return okOut({
      lead_id: ctx.lead_id,
      recruit_id: ctx.recruit_id,
      employee_id: ctx.employee_id,
      facility_id: ctx.facility_id,
      patient_id: ctx.patient_id,
      insurance_payer_id: ctx.insurance_payer_id,
      default_related_entity_type: rel.type,
      default_related_entity_id: rel.id,
      note:
        "Do not fax, send email, delete records permanently, change billing claims, admit patients, or alter NOA from voice without separate in-app review.",
    });
  }

  if (tool === "prepare_create_task") {
    if (!args || typeof args !== "object") return failOut("Invalid args");
    const a = args as Record<string, unknown>;
    const title = typeof a.title === "string" ? a.title.trim() : "";
    if (!title) return failOut("title required");
    const priority = isPriority(a.priority) ? a.priority : null;
    if (!priority) return failOut("priority required");
    const description =
      typeof a.description === "string" && a.description.trim() ? a.description.trim() : null;

    let due_at: string | null = null;
    if (typeof a.due_at_iso === "string" && a.due_at_iso.trim()) {
      const d = new Date(a.due_at_iso.trim());
      due_at = Number.isNaN(d.getTime()) ? null : d.toISOString();
    }

    let relType =
      typeof a.related_entity_type === "string" && isRelatedType(a.related_entity_type.trim())
        ? (a.related_entity_type.trim() as CrmTaskRelatedType)
        : null;
    let relId =
      typeof a.related_entity_id === "string" && a.related_entity_id.trim()
        ? a.related_entity_id.trim()
        : null;

    const dflt = deriveDefaultRelated(ctx);
    if (!relType) relType = dflt.type;
    if (!relId) relId = dflt.id;

    const now = Date.now();
    const pending = mintPendingToken({
      kind: "crm_task_prepare",
      actor_user_id: opts.actorUserId,
      title,
      description,
      due_at,
      priority,
      related_entity_type: relType,
      related_entity_id: relId,
      created_at_ms: now,
    });
    if (!pending) return failOut("Cannot mint pending token");

    const summary = `${title}${due_at ? `, due ${due_at}` : ""}${relType ? `, relating to ${relType}` : ""}`;

    return okOut({
      pending_token: pending,
      spoken_summary_to_confirm: summary,
      instruction:
        'Say: “Should I save this task?” Wait for confirmation like “yes” before calling commit_create_task.',
    });
  }

  if (tool === "commit_create_task") {
    const a = args && typeof args === "object" && !Array.isArray(args) ? (args as Record<string, unknown>) : null;
    const pt = a?.pending_token;
    const token = typeof pt === "string" ? pt : "";
    const payload = consumePendingTaskPrepareToken(token, opts.actorUserId);
    if (!payload) return failOut("Invalid or expired token — rerun prepare_create_task");

    let relType =
      typeof payload.related_entity_type === "string" && isRelatedType(payload.related_entity_type)
        ? payload.related_entity_type
        : null;
    let relId = typeof payload.related_entity_id === "string" ? payload.related_entity_id : null;
    if (!relType && !relId) {
      const d = deriveDefaultRelated(ctx);
      relType = d.type;
      relId = d.id;
    }

    const prio = isPriority(payload.priority) ? payload.priority : "normal";
    const r = await createCrmTask(
      {
        title: payload.title,
        description: payload.description,
        due_at: payload.due_at,
        priority: prio,
        related_entity_type: relType,
        related_entity_id: relId,
      },
      "realtime_bridge"
    );
    if (!r.ok) return failOut(r.error);
    return okOut({ saved_task_id: r.task.id });
  }

  if (tool === "list_tasks") {
    if (!args || typeof args !== "object") return failOut("Invalid args");
    const scope = (args as Record<string, unknown>).scope;
    if (scope !== "today" && scope !== "overdue" && scope !== "open") {
      return failOut("invalid scope");
    }
    const tab = scope === "today" ? "due_today" : scope === "overdue" ? "overdue" : "open";
    const lr = await listCrmTasks({ tab, search: "" });
    if (!lr.ok) return failOut(lr.error);
    return okOut({
      tasks: lr.tasks.slice(0, 50).map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        due_at: t.due_at,
      })),
    });
  }

  if (tool === "prepare_complete_task") {
    if (!args || typeof args !== "object") return failOut("Invalid args");
    const a = args as Record<string, unknown>;
    const tid = a.task_id;
    const task_id = typeof tid === "string" ? tid.trim() : "";
    if (!task_id) return failOut("task_id required");
    const pending = mintPendingToken({
      kind: "crm_task_complete",
      actor_user_id: opts.actorUserId,
      task_id,
      created_at_ms: Date.now(),
    });
    if (!pending) return failOut("Cannot mint pending token");
    return okOut({
      pending_token: pending,
      instruction: 'Announce which task to complete and ask “Should I mark it done?” before committing.',
    });
  }

  if (tool === "commit_complete_task") {
    const a = args && typeof args === "object" && !Array.isArray(args) ? (args as Record<string, unknown>) : null;
    const pt = a?.pending_token;
    const token = typeof pt === "string" ? pt : "";
    const payload = consumePendingTaskCompleteToken(token, opts.actorUserId);
    if (!payload) return failOut("Invalid or expired token");
    const r = await completeCrmTask(payload.task_id);
    if (!r.ok) return failOut(r.error);
    return okOut({ completed_task_id: r.task.id });
  }

  if (tool === "search_leads") {
    if (!args || typeof args !== "object") return failOut("Invalid args");
    const a = args as Record<string, unknown>;
    const qRaw = a.query;
    const qStr = typeof qRaw === "string" ? qRaw : "";
    const lim = a.limit;
    const res = await execSearchLeads(qStr, lim);
    if (!res.ok) return failOut(res.error ?? "search failed");
    return okOut({ leads: res.leads });
  }

  return failOut("Unknown tool");
}
