import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { supabaseAdmin } from "@/lib/admin";
import { fetchCrmOpenAiJsonObject } from "@/lib/crm/openai-crm-task-json";
import type {
  FacilityLastMeaningfulActivity,
  FacilityNextBestAction,
  FacilityOpenActionItem,
  FacilityReferralProfileAiEvidence,
  FacilityReferralProfileAiSuggestion,
  FacilityReferralProfileContact,
  FacilityReferralProfileIntelligenceRow,
  FacilityReferralProfileRow,
  FacilityReferralProfileSummary,
  FacilityReferralProfileUpdateInput,
  ReferralProfileUpdateFromActivityPrompt,
} from "@/lib/crm/facility-referral-profile-types";
import {
  FACILITY_PREFERRED_METHODS,
  FACILITY_PROFILE_REFERRAL_POTENTIALS,
  FACILITY_RELATIONSHIP_STATUSES,
} from "@/lib/crm/facility-referral-profile-types";
import { effectiveTaskStatus } from "@/lib/crm/facility-follow-up-tasks";
import { notifyFollowUpTaskAssigned, queueFacilityNotification } from "@/lib/crm/facility-notifications";
import type { StaffProfile } from "@/lib/staff-profile";

const AI_MODEL = process.env.SAINTLY_FACILITY_AI_CAPTURE_MODEL?.trim() || "gpt-4o-mini";

function emptyProfile(facilityId: string): FacilityReferralProfileRow {
  const now = new Date().toISOString();
  return {
    id: "",
    facility_id: facilityId,
    relationship_status: null,
    referral_potential: null,
    best_contact_id: null,
    referral_process: null,
    preferred_contact_method: null,
    preferred_packet_method: null,
    preferred_referral_method: null,
    referral_fax: null,
    referral_email: null,
    referral_phone: null,
    services_likely_to_refer: null,
    payer_notes: null,
    insurance_notes: null,
    decision_maker_name: null,
    decision_maker_role: null,
    gatekeeper_notes: null,
    objections: null,
    opportunities: null,
    next_best_action: null,
    next_best_action_due_at: null,
    last_profile_ai_summary: null,
    ai_confidence: null,
    profile_json: null,
    updated_by: null,
    created_at: now,
    updated_at: now,
  };
}

function contactName(c: {
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
}): string {
  return (
    (c.full_name ?? "").trim() ||
    [c.first_name, c.last_name].filter(Boolean).join(" ").trim() ||
    "Contact"
  );
}

function normalizeMethod(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const lower = v.trim().toLowerCase();
  if (FACILITY_PREFERRED_METHODS.includes(lower as (typeof FACILITY_PREFERRED_METHODS)[number])) {
    return lower;
  }
  if (/fax/i.test(lower)) return "fax";
  if (/email/i.test(lower)) return "email";
  if (/phone|call/i.test(lower)) return "phone";
  if (/portal/i.test(lower)) return "portal";
  if (/person|drop/i.test(lower)) return "in_person";
  return null;
}

export function computeProfileCompleteness(profile: FacilityReferralProfileRow): number {
  const checks = [
    profile.relationship_status,
    profile.referral_potential,
    profile.best_contact_id || profile.decision_maker_name,
    profile.referral_process,
    profile.preferred_referral_method || profile.preferred_packet_method,
    profile.referral_fax || profile.referral_email || profile.referral_phone,
    profile.services_likely_to_refer?.length,
    profile.next_best_action,
    profile.payer_notes || profile.insurance_notes,
  ];
  const filled = checks.filter((c) => (Array.isArray(c) ? c.length > 0 : Boolean(c))).length;
  return Math.round((filled / checks.length) * 100);
}

export function formatPreferredMethodLabel(method: string | null): string | null {
  if (!method) return null;
  switch (method) {
    case "in_person":
      return "In person";
    case "unknown":
      return "Unknown";
    default:
      return method.charAt(0).toUpperCase() + method.slice(1);
  }
}

export async function ensureFacilityReferralProfile(facilityId: string): Promise<FacilityReferralProfileRow> {
  const existing = await loadFacilityReferralProfileRow(facilityId);
  if (existing) return existing;

  const { data, error } = await supabaseAdmin
    .from("facility_referral_profiles")
    .insert({ facility_id: facilityId })
    .select("*")
    .single();

  if (error || !data) {
    return emptyProfile(facilityId);
  }
  return data as FacilityReferralProfileRow;
}

export async function loadFacilityReferralProfileRow(
  facilityId: string
): Promise<FacilityReferralProfileRow | null> {
  const { data } = await supabaseAdmin
    .from("facility_referral_profiles")
    .select("*")
    .eq("facility_id", facilityId)
    .maybeSingle();
  return (data as FacilityReferralProfileRow | null) ?? null;
}

async function loadBestContact(
  facilityId: string,
  profile: FacilityReferralProfileRow
): Promise<FacilityReferralProfileContact | null> {
  let contactId = profile.best_contact_id;
  if (!contactId) {
    const { data: flagged } = await supabaseAdmin
      .from("facility_contacts")
      .select("*")
      .eq("facility_id", facilityId)
      .eq("is_active", true)
      .eq("is_best_contact", true)
      .limit(1)
      .maybeSingle();
    if (flagged?.id) contactId = flagged.id as string;
  }
  if (!contactId) {
    const { data: dm } = await supabaseAdmin
      .from("facility_contacts")
      .select("*")
      .eq("facility_id", facilityId)
      .eq("is_active", true)
      .eq("is_decision_maker", true)
      .limit(1)
      .maybeSingle();
    if (dm?.id) contactId = dm.id as string;
  }
  if (!contactId) return null;

  const { data: c } = await supabaseAdmin.from("facility_contacts").select("*").eq("id", contactId).maybeSingle();
  if (!c) return null;
  const row = c as Record<string, unknown>;
  return {
    id: String(row.id),
    name: contactName(row as { full_name: string | null; first_name: string | null; last_name: string | null }),
    title: (row.title as string | null) ?? null,
    email: (row.email as string | null) ?? null,
    phone: ((row.direct_phone ?? row.mobile_phone) as string | null) ?? null,
    fax: (row.fax as string | null) ?? null,
    is_best_contact: Boolean(row.is_best_contact),
    is_decision_maker: Boolean(row.is_decision_maker),
    is_gatekeeper: Boolean(row.is_gatekeeper),
    is_referral_contact: Boolean(row.is_referral_contact),
    preferred_contact_method: (row.preferred_contact_method as string | null) ?? null,
  };
}

async function loadLastMeaningfulActivity(facilityId: string): Promise<FacilityLastMeaningfulActivity | null> {
  const { data: rows } = await supabaseAdmin
    .from("facility_activities")
    .select("id, activity_type, outcome, notes, activity_at, ai_summary")
    .eq("facility_id", facilityId)
    .order("activity_at", { ascending: false })
    .limit(20);

  const activities = rows ?? [];
  for (const a of activities) {
    const row = a as {
      id: string;
      activity_type: string;
      outcome: string | null;
      notes: string | null;
      activity_at: string;
      ai_summary: string | null;
    };
    const summary =
      (row.ai_summary ?? "").trim() ||
      (row.notes ?? "").trim() ||
      [row.activity_type, row.outcome].filter(Boolean).join(" · ");
    if (!summary) continue;
    return {
      id: row.id,
      activity_at: row.activity_at,
      activity_type: row.activity_type,
      outcome: row.outcome,
      summary: summary.slice(0, 280),
    };
  }
  return null;
}

async function loadOpenActionItems(facilityId: string): Promise<FacilityOpenActionItem[]> {
  const items: FacilityOpenActionItem[] = [];

  const { data: tasks } = await supabaseAdmin
    .from("facility_follow_up_tasks")
    .select("id, title, status, due_at, snoozed_until")
    .eq("facility_id", facilityId)
    .in("status", ["open", "snoozed"]);

  const openTasks = (tasks ?? []).filter((t) => {
    const row = t as { status: string; due_at: string | null; snoozed_until: string | null };
    return effectiveTaskStatus(row as Parameters<typeof effectiveTaskStatus>[0]) === "open";
  });
  if (openTasks.length) {
    items.push({
      key: "follow_up_tasks",
      label: `${openTasks.length} open follow-up task${openTasks.length === 1 ? "" : "s"}`,
      count: openTasks.length,
      href: "/admin/facilities/follow-ups",
    });
  }

  const { data: packets } = await supabaseAdmin
    .from("facility_packet_requests")
    .select("id, status")
    .eq("facility_id", facilityId)
    .in("status", ["requested", "scheduled", "sent", "awaiting_confirmation"]);

  const packetRows = packets ?? [];
  const pendingSend = packetRows.filter((p) => (p as { status: string }).status === "requested").length;
  const awaitingConfirm = packetRows.filter((p) =>
    ["sent", "awaiting_confirmation"].includes((p as { status: string }).status)
  ).length;
  if (pendingSend) {
    items.push({ key: "packets_pending", label: `${pendingSend} packet request(s) to send`, count: pendingSend });
  }
  if (awaitingConfirm) {
    items.push({
      key: "packets_confirm",
      label: `${awaitingConfirm} packet(s) awaiting confirmation`,
      count: awaitingConfirm,
    });
  }

  const { data: referrals } = await supabaseAdmin
    .from("leads")
    .select("id, referral_pipeline_stage")
    .eq("referring_facility_id", facilityId)
    .not("referral_pipeline_stage", "in", '("converted","lost")');

  const openRefs = (referrals ?? []).length;
  if (openRefs) {
    items.push({
      key: "referrals_open",
      label: `${openRefs} open referral lead(s)`,
      count: openRefs,
      href: "/admin/facilities/referrals",
    });
  }

  const { data: steps } = await supabaseAdmin
    .from("facility_campaign_step_instances")
    .select("id, status, due_at")
    .eq("facility_id", facilityId)
    .eq("status", "pending");

  const dueSteps = (steps ?? []).filter((s) => {
    const due = (s as { due_at: string | null }).due_at;
    return due && new Date(due).getTime() <= Date.now() + 7 * 86400000;
  });
  if (dueSteps.length) {
    items.push({
      key: "campaign_steps",
      label: `${dueSteps.length} campaign step(s) due`,
      count: dueSteps.length,
    });
  }

  return items;
}

export async function suggestFacilityNextBestAction(
  facilityId: string,
  profile: FacilityReferralProfileRow
): Promise<FacilityNextBestAction | null> {
  if (profile.next_best_action?.trim()) {
    return {
      action: profile.next_best_action.trim(),
      reason: "Saved on referral source profile.",
      due_at: profile.next_best_action_due_at,
      source: profile.ai_confidence ? "ai" : "profile",
    };
  }

  const { data: facility } = await supabaseAdmin
    .from("facilities")
    .select("priority, last_visit_at")
    .eq("id", facilityId)
    .maybeSingle();

  const { data: packets } = await supabaseAdmin
    .from("facility_packet_requests")
    .select("id, status")
    .eq("facility_id", facilityId)
    .order("created_at", { ascending: false })
    .limit(5);

  const packetList = (packets ?? []) as { status: string }[];
  if (packetList.some((p) => p.status === "requested")) {
    return {
      action: "Send requested packet",
      reason: "Because a packet was requested but not sent.",
      due_at: null,
      source: "deterministic",
    };
  }
  if (packetList.some((p) => ["sent", "awaiting_confirmation"].includes(p.status))) {
    return {
      action: "Confirm packet received",
      reason: "Because packet was sent but not confirmed received.",
      due_at: null,
      source: "deterministic",
    };
  }

  const { data: openRefs } = await supabaseAdmin
    .from("leads")
    .select("id, referral_pipeline_stage")
    .eq("referring_facility_id", facilityId)
    .not("referral_pipeline_stage", "in", '("converted","lost")')
    .limit(3);

  if ((openRefs ?? []).length) {
    return {
      action: "Check referral intake status",
      reason: "Because there are open referral leads from this source.",
      due_at: null,
      source: "deterministic",
    };
  }

  const { data: steps } = await supabaseAdmin
    .from("facility_campaign_step_instances")
    .select("id, due_at, title")
    .eq("facility_id", facilityId)
    .eq("status", "pending")
    .order("due_at", { ascending: true })
    .limit(1);

  const step = steps?.[0] as { title?: string; due_at?: string | null } | undefined;
  if (step) {
    return {
      action: step.title ? `Complete campaign step: ${step.title}` : "Complete due campaign step",
      reason: "Because a campaign step is due.",
      due_at: step.due_at ?? null,
      source: "deterministic",
    };
  }

  const potential = profile.referral_potential ?? "";
  const warmHot = potential === "Warm" || potential === "Hot" || potential === "Active Producer";
  if (warmHot) {
    const { data: tasks } = await supabaseAdmin
      .from("facility_follow_up_tasks")
      .select("id, status")
      .eq("facility_id", facilityId)
      .in("status", ["open", "snoozed"]);
    const hasOpen = (tasks ?? []).some(
      (t) => effectiveTaskStatus(t as Parameters<typeof effectiveTaskStatus>[0]) === "open"
    );
    if (!hasOpen) {
      return {
        action: "Schedule follow-up with decision maker",
        reason: "Because source is warm/hot with no open follow-up task.",
        due_at: null,
        source: "deterministic",
      };
    }
  }

  const lastVisit = (facility as { last_visit_at?: string | null } | null)?.last_visit_at;
  const priority = (facility as { priority?: string } | null)?.priority ?? "";
  if (lastVisit) {
    const daysSince = (Date.now() - new Date(lastVisit).getTime()) / 86400000;
    if (daysSince >= 14 && (priority === "High" || priority === "Urgent")) {
      return {
        action: "Schedule or drop-in visit",
        reason: "Because no visit in 14+ days and facility is high priority.",
        due_at: null,
        source: "deterministic",
      };
    }
  } else {
    return {
      action: "First introduction drop-off",
      reason: "Because there is no logged activity yet.",
      due_at: null,
      source: "deterministic",
    };
  }

  if (!profile.referral_process?.trim() && warmHot) {
    return {
      action: "Capture referral process",
      reason: "Because source is warm/hot but referral process is not documented.",
      due_at: null,
      source: "deterministic",
    };
  }

  return null;
}

function buildWalkInBullets(
  profile: FacilityReferralProfileRow,
  bestContact: FacilityReferralProfileContact | null,
  nextAction: FacilityNextBestAction | null,
  lastActivity: FacilityLastMeaningfulActivity | null
): string[] {
  const bullets: string[] = [];
  if (bestContact?.name) bullets.push(`Ask for ${bestContact.name}${bestContact.title ? ` (${bestContact.title})` : ""}`);
  if (nextAction?.action) bullets.push(nextAction.action);
  if (profile.services_likely_to_refer?.length) {
    bullets.push(`Mention ${profile.services_likely_to_refer.slice(0, 3).join(", ")}`);
  }
  const method = profile.preferred_referral_method ?? profile.preferred_packet_method;
  if (method && profile.referral_process) {
    bullets.push(`Referral: ${formatPreferredMethodLabel(method)} — ${profile.referral_process.slice(0, 120)}`);
  } else if (profile.referral_process) {
    bullets.push(`Referral process: ${profile.referral_process.slice(0, 140)}`);
  }
  if (lastActivity?.summary) bullets.push(`Last note: ${lastActivity.summary.slice(0, 120)}`);
  return bullets.slice(0, 5);
}

export async function buildFacilityReferralProfileSummary(
  facilityId: string
): Promise<FacilityReferralProfileSummary> {
  const profile = (await loadFacilityReferralProfileRow(facilityId)) ?? emptyProfile(facilityId);
  const best_contact = await loadBestContact(facilityId, profile);
  const open_action_items = await loadOpenActionItems(facilityId);
  const last_meaningful_activity = await loadLastMeaningfulActivity(facilityId);
  const next_best_action = await suggestFacilityNextBestAction(facilityId, profile);
  const completeness_pct = computeProfileCompleteness(profile);
  const preferred_method =
    profile.preferred_referral_method ??
    profile.preferred_packet_method ??
    profile.preferred_contact_method ??
    best_contact?.preferred_contact_method ??
    null;

  return {
    profile,
    best_contact,
    open_action_items,
    next_best_action,
    last_meaningful_activity,
    completeness_pct,
    hints: {
      best_contact_name: best_contact?.name ?? profile.decision_maker_name,
      preferred_method: formatPreferredMethodLabel(preferred_method),
      next_best_action: next_best_action?.action ?? profile.next_best_action,
      referral_potential: profile.referral_potential,
      relationship_status: profile.relationship_status,
    },
    walk_in_bullets: buildWalkInBullets(profile, best_contact, next_best_action, last_meaningful_activity),
  };
}

export async function loadFacilityReferralProfile(
  facilityId: string
): Promise<FacilityReferralProfileSummary> {
  await ensureFacilityReferralProfile(facilityId);
  return buildFacilityReferralProfileSummary(facilityId);
}

export async function updateFacilityReferralProfile(
  facilityId: string,
  input: FacilityReferralProfileUpdateInput,
  updatedBy: string
): Promise<FacilityReferralProfileRow> {
  await ensureFacilityReferralProfile(facilityId);

  const patch: Record<string, unknown> = { updated_by: updatedBy, updated_at: new Date().toISOString() };
  for (const [k, v] of Object.entries(input)) {
    if (v !== undefined) patch[k] = v;
  }

  if (input.best_contact_id) {
    await supabaseAdmin
      .from("facility_contacts")
      .update({ is_best_contact: false })
      .eq("facility_id", facilityId);
    await supabaseAdmin
      .from("facility_contacts")
      .update({ is_best_contact: true })
      .eq("id", input.best_contact_id);
  }

  const { data, error } = await supabaseAdmin
    .from("facility_referral_profiles")
    .update(patch)
    .eq("facility_id", facilityId)
    .select("*")
    .single();

  if (error || !data) throw new Error(error?.message ?? "profile_update_failed");
  return data as FacilityReferralProfileRow;
}

export async function refreshFacilityReferralProfileFromHistory(
  facilityId: string,
  updatedBy: string
): Promise<FacilityReferralProfileRow> {
  const profile = await ensureFacilityReferralProfile(facilityId);
  const { data: facility } = await supabaseAdmin
    .from("facilities")
    .select("referral_method, referral_notes, intake_notes, fax, email, main_phone")
    .eq("id", facilityId)
    .maybeSingle();

  const patch: FacilityReferralProfileUpdateInput = {};

  if (!profile.referral_process && (facility as { referral_notes?: string })?.referral_notes) {
    patch.referral_process = (facility as { referral_notes: string }).referral_notes;
  }
  if (!profile.referral_fax && (facility as { fax?: string })?.fax) {
    patch.referral_fax = (facility as { fax: string }).fax;
  }
  if (!profile.referral_email && (facility as { email?: string })?.email) {
    patch.referral_email = (facility as { email: string }).email;
  }
  if (!profile.referral_phone && (facility as { main_phone?: string })?.main_phone) {
    patch.referral_phone = (facility as { main_phone: string }).main_phone;
  }

  const { data: latestAct } = await supabaseAdmin
    .from("facility_activities")
    .select("referral_potential, referral_process_captured, notes, outcome")
    .eq("facility_id", facilityId)
    .order("activity_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!profile.referral_potential && latestAct?.referral_potential) {
    const rp = latestAct.referral_potential as string;
    if (FACILITY_PROFILE_REFERRAL_POTENTIALS.includes(rp as (typeof FACILITY_PROFILE_REFERRAL_POTENTIALS)[number])) {
      patch.referral_potential = rp;
    } else if (rp === "Hot") patch.referral_potential = "Hot";
    else if (rp === "Warm") patch.referral_potential = "Warm";
  }

  if (Object.keys(patch).length === 0) return profile;
  return updateFacilityReferralProfile(facilityId, patch, updatedBy);
}

async function gatherHistoryForAi(facilityId: string, lookbackDays: number): Promise<string> {
  const since = new Date(Date.now() - lookbackDays * 86400000).toISOString();

  const { data: facility } = await supabaseAdmin.from("facilities").select("*").eq("id", facilityId).maybeSingle();
  const { data: contacts } = await supabaseAdmin
    .from("facility_contacts")
    .select("full_name, first_name, last_name, title, is_decision_maker, is_best_contact, notes")
    .eq("facility_id", facilityId)
    .eq("is_active", true);
  const { data: activities } = await supabaseAdmin
    .from("facility_activities")
    .select("activity_type, outcome, notes, activity_at, referral_potential, referral_process_captured, ai_summary, ai_extracted_json")
    .eq("facility_id", facilityId)
    .gte("activity_at", since)
    .order("activity_at", { ascending: false })
    .limit(40);
  const { data: photos } = await supabaseAdmin
    .from("facility_activity_photos")
    .select("ai_summary, photo_type, created_at")
    .eq("facility_id", facilityId)
    .gte("created_at", since)
    .limit(15);
  const { data: packets } = await supabaseAdmin
    .from("facility_packet_requests")
    .select("status, delivery_method, notes, created_at")
    .eq("facility_id", facilityId)
    .gte("created_at", since)
    .limit(10);
  const { data: referrals } = await supabaseAdmin
    .from("leads")
    .select("referral_pipeline_stage, service_type, payer_name, created_at")
    .eq("referring_facility_id", facilityId)
    .gte("created_at", since)
    .limit(10);

  return JSON.stringify(
    {
      facility,
      contacts: contacts ?? [],
      activities: (activities ?? []).map((a) => {
        const row = a as { notes?: string | null; ai_summary?: string | null };
        return {
          ...a,
          notes: row.notes ? row.notes.slice(0, 400) : null,
        };
      }),
      photos: photos ?? [],
      packets: packets ?? [],
      referrals: (referrals ?? []).map((r) => ({
        stage: (r as { referral_pipeline_stage: string }).referral_pipeline_stage,
        service: (r as { service_type?: string }).service_type,
        payer: (r as { payer_name?: string }).payer_name,
      })),
    },
    null,
    2
  );
}

export async function aiRefreshFacilityReferralProfile(
  facilityId: string,
  lookbackDays: number
): Promise<
  | {
      ok: true;
      suggested_profile: FacilityReferralProfileAiSuggestion;
      evidence: FacilityReferralProfileAiEvidence[];
      warnings: string[];
    }
  | { ok: false; error: string }
> {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    return { ok: false, error: "ai_not_configured" };
  }

  const history = await gatherHistoryForAi(facilityId, lookbackDays);
  const current = await loadFacilityReferralProfileRow(facilityId);

  const system = `You analyze facility referral source history for a home health sales CRM.
Return JSON with keys:
suggested_profile (object with relationship_status, referral_potential, best_contact_name, best_contact_role, referral_process, preferred_referral_method, preferred_packet_method, preferred_contact_method, referral_fax, referral_email, referral_phone, services_likely_to_refer array, payer_notes, insurance_notes, decision_maker_name, decision_maker_role, gatekeeper_notes, objections, opportunities, next_best_action, next_best_action_due_at ISO or null, confidence 0-1),
evidence (array of {source, date, summary}),
warnings (array of strings).

Allowed relationship_status: ${FACILITY_RELATIONSHIP_STATUSES.join(", ")}
Allowed referral_potential: ${FACILITY_PROFILE_REFERRAL_POTENTIALS.join(", ")}
Allowed methods: ${FACILITY_PREFERRED_METHODS.join(", ")}

Do NOT include patient names or PHI. Referral leads: status/service/payer only.
Be conservative. If unsure, lower confidence and add warnings.`;

  const user = `Current profile:\n${JSON.stringify(current ?? {}, null, 2)}\n\nRecent history:\n${history}`;

  const raw = await fetchCrmOpenAiJsonObject(AI_MODEL, system, user);
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "ai_failed" };
  }

  const obj = raw as {
    suggested_profile?: Record<string, unknown>;
    evidence?: FacilityReferralProfileAiEvidence[];
    warnings?: string[];
  };
  const sp = obj.suggested_profile ?? {};

  const suggested: FacilityReferralProfileAiSuggestion = {
    relationship_status: typeof sp.relationship_status === "string" ? sp.relationship_status : null,
    referral_potential: typeof sp.referral_potential === "string" ? sp.referral_potential : null,
    best_contact_name: typeof sp.best_contact_name === "string" ? sp.best_contact_name : null,
    best_contact_role: typeof sp.best_contact_role === "string" ? sp.best_contact_role : null,
    referral_process: typeof sp.referral_process === "string" ? sp.referral_process : null,
    preferred_referral_method: normalizeMethod(sp.preferred_referral_method),
    preferred_packet_method: normalizeMethod(sp.preferred_packet_method),
    preferred_contact_method: normalizeMethod(sp.preferred_contact_method),
    referral_fax: typeof sp.referral_fax === "string" ? sp.referral_fax : null,
    referral_email: typeof sp.referral_email === "string" ? sp.referral_email : null,
    referral_phone: typeof sp.referral_phone === "string" ? sp.referral_phone : null,
    services_likely_to_refer: Array.isArray(sp.services_likely_to_refer)
      ? sp.services_likely_to_refer.filter((x): x is string => typeof x === "string")
      : [],
    payer_notes: typeof sp.payer_notes === "string" ? sp.payer_notes : null,
    insurance_notes: typeof sp.insurance_notes === "string" ? sp.insurance_notes : null,
    decision_maker_name: typeof sp.decision_maker_name === "string" ? sp.decision_maker_name : null,
    decision_maker_role: typeof sp.decision_maker_role === "string" ? sp.decision_maker_role : null,
    gatekeeper_notes: typeof sp.gatekeeper_notes === "string" ? sp.gatekeeper_notes : null,
    objections: typeof sp.objections === "string" ? sp.objections : null,
    opportunities: typeof sp.opportunities === "string" ? sp.opportunities : null,
    next_best_action: typeof sp.next_best_action === "string" ? sp.next_best_action : null,
    next_best_action_due_at: typeof sp.next_best_action_due_at === "string" ? sp.next_best_action_due_at : null,
    confidence: typeof sp.confidence === "number" ? sp.confidence : 0.5,
  };

  return {
    ok: true,
    suggested_profile: suggested,
    evidence: Array.isArray(obj.evidence) ? obj.evidence : [],
    warnings: Array.isArray(obj.warnings) ? obj.warnings : [],
  };
}

export async function applyAiSuggestedProfile(
  facilityId: string,
  fields: Partial<FacilityReferralProfileAiSuggestion>,
  updatedBy: string,
  aiSummary?: string | null,
  confidence?: number | null
): Promise<FacilityReferralProfileRow> {
  const patch: FacilityReferralProfileUpdateInput = {};

  if (fields.relationship_status !== undefined) patch.relationship_status = fields.relationship_status;
  if (fields.referral_potential !== undefined) patch.referral_potential = fields.referral_potential;
  if (fields.referral_process !== undefined) patch.referral_process = fields.referral_process;
  if (fields.preferred_referral_method !== undefined) patch.preferred_referral_method = fields.preferred_referral_method;
  if (fields.preferred_packet_method !== undefined) patch.preferred_packet_method = fields.preferred_packet_method;
  if (fields.preferred_contact_method !== undefined) patch.preferred_contact_method = fields.preferred_contact_method;
  if (fields.referral_fax !== undefined) patch.referral_fax = fields.referral_fax;
  if (fields.referral_email !== undefined) patch.referral_email = fields.referral_email;
  if (fields.referral_phone !== undefined) patch.referral_phone = fields.referral_phone;
  if (fields.services_likely_to_refer !== undefined) patch.services_likely_to_refer = fields.services_likely_to_refer;
  if (fields.payer_notes !== undefined) patch.payer_notes = fields.payer_notes;
  if (fields.insurance_notes !== undefined) patch.insurance_notes = fields.insurance_notes;
  if (fields.decision_maker_name !== undefined) patch.decision_maker_name = fields.decision_maker_name;
  if (fields.decision_maker_role !== undefined) patch.decision_maker_role = fields.decision_maker_role;
  if (fields.gatekeeper_notes !== undefined) patch.gatekeeper_notes = fields.gatekeeper_notes;
  if (fields.objections !== undefined) patch.objections = fields.objections;
  if (fields.opportunities !== undefined) patch.opportunities = fields.opportunities;
  if (fields.next_best_action !== undefined) patch.next_best_action = fields.next_best_action;
  if (fields.next_best_action_due_at !== undefined) patch.next_best_action_due_at = fields.next_best_action_due_at;

  if (fields.best_contact_name) {
    const { data: contacts } = await supabaseAdmin
      .from("facility_contacts")
      .select("id, full_name, first_name, last_name")
      .eq("facility_id", facilityId)
      .eq("is_active", true);
    const match = (contacts ?? []).find((c) => {
      const name = contactName(c as { full_name: string | null; first_name: string | null; last_name: string | null });
      return name.toLowerCase().includes(fields.best_contact_name!.toLowerCase());
    });
    if (match?.id) patch.best_contact_id = match.id as string;
  }

  const row = await updateFacilityReferralProfile(facilityId, patch, updatedBy);

  if (aiSummary || confidence != null) {
    await supabaseAdmin
      .from("facility_referral_profiles")
      .update({
        last_profile_ai_summary: aiSummary ?? null,
        ai_confidence: confidence ?? null,
        profile_json: { applied_at: new Date().toISOString(), fields },
      })
      .eq("facility_id", facilityId);
  }

  return row;
}

export function extractReferralProcessFromNotes(notes: string): ReferralProfileUpdateFromActivityPrompt {
  const text = notes.trim();
  const faxMatch = text.match(/(?:fax|f\.?\s*ax)\s*(?:to|:)?\s*([\d\-().\s]{10,})/i);
  const emailMatch = text.match(/[\w.+-]+@[\w.-]+\.\w{2,}/);
  const phoneMatch = text.match(/(?:call|phone|tel)\s*(?:at|:)?\s*([\d\-().\s]{10,})/i);

  let preferred: string | null = null;
  if (/fax/i.test(text)) preferred = "fax";
  else if (/email/i.test(text)) preferred = "email";
  else if (/portal/i.test(text)) preferred = "portal";
  else if (/phone|call/i.test(text)) preferred = "phone";
  else if (/drop.?off|in person/i.test(text)) preferred = "in_person";

  const nameMatch = text.match(/(?:ask for|speak with|talk to|contact)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);

  return {
    referral_process: text.length > 20 ? text.slice(0, 500) : null,
    preferred_referral_method: preferred,
    best_contact_name: nameMatch?.[1] ?? null,
    referral_fax: faxMatch?.[1]?.replace(/\s+/g, " ").trim() ?? null,
    referral_email: emailMatch?.[0] ?? null,
    referral_phone: phoneMatch?.[1]?.replace(/\s+/g, " ").trim() ?? null,
  };
}

export async function createFollowUpFromProfileAction(
  facilityId: string,
  staff: StaffProfile,
  input: { title?: string; due_at?: string | null; contact_id?: string | null }
): Promise<{ ok: boolean; task_id?: string; error?: string }> {
  const summary = await buildFacilityReferralProfileSummary(facilityId);
  const action = input.title?.trim() || summary.next_best_action?.action || summary.profile.next_best_action;
  if (!action) return { ok: false, error: "no_action" };

  const due =
    input.due_at ??
    summary.profile.next_best_action_due_at ??
    summary.next_best_action?.due_at ??
    new Date(Date.now() + 2 * 86400000).toISOString();

  const { data: facility } = await supabaseAdmin
    .from("facilities")
    .select("name, assigned_rep_user_id")
    .eq("id", facilityId)
    .maybeSingle();

  const assigned_to =
    (facility as { assigned_rep_user_id?: string | null })?.assigned_rep_user_id ?? staff.user_id;

  const { data: inserted, error } = await supabaseAdmin
    .from("facility_follow_up_tasks")
    .insert({
      facility_id: facilityId,
      contact_id: input.contact_id ?? summary.profile.best_contact_id,
      assigned_to,
      title: action,
      due_at: due,
      status: "open",
      priority: "Normal",
      source: "referral_profile",
      created_by: staff.user_id,
    })
    .select("id")
    .maybeSingle();

  if (error || !inserted?.id) return { ok: false, error: "task_failed" };

  queueFacilityNotification(() =>
    notifyFollowUpTaskAssigned({
      taskId: inserted.id as string,
      facilityId,
      facilityName: String((facility as { name?: string })?.name ?? "Facility"),
      title: action,
      assignedToUserId: assigned_to,
      dueAt: due,
    })
  );

  return { ok: true, task_id: inserted.id as string };
}

export async function loadReferralProfileIntelligenceRows(
  limit = 50
): Promise<{
  summary: {
    with_referral_process: number;
    with_best_contact: number;
    with_preferred_method: number;
    warm_hot_count: number;
    active_producer_count: number;
    missing_profile_count: number;
  };
  rows: FacilityReferralProfileIntelligenceRow[];
}> {
  const { data: profiles } = await supabaseAdmin
    .from("facility_referral_profiles")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(limit);

  const facilityIds = (profiles ?? []).map((p) => (p as { facility_id: string }).facility_id);
  const { data: facilities } = facilityIds.length
    ? await supabaseAdmin.from("facilities").select("id, name, is_active").in("id", facilityIds)
    : { data: [] };

  const facilityMap = new Map(
    (facilities ?? []).map((f) => [(f as { id: string }).id, f as { id: string; name: string; is_active: boolean }])
  );

  const profileRows = (profiles ?? []).filter((p) => {
    const fac = facilityMap.get((p as { facility_id: string }).facility_id);
    return fac?.is_active !== false;
  });
  const { count: totalFacilitiesCount } = await supabaseAdmin
    .from("facilities")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true);

  const totalFacilities = totalFacilitiesCount ?? 0;
  const withProcess = profileRows.filter((p) => (p as { referral_process?: string }).referral_process?.trim()).length;
  const withContact = profileRows.filter(
    (p) => (p as { best_contact_id?: string }).best_contact_id || (p as { decision_maker_name?: string }).decision_maker_name
  ).length;
  const withMethod = profileRows.filter(
    (p) =>
      (p as { preferred_referral_method?: string }).preferred_referral_method ||
      (p as { preferred_packet_method?: string }).preferred_packet_method
  ).length;
  const warmHot = profileRows.filter((p) => {
    const rp = (p as { referral_potential?: string }).referral_potential;
    return rp === "Warm" || rp === "Hot";
  }).length;
  const activeProducer = profileRows.filter(
    (p) => (p as { referral_potential?: string }).referral_potential === "Active Producer"
  ).length;

  const contactIds = profileRows
    .map((p) => (p as { best_contact_id?: string }).best_contact_id)
    .filter(Boolean) as string[];
  const contactNames: Record<string, string> = {};
  if (contactIds.length) {
    const { data: contacts } = await supabaseAdmin
      .from("facility_contacts")
      .select("id, full_name, first_name, last_name")
      .in("id", contactIds);
    for (const c of contacts ?? []) {
      contactNames[(c as { id: string }).id] = contactName(
        c as { full_name: string | null; first_name: string | null; last_name: string | null }
      );
    }
  }

  const rows: FacilityReferralProfileIntelligenceRow[] = profileRows.map((p) => {
    const row = p as FacilityReferralProfileRow;
    const fac = facilityMap.get(row.facility_id);
    const method =
      row.preferred_referral_method ?? row.preferred_packet_method ?? row.preferred_contact_method;
    return {
      facility_id: row.facility_id,
      facility_name: fac?.name ?? "Facility",
      completeness_pct: computeProfileCompleteness(row),
      referral_potential: row.referral_potential,
      best_contact_name: row.best_contact_id
        ? contactNames[row.best_contact_id] ?? row.decision_maker_name
        : row.decision_maker_name,
      preferred_method: formatPreferredMethodLabel(method),
      next_best_action: row.next_best_action,
      relationship_status: row.relationship_status,
      updated_at: row.updated_at,
    };
  });

  return {
    summary: {
      with_referral_process: withProcess,
      with_best_contact: withContact,
      with_preferred_method: withMethod,
      warm_hot_count: warmHot,
      active_producer_count: activeProducer,
      missing_profile_count: Math.max(0, totalFacilities - profileRows.length),
    },
    rows,
  };
}

export async function loadProfileHintsForFacilities(
  facilityIds: string[]
): Promise<Record<string, FacilityReferralProfileSummary["hints"]>> {
  if (!facilityIds.length) return {};
  const { data: profiles } = await supabaseAdmin
    .from("facility_referral_profiles")
    .select("*")
    .in("facility_id", facilityIds);

  const out: Record<string, FacilityReferralProfileSummary["hints"]> = {};
  for (const fid of facilityIds) {
    const p = (profiles ?? []).find((x) => (x as { facility_id: string }).facility_id === fid) as
      | FacilityReferralProfileRow
      | undefined;
    if (!p) {
      out[fid] = {
        best_contact_name: null,
        preferred_method: null,
        next_best_action: null,
        referral_potential: null,
        relationship_status: null,
      };
      continue;
    }
    out[fid] = {
      best_contact_name: p.decision_maker_name,
      preferred_method: formatPreferredMethodLabel(
        p.preferred_referral_method ?? p.preferred_packet_method ?? p.preferred_contact_method
      ),
      next_best_action: p.next_best_action,
      referral_potential: p.referral_potential,
      relationship_status: p.relationship_status,
    };
  }

  const missingBest = facilityIds.filter((id) => !out[id]?.best_contact_name);
  if (missingBest.length) {
    const { data: contacts } = await supabaseAdmin
      .from("facility_contacts")
      .select("facility_id, full_name, first_name, last_name, is_best_contact, is_decision_maker")
      .in("facility_id", missingBest)
      .eq("is_active", true);
    for (const fid of missingBest) {
      const c =
        (contacts ?? []).find(
          (x) =>
            (x as { facility_id: string }).facility_id === fid &&
            ((x as { is_best_contact?: boolean }).is_best_contact ||
              (x as { is_decision_maker?: boolean }).is_decision_maker)
        ) ??
        (contacts ?? []).find((x) => (x as { facility_id: string }).facility_id === fid);
      if (c) {
        out[fid].best_contact_name = contactName(
          c as { full_name: string | null; first_name: string | null; last_name: string | null }
        );
      }
    }
  }

  return out;
}
