import "server-only";

import { supabaseAdmin } from "@/lib/admin";
import type {
  PlaybookCard,
  PlaybookRow,
  PlaybookStepRow,
  PlaybookStatus,
} from "@/lib/crm/facility-playbook-types";
import type { StaffProfile } from "@/lib/staff-profile";
import { canAccessFacilityAdminTools } from "@/lib/staff-profile";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function mapPlaybook(raw: Record<string, unknown>): PlaybookRow {
  return {
    id: String(raw.id),
    name: String(raw.name),
    description: typeof raw.description === "string" ? raw.description : null,
    facility_type: typeof raw.facility_type === "string" ? raw.facility_type : null,
    specialty_tags: Array.isArray(raw.specialty_tags) ? (raw.specialty_tags as string[]) : null,
    status: (raw.status as PlaybookStatus) ?? "active",
    created_by: typeof raw.created_by === "string" ? raw.created_by : null,
    created_at: typeof raw.created_at === "string" ? raw.created_at : new Date().toISOString(),
    updated_at: typeof raw.updated_at === "string" ? raw.updated_at : new Date().toISOString(),
  };
}

function mapStep(raw: Record<string, unknown>): PlaybookStepRow {
  return {
    id: String(raw.id),
    playbook_id: String(raw.playbook_id),
    step_number: Number(raw.step_number),
    title: String(raw.title),
    description: typeof raw.description === "string" ? raw.description : null,
    due_offset_days: Number(raw.due_offset_days ?? 0),
    suggested_activity_type:
      typeof raw.suggested_activity_type === "string" ? raw.suggested_activity_type : null,
    suggested_outcome: typeof raw.suggested_outcome === "string" ? raw.suggested_outcome : null,
    suggested_follow_up_task:
      typeof raw.suggested_follow_up_task === "string" ? raw.suggested_follow_up_task : null,
    requires_photo: Boolean(raw.requires_photo),
    requires_contact_capture: Boolean(raw.requires_contact_capture),
    requires_referral_process_capture: Boolean(raw.requires_referral_process_capture),
    created_at: typeof raw.created_at === "string" ? raw.created_at : new Date().toISOString(),
  };
}

export async function listPlaybooks(includeSteps = false): Promise<PlaybookCard[]> {
  const { data: rows } = await supabaseAdmin
    .from("facility_outreach_playbooks")
    .select("*")
    .neq("status", "archived")
    .order("name");

  const playbooks = (rows ?? []).map((r) => mapPlaybook(r as Record<string, unknown>));
  if (playbooks.length === 0) return [];

  const ids = playbooks.map((p) => p.id);
  const [{ data: stepRows }, { data: campaignRows }] = await Promise.all([
    supabaseAdmin
      .from("facility_outreach_playbook_steps")
      .select("*")
      .in("playbook_id", ids)
      .order("step_number"),
    supabaseAdmin
      .from("facility_campaigns")
      .select("playbook_id")
      .in("playbook_id", ids)
      .eq("status", "active"),
  ]);

  const stepsByPlaybook: Record<string, PlaybookStepRow[]> = {};
  for (const s of stepRows ?? []) {
    const step = mapStep(s as Record<string, unknown>);
    if (!stepsByPlaybook[step.playbook_id]) stepsByPlaybook[step.playbook_id] = [];
    stepsByPlaybook[step.playbook_id].push(step);
  }

  const activeCampaignCount: Record<string, number> = {};
  for (const c of campaignRows ?? []) {
    const pid = String((c as { playbook_id: string }).playbook_id);
    activeCampaignCount[pid] = (activeCampaignCount[pid] ?? 0) + 1;
  }

  return playbooks.map((p) => ({
    ...p,
    step_count: stepsByPlaybook[p.id]?.length ?? 0,
    active_campaign_count: activeCampaignCount[p.id] ?? 0,
    steps: includeSteps ? stepsByPlaybook[p.id] ?? [] : undefined,
  }));
}

export async function getPlaybook(playbookId: string): Promise<PlaybookCard | null> {
  if (!UUID_RE.test(playbookId)) return null;
  const { data } = await supabaseAdmin
    .from("facility_outreach_playbooks")
    .select("*")
    .eq("id", playbookId)
    .maybeSingle();
  if (!data) return null;

  const { data: steps } = await supabaseAdmin
    .from("facility_outreach_playbook_steps")
    .select("*")
    .eq("playbook_id", playbookId)
    .order("step_number");

  const { count } = await supabaseAdmin
    .from("facility_campaigns")
    .select("id", { count: "exact", head: true })
    .eq("playbook_id", playbookId)
    .eq("status", "active");

  const pb = mapPlaybook(data as Record<string, unknown>);
  const stepList = (steps ?? []).map((s) => mapStep(s as Record<string, unknown>));
  return {
    ...pb,
    step_count: stepList.length,
    active_campaign_count: count ?? 0,
    steps: stepList,
  };
}

export type UpsertPlaybookInput = {
  name: string;
  description?: string | null;
  facility_type?: string | null;
  specialty_tags?: string[] | null;
  status?: PlaybookStatus;
  steps?: Array<{
    step_number: number;
    title: string;
    description?: string | null;
    due_offset_days?: number;
    suggested_activity_type?: string | null;
    suggested_outcome?: string | null;
    suggested_follow_up_task?: string | null;
    requires_photo?: boolean;
    requires_contact_capture?: boolean;
    requires_referral_process_capture?: boolean;
  }>;
};

export async function createPlaybook(
  staff: StaffProfile,
  input: UpsertPlaybookInput
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!canAccessFacilityAdminTools(staff)) return { ok: false, error: "forbidden" };
  const name = input.name.trim();
  if (!name) return { ok: false, error: "missing_name" };

  const { data, error } = await supabaseAdmin
    .from("facility_outreach_playbooks")
    .insert({
      name,
      description: (input.description ?? "").trim() || null,
      facility_type: (input.facility_type ?? "").trim() || null,
      specialty_tags: input.specialty_tags ?? [],
      status: input.status ?? "active",
      created_by: staff.user_id,
    })
    .select("id")
    .maybeSingle();

  if (error || !data?.id) return { ok: false, error: "create_failed" };
  const id = String(data.id);

  if (input.steps?.length) {
    await replacePlaybookSteps(id, input.steps);
  }

  return { ok: true, id };
}

export async function updatePlaybook(
  staff: StaffProfile,
  playbookId: string,
  input: UpsertPlaybookInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!canAccessFacilityAdminTools(staff)) return { ok: false, error: "forbidden" };
  if (!UUID_RE.test(playbookId)) return { ok: false, error: "invalid_id" };

  const name = input.name.trim();
  if (!name) return { ok: false, error: "missing_name" };

  const { error } = await supabaseAdmin
    .from("facility_outreach_playbooks")
    .update({
      name,
      description: (input.description ?? "").trim() || null,
      facility_type: (input.facility_type ?? "").trim() || null,
      specialty_tags: input.specialty_tags ?? [],
      status: input.status ?? "active",
    })
    .eq("id", playbookId);

  if (error) return { ok: false, error: "update_failed" };

  if (input.steps) {
    await replacePlaybookSteps(playbookId, input.steps);
  }

  return { ok: true };
}

async function replacePlaybookSteps(
  playbookId: string,
  steps: NonNullable<UpsertPlaybookInput["steps"]>
): Promise<void> {
  await supabaseAdmin.from("facility_outreach_playbook_steps").delete().eq("playbook_id", playbookId);

  const rows = steps
    .filter((s) => s.title.trim())
    .map((s) => ({
      playbook_id: playbookId,
      step_number: s.step_number,
      title: s.title.trim(),
      description: (s.description ?? "").trim() || null,
      due_offset_days: s.due_offset_days ?? 0,
      suggested_activity_type: (s.suggested_activity_type ?? "").trim() || null,
      suggested_outcome: (s.suggested_outcome ?? "").trim() || null,
      suggested_follow_up_task: (s.suggested_follow_up_task ?? "").trim() || null,
      requires_photo: Boolean(s.requires_photo),
      requires_contact_capture: Boolean(s.requires_contact_capture),
      requires_referral_process_capture: Boolean(s.requires_referral_process_capture),
    }));

  if (rows.length > 0) {
    await supabaseAdmin.from("facility_outreach_playbook_steps").insert(rows);
  }
}

export async function archivePlaybook(
  staff: StaffProfile,
  playbookId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!canAccessFacilityAdminTools(staff)) return { ok: false, error: "forbidden" };
  if (!UUID_RE.test(playbookId)) return { ok: false, error: "invalid_id" };

  const { error } = await supabaseAdmin
    .from("facility_outreach_playbooks")
    .update({ status: "archived" })
    .eq("id", playbookId);

  return error ? { ok: false, error: "archive_failed" } : { ok: true };
}
