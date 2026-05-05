"use server";

import { revalidatePath } from "next/cache";

import type { CreateCrmTaskInput, StaffCrmTaskPatch } from "@/lib/crm/crm-tasks-operations";
import { requireCrmTasksStaff } from "@/lib/crm/require-crm-tasks-staff";
import { crmVoiceSaveUserFacingMessage } from "@/lib/crm/crm-voice-save-client-message.server";
import { crmLogUserSuffix, logCrmVoiceSaveSafe } from "@/lib/crm/crm-voice-save-log.server";
import {
  cancelCrmTask,
  completeCrmTask,
  createCrmTask,
  listCrmTasks,
  reopenCrmTask,
  updateCrmTask,
} from "@/lib/crm/crm-tasks-operations";
import type { CrmTaskListFilters } from "@/lib/crm/crm-task-types";
import type { CrmTaskPriority, CrmTaskRelatedType } from "@/lib/crm/crm-task-types";

async function gate() {
  const g = await requireCrmTasksStaff();
  if (!g.ok) {
    return { ok: false as const, error: g.error };
  }
  return { ok: true as const, staff: g.staff };
}

export async function listCrmTasksAction(filters: CrmTaskListFilters) {
  const g = await gate();
  if (!g.ok) return { ok: false as const, error: g.error };
  return listCrmTasks(filters);
}

export async function createCrmTaskAction(input: CreateCrmTaskInput) {
  const g = await gate();
  if (!g.ok) return { ok: false as const, error: g.error };
  const r = await createCrmTask(input, "manual");
  if (r.ok) {
    revalidatePath("/admin/crm/tasks");
    if (input.related_entity_type === "lead" && input.related_entity_id) {
      revalidatePath(`/admin/crm/leads/${input.related_entity_id}`);
    }
  }
  return r;
}

export type VoiceReviewedDraftInput = {
  title: string;
  description?: string | null;
  due_at?: string | null;
  priority: CrmTaskPriority;
  related_entity_type?: CrmTaskRelatedType | null;
  related_entity_id?: string | null;
};

/** Multi-save from the voice review UI — pins one ai_transcript blob on every persisted row server-side (no spoofing). */
export async function saveVoiceReviewedCrmTasksAction(input: {
  ai_transcript: string;
  tasks: VoiceReviewedDraftInput[];
  fallback_related_entity_type?: CrmTaskRelatedType | null;
  fallback_related_entity_id?: string | null;
}) {
  try {
    const g = await gate();
    if (!g.ok) {
      logCrmVoiceSaveSafe("gate_denied", { reason: g.error });
      return { ok: false as const, error: crmVoiceSaveUserFacingMessage(g.error) };
    }

    const staffMeta = {
      user_suffix: crmLogUserSuffix(g.staff.user_id),
      staff_role: g.staff.role,
      staff_active: g.staff.is_active !== false,
    };

    const tx = (input.ai_transcript ?? "").trim();
    if (!tx) {
      logCrmVoiceSaveSafe("reject_empty_transcript", staffMeta);
      return { ok: false as const, error: crmVoiceSaveUserFacingMessage("Transcript missing") };
    }
    const list = Array.isArray(input.tasks) ? input.tasks : [];
    if (!list.length) {
      logCrmVoiceSaveSafe("reject_empty_task_list", staffMeta);
      return { ok: false as const, error: crmVoiceSaveUserFacingMessage("No tasks to save") };
    }

    logCrmVoiceSaveSafe("payload_in", {
      ...staffMeta,
      transcript_chars: tx.length,
      task_count: list.length,
      fallback_rel_type: input.fallback_related_entity_type ?? "",
      fallback_rel_id_present: Boolean(
        typeof input.fallback_related_entity_id === "string" && input.fallback_related_entity_id.trim()
      ),
      task_slots: list.map((d, i) => ({
        i,
        rel_type: d.related_entity_type ?? input.fallback_related_entity_type ?? "",
        rel_id_present: Boolean(
          (typeof d.related_entity_id === "string" ? d.related_entity_id : "").trim() ||
            (typeof input.fallback_related_entity_id === "string" ? input.fallback_related_entity_id : "").trim()
        ),
        priority: d.priority,
        due_present: Boolean(d.due_at && String(d.due_at).trim()),
        has_description: d.description != null && String(d.description).trim() !== "",
      })),
    });

    const touchedLeadIds = new Set<string>();
    let insertsAttempted = 0;

    for (let ti = 0; ti < list.length; ti++) {
      const d = list[ti];
      const title = (d.title ?? "").trim();
      if (!title) continue;

      insertsAttempted++;
      const relType = d.related_entity_type ?? input.fallback_related_entity_type ?? null;
      const relId = d.related_entity_id ?? input.fallback_related_entity_id ?? null;

      const created = await createCrmTask(
        {
          title,
          description: d.description ?? null,
          priority: d.priority,
          due_at: d.due_at ?? null,
          related_entity_type: relType,
          related_entity_id: relId,
          assigned_to: null,
        },
        "voice_review",
        { voice_transcript: tx }
      );
      if (!created.ok) {
        logCrmVoiceSaveSafe("create_rejected", {
          ...staffMeta,
          task_index: ti,
          create_error: created.error,
        });
        return {
          ok: false as const,
          error: crmVoiceSaveUserFacingMessage(created.error),
        };
      }
      if (created.task.related_entity_type === "lead" && created.task.related_entity_id) {
        touchedLeadIds.add(created.task.related_entity_id);
      }
    }

    if (insertsAttempted === 0) {
      logCrmVoiceSaveSafe("no_nonempty_titles", { ...staffMeta, task_count: list.length });
      return { ok: false as const, error: crmVoiceSaveUserFacingMessage("No tasks with a title") };
    }

    revalidatePath("/admin/crm/tasks");
    for (const lid of touchedLeadIds) {
      revalidatePath(`/admin/crm/leads/${lid}`);
    }

    logCrmVoiceSaveSafe("batch_ok", { ...staffMeta, insertsAttempted });

    return { ok: true as const };
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown_error";
    logCrmVoiceSaveSafe("action_throw", { message });
    console.warn("[crm_voice_save] action_throw", e);
    return {
      ok: false as const,
      error: "Database save failed. Check server logs for [crm_voice_save].",
    };
  }
}

export async function updateCrmTaskAction(id: string, patch: StaffCrmTaskPatch) {
  const g = await gate();
  if (!g.ok) return { ok: false as const, error: g.error };
  const r = await updateCrmTask(id, patch, "staff_fields");
  if (r.ok) {
    revalidatePath("/admin/crm/tasks");
    const rel = r.task.related_entity_id;
    if (r.task.related_entity_type === "lead" && rel) {
      revalidatePath(`/admin/crm/leads/${rel}`);
    }
  }
  return r;
}

export async function completeCrmTaskAction(id: string) {
  const g = await gate();
  if (!g.ok) return { ok: false as const, error: g.error };
  const r = await completeCrmTask(id);
  if (r.ok) {
    revalidatePath("/admin/crm/tasks");
    const rel = r.task.related_entity_id;
    if (r.task.related_entity_type === "lead" && rel) {
      revalidatePath(`/admin/crm/leads/${rel}`);
    }
  }
  return r;
}

export async function reopenCrmTaskAction(id: string) {
  const g = await gate();
  if (!g.ok) return { ok: false as const, error: g.error };
  const r = await reopenCrmTask(id);
  if (r.ok) {
    revalidatePath("/admin/crm/tasks");
    const rel = r.task.related_entity_id;
    if (r.task.related_entity_type === "lead" && rel) {
      revalidatePath(`/admin/crm/leads/${rel}`);
    }
  }
  return r;
}

export async function cancelCrmTaskAction(id: string) {
  const g = await gate();
  if (!g.ok) return { ok: false as const, error: g.error };
  const r = await cancelCrmTask(id);
  if (r.ok) {
    revalidatePath("/admin/crm/tasks");
    const rel = r.task.related_entity_id;
    if (r.task.related_entity_type === "lead" && rel) {
      revalidatePath(`/admin/crm/leads/${rel}`);
    }
  }
  return r;
}
