"use server";

import { revalidatePath } from "next/cache";

import type { CreateCrmTaskInput, StaffCrmTaskPatch } from "@/lib/crm/crm-tasks-operations";

export type { CreateCrmTaskInput, StaffCrmTaskPatch as CrmTaskPatch };
import { requireCrmTasksStaff } from "@/lib/crm/require-crm-tasks-staff";
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
  const g = await gate();
  if (!g.ok) return { ok: false as const, error: g.error };
  const tx = (input.ai_transcript ?? "").trim();
  if (!tx) return { ok: false as const, error: "Transcript missing" };
  const list = Array.isArray(input.tasks) ? input.tasks : [];
  if (!list.length) return { ok: false as const, error: "No tasks to save" };

  const touchedLeadIds = new Set<string>();

  for (const d of list) {
    const title = (d.title ?? "").trim();
    if (!title) continue;

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
    if (!created.ok) return { ok: false as const, error: created.error };
    if (created.task.related_entity_type === "lead" && created.task.related_entity_id) {
      touchedLeadIds.add(created.task.related_entity_id);
    }
  }

  revalidatePath("/admin/crm/tasks");
  for (const lid of touchedLeadIds) {
    revalidatePath(`/admin/crm/leads/${lid}`);
  }
  return { ok: true as const };
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
