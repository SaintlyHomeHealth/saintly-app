import "server-only";

import { supabaseAdmin } from "@/lib/admin";
import { buildFacilityFullAddress } from "@/lib/crm/facility-address";
import { staffLabelFromLookup } from "@/lib/crm/crm-leads-table-helpers";
import {
  matchReferringFacilityFromPublicForm,
  referralSourceMatchAutoAttachThreshold,
} from "@/lib/crm/facility-referral-source-match";
import type {
  ReferralSourceReviewItem,
  ReferralSourceReviewMarkReason,
  ReferralSourceReviewStatus,
  ReferralSourceReviewSuggestion,
  ReferralSourceReviewSummary,
  ReferralSourceReviewTypedSource,
} from "@/lib/crm/facility-referral-source-review-types";
import {
  createFacilityNotification,
  notifyFacilityReferralCreated,
  notifyReferralSourceReviewCompleted,
  queueFacilityNotification,
} from "@/lib/crm/facility-notifications";
import { leadRowsActiveOnly } from "@/lib/crm/leads-active";
import { normalizePhoneDigits } from "@/lib/crm/facility-match";
import type { StaffProfile } from "@/lib/staff-profile";
import { canAccessFacilityAdminTools, canAccessFacilityFieldTools } from "@/lib/staff-profile";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function canReviewReferralSources(staff: StaffProfile | null | undefined): boolean {
  return canAccessFacilityAdminTools(staff);
}

export function canViewReferralSourceReview(staff: StaffProfile | null | undefined): boolean {
  return canAccessFacilityFieldTools(staff);
}

function matchBadge(confidence: number): ReferralSourceReviewSuggestion["match_badge"] {
  if (confidence >= 0.85) return "strong";
  if (confidence >= 0.65) return "possible";
  return "weak";
}

function parseAttribution(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  return {};
}

function typedSourceFromAttribution(attr: Record<string, unknown>): ReferralSourceReviewTypedSource {
  const token = typeof attr.token === "string" ? attr.token : null;
  const linkType = typeof attr.link_type === "string" ? attr.link_type : null;
  let sourceUrl: string | null = null;
  if (token) sourceUrl = `/refer/t/${token}`;

  return {
    referring_office_name:
      (typeof attr.typed_referring_facility_name === "string" ? attr.typed_referring_facility_name : null) ??
      (typeof attr.facility_name === "string" ? attr.facility_name : null),
    referring_contact_name:
      typeof attr.typed_referring_contact_name === "string" ? attr.typed_referring_contact_name : null,
    referring_contact_phone:
      typeof attr.typed_referring_contact_phone === "string" ? attr.typed_referring_contact_phone : null,
    referring_contact_email:
      typeof attr.typed_referring_contact_email === "string" ? attr.typed_referring_contact_email : null,
    office_city:
      typeof attr.typed_referring_office_city === "string" ? attr.typed_referring_office_city : null,
    office_phone:
      typeof attr.typed_referring_office_phone === "string" ? attr.typed_referring_office_phone : null,
    source_url: sourceUrl,
    token,
    link_type: linkType,
    campaign_id: typeof attr.campaign_id === "string" ? attr.campaign_id : null,
    packet_request_id: typeof attr.packet_request_id === "string" ? attr.packet_request_id : null,
  };
}

function leadInReviewScope(row: Record<string, unknown>): boolean {
  if (Boolean(row.needs_referral_source_review)) return true;
  const refType = String(row.referral_source_type ?? "").toLowerCase();
  if (refType === "unmatched_printed_qr") return true;
  const facilityId = row.referring_facility_id;
  const attr = parseAttribution(row.referral_attribution_json);
  const typedName = String(attr.typed_referring_facility_name ?? row.doctor_office_name ?? "").trim();
  if (!facilityId && typedName) return true;
  const confidence =
    typeof row.referral_source_match_confidence === "number" ? row.referral_source_match_confidence : null;
  if (confidence != null && confidence < referralSourceMatchAutoAttachThreshold()) return true;
  return false;
}

async function loadLeadForReview(leadId: string): Promise<Record<string, unknown> | null> {
  const { data } = await leadRowsActiveOnly(
    supabaseAdmin
      .from("leads")
      .select(
        "id, status, source, referral_source_type, referring_facility_id, referring_facility_contact_id, produced_by_user_id, owner_user_id, referral_received_at, referral_attribution_json, needs_referral_source_review, referral_source_match_confidence, referral_source_match_reason, doctor_office_name, service_type, service_disciplines, primary_payer_name, payer_name, created_at, contacts ( full_name, primary_phone )"
      )
      .eq("id", leadId)
  ).maybeSingle();
  return data ? (data as Record<string, unknown>) : null;
}

export async function getReferralSourceReviewSuggestions(
  leadId: string
): Promise<ReferralSourceReviewSuggestion[]> {
  const lead = await loadLeadForReview(leadId);
  if (!lead) return [];

  const attr = parseAttribution(lead.referral_attribution_json);
  const typed = typedSourceFromAttribution(attr);
  const officeName = (typed.referring_office_name ?? String(lead.doctor_office_name ?? "")).trim();
  if (!officeName) return [];

  const match = await matchReferringFacilityFromPublicForm({
    referring_facility_name: officeName,
    referring_contact_name: typed.referring_contact_name,
    referring_contact_phone: typed.referring_contact_phone,
    referring_contact_email: typed.referring_contact_email,
    referring_office_city: typed.office_city,
    referring_office_phone: typed.office_phone,
  });

  const facilityIds = [
    ...new Set(match.possible_matches.map((m) => m.facility_id).filter((id) => UUID_RE.test(id))),
  ].slice(0, 8);

  if (!facilityIds.length) return [];

  const { data: facilities } = await supabaseAdmin
    .from("facilities")
    .select(
      "id, name, city, main_phone, address_line_1, address_line_2, state, zip, last_referral_at"
    )
    .in("id", facilityIds);

  const { data: contacts } = await supabaseAdmin
    .from("facility_contacts")
    .select("id, facility_id, full_name, first_name, last_name, title, direct_phone, mobile_phone, email")
    .in("facility_id", facilityIds)
    .eq("is_active", true)
    .limit(200);

  const { data: activities } = await supabaseAdmin
    .from("facility_activities")
    .select("facility_id, activity_at")
    .in("facility_id", facilityIds)
    .order("activity_at", { ascending: false })
    .limit(200);

  const { data: profiles } = await supabaseAdmin
    .from("facility_referral_profiles")
    .select("facility_id, relationship_status, referral_potential")
    .in("facility_id", facilityIds);

  const contactsByFac = new Map<string, ReferralSourceReviewSuggestion["contacts"]>();
  for (const c of contacts ?? []) {
    const fid = String((c as { facility_id: string }).facility_id);
    const name =
      String((c as { full_name?: string }).full_name ?? "").trim() ||
      [((c as { first_name?: string }).first_name ?? ""), ((c as { last_name?: string }).last_name ?? "")]
        .filter(Boolean)
        .join(" ")
        .trim();
    const list = contactsByFac.get(fid) ?? [];
    list.push({
      id: String((c as { id: string }).id),
      name: name || "Contact",
      role: (c as { title?: string | null }).title ?? null,
      phone:
        (c as { direct_phone?: string }).direct_phone ??
        (c as { mobile_phone?: string }).mobile_phone ??
        null,
      email: (c as { email?: string | null }).email ?? null,
    });
    contactsByFac.set(fid, list);
  }

  const lastActByFac = new Map<string, string>();
  for (const a of activities ?? []) {
    const fid = String((a as { facility_id: string }).facility_id);
    const at = String((a as { activity_at: string }).activity_at);
    if (!lastActByFac.has(fid)) lastActByFac.set(fid, at);
  }

  const profileByFac = new Map<string, { potential: string | null; status: string | null }>();
  for (const p of profiles ?? []) {
    profileByFac.set(String((p as { facility_id: string }).facility_id), {
      potential: (p as { referral_potential?: string | null }).referral_potential ?? null,
      status: (p as { relationship_status?: string | null }).relationship_status ?? null,
    });
  }

  const facById = new Map((facilities ?? []).map((f) => [String((f as { id: string }).id), f as Record<string, unknown>]));

  const suggestions: ReferralSourceReviewSuggestion[] = match.possible_matches
    .filter((m) => facById.has(m.facility_id))
    .map((m) => {
      const f = facById.get(m.facility_id)!;
      const profile = profileByFac.get(m.facility_id);
      return {
        facility_id: m.facility_id,
        facility_name: m.facility_name,
        address: buildFacilityFullAddress(f as Parameters<typeof buildFacilityFullAddress>[0]),
        city: (f.city as string | null) ?? m.city,
        phone: (f.main_phone as string | null) ?? null,
        match_confidence: m.confidence,
        match_reasons: m.reason.split(";").map((s) => s.trim()).filter(Boolean),
        match_badge: matchBadge(m.confidence),
        contacts: contactsByFac.get(m.facility_id) ?? [],
        last_activity_at: lastActByFac.get(m.facility_id) ?? null,
        referral_potential: profile?.potential ?? null,
        profile_status: profile?.status ?? null,
      };
    });

  suggestions.sort((a, b) => b.match_confidence - a.match_confidence);
  return suggestions;
}

async function mapLeadToReviewItem(
  row: Record<string, unknown>,
  staffById: Map<string, { full_name: string | null; email: string | null }>,
  includeSuggestions: boolean
): Promise<ReferralSourceReviewItem> {
  const contact = row.contacts as { full_name?: string; primary_phone?: string } | { full_name?: string; primary_phone?: string }[] | null;
  const c = Array.isArray(contact) ? contact[0] : contact;
  const attr = parseAttribution(row.referral_attribution_json);
  const typed = typedSourceFromAttribution(attr);
  const reviewedBy =
    typeof attr.reviewed_by === "string" && UUID_RE.test(attr.reviewed_by) ? attr.reviewed_by : null;

  const disciplines = Array.isArray(row.service_disciplines)
    ? (row.service_disciplines as string[]).join(", ")
    : null;

  let suggestions: ReferralSourceReviewSuggestion[] = [];
  if (includeSuggestions) {
    try {
      suggestions = await getReferralSourceReviewSuggestions(String(row.id));
    } catch (e) {
      console.warn("[source-review] suggestions:", e);
    }
  }

  return {
    lead_id: String(row.id),
    patient_name: String(c?.full_name ?? "Referral prospect"),
    phone: c?.primary_phone ?? null,
    service_needed: String(row.service_type ?? disciplines ?? "").trim() || null,
    payer: String(row.primary_payer_name ?? row.payer_name ?? "").trim() || null,
    created_at: String(row.created_at ?? new Date().toISOString()),
    status: String(row.status ?? "new"),
    referral_source_type: typeof row.referral_source_type === "string" ? row.referral_source_type : null,
    needs_referral_source_review: Boolean(row.needs_referral_source_review),
    match_confidence:
      typeof row.referral_source_match_confidence === "number"
        ? row.referral_source_match_confidence
        : null,
    match_reason:
      typeof row.referral_source_match_reason === "string" ? row.referral_source_match_reason : null,
    typed_source: typed,
    suggestions,
    reviewed_at: typeof attr.reviewed_at === "string" ? attr.reviewed_at : null,
    reviewed_by_label: reviewedBy ? staffLabelFromLookup(reviewedBy, staffById) : null,
    manual_facility_match: attr.manual_facility_match === true,
    review_outcome: typeof attr.review_outcome === "string" ? attr.review_outcome : null,
  };
}

export async function listReferralSourceReviewItems(
  staff: StaffProfile,
  filters: {
    status?: ReferralSourceReviewStatus;
    source_type?: string | null;
    search?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    limit?: number;
    offset?: number;
  }
): Promise<{ items: ReferralSourceReviewItem[]; total: number; summary: ReferralSourceReviewSummary }> {
  if (!canViewReferralSourceReview(staff)) {
    return {
      items: [],
      total: 0,
      summary: {
        pending: 0,
        reviewed: 0,
        matchedAfterReview: 0,
        facilitiesCreatedFromReview: 0,
        avgHoursToReview: null,
        topUnmatchedOfficeNames: [],
      },
    };
  }

  const limit = Math.min(Math.max(filters.limit ?? 30, 1), 100);
  const offset = Math.max(filters.offset ?? 0, 0);
  const status = filters.status ?? "needs_review";

  let query = leadRowsActiveOnly(
    supabaseAdmin
      .from("leads")
      .select(
        "id, status, source, referral_source_type, referring_facility_id, referral_attribution_json, needs_referral_source_review, referral_source_match_confidence, referral_source_match_reason, doctor_office_name, service_type, service_disciplines, primary_payer_name, payer_name, created_at, produced_by_user_id, contacts ( full_name, primary_phone )",
        { count: "exact" }
      )
      .eq("source", "facility_outreach")
  );

  if (status === "needs_review") {
    query = query.eq("needs_referral_source_review", true);
  } else if (status === "reviewed") {
    query = query.eq("needs_referral_source_review", false).not("referral_attribution_json", "is", null);
  }

  if (filters.source_type?.trim()) {
    query = query.eq("referral_source_type", filters.source_type.trim());
  }
  if (filters.start_date) query = query.gte("created_at", `${filters.start_date}T00:00:00.000Z`);
  if (filters.end_date) query = query.lte("created_at", `${filters.end_date}T23:59:59.999Z`);

  if (!canAccessFacilityAdminTools(staff)) {
    query = query.eq("produced_by_user_id", staff.user_id);
  }

  query = query.order("created_at", { ascending: false }).range(offset, offset + limit - 1);

  const { data, count } = await query;
  let rows = (data ?? []) as Record<string, unknown>[];

  if (status === "reviewed") {
    rows = rows.filter((r) => {
      const attr = parseAttribution(r.referral_attribution_json);
      return Boolean(attr.reviewed_at || attr.review_outcome);
    });
  } else if (status === "all") {
    rows = rows.filter(leadInReviewScope);
  }

  const search = (filters.search ?? "").trim().toLowerCase();
  if (search) {
    rows = rows.filter((r) => {
      const c = r.contacts as { full_name?: string } | { full_name?: string }[] | null;
      const name = (Array.isArray(c) ? c[0]?.full_name : c?.full_name) ?? "";
      const attr = parseAttribution(r.referral_attribution_json);
      const office = String(attr.typed_referring_facility_name ?? r.doctor_office_name ?? "");
      return name.toLowerCase().includes(search) || office.toLowerCase().includes(search);
    });
  }

  const { data: staffRows } = await supabaseAdmin
    .from("staff_profiles")
    .select("user_id, full_name, email")
    .eq("is_active", true);
  const staffById = new Map(
    (staffRows ?? []).map((s) => [
      String((s as { user_id: string }).user_id),
      {
        full_name: (s as { full_name?: string | null }).full_name ?? null,
        email: (s as { email?: string | null }).email ?? null,
      },
    ])
  );

  const items: ReferralSourceReviewItem[] = [];
  for (const row of rows) {
    items.push(await mapLeadToReviewItem(row, staffById, true));
  }

  const summary = await loadReferralSourceReviewSummary(staff);

  return { items, total: count ?? items.length, summary };
}

export async function loadReferralSourceReviewSummary(
  staff: StaffProfile
): Promise<ReferralSourceReviewSummary> {
  const empty: ReferralSourceReviewSummary = {
    pending: 0,
    reviewed: 0,
    matchedAfterReview: 0,
    facilitiesCreatedFromReview: 0,
    avgHoursToReview: null,
    topUnmatchedOfficeNames: [],
  };
  if (!canViewReferralSourceReview(staff)) return empty;

  let pendingQuery = leadRowsActiveOnly(
    supabaseAdmin
      .from("leads")
      .select("id, created_at, referral_attribution_json, doctor_office_name", { count: "exact" })
      .eq("source", "facility_outreach")
      .eq("needs_referral_source_review", true)
  );
  if (!canAccessFacilityAdminTools(staff)) {
    pendingQuery = pendingQuery.eq("produced_by_user_id", staff.user_id);
  }
  const { count: pending } = await pendingQuery;

  let reviewedQuery = leadRowsActiveOnly(
    supabaseAdmin
      .from("leads")
      .select("id, created_at, referral_attribution_json")
      .eq("source", "facility_outreach")
      .eq("needs_referral_source_review", false)
      .limit(500)
  );
  if (!canAccessFacilityAdminTools(staff)) {
    reviewedQuery = reviewedQuery.eq("produced_by_user_id", staff.user_id);
  }
  const { data: reviewedRows } = await reviewedQuery;

  let reviewed = 0;
  let matchedAfterReview = 0;
  let facilitiesCreated = 0;
  const reviewHours: number[] = [];
  const officeCounts = new Map<string, number>();

  for (const r of reviewedRows ?? []) {
    const attr = parseAttribution((r as { referral_attribution_json?: unknown }).referral_attribution_json);
    if (!attr.reviewed_at && !attr.review_outcome) continue;
    reviewed++;
    if (attr.manual_facility_match === true) matchedAfterReview++;
    if (attr.facility_created_from_review === true) facilitiesCreated++;
    const created = String((r as { created_at?: string }).created_at ?? "");
    const reviewedAt = String(attr.reviewed_at ?? "");
    if (created && reviewedAt) {
      const hrs = (new Date(reviewedAt).getTime() - new Date(created).getTime()) / 3600000;
      if (hrs >= 0) reviewHours.push(hrs);
    }
  }

  const { data: pendingRows } = await pendingQuery.limit(200);
  for (const r of pendingRows ?? []) {
    const attr = parseAttribution((r as { referral_attribution_json?: unknown }).referral_attribution_json);
    const name = String(
      attr.typed_referring_facility_name ?? (r as { doctor_office_name?: string }).doctor_office_name ?? ""
    ).trim();
    if (!name) continue;
    officeCounts.set(name, (officeCounts.get(name) ?? 0) + 1);
  }

  return {
    pending: pending ?? 0,
    reviewed,
    matchedAfterReview,
    facilitiesCreatedFromReview: facilitiesCreated,
    avgHoursToReview:
      reviewHours.length > 0
        ? Math.round((reviewHours.reduce((a, b) => a + b, 0) / reviewHours.length) * 10) / 10
        : null,
    topUnmatchedOfficeNames: [...officeCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count]) => ({ name, count })),
  };
}

function resolveReferralSourceTypeAfterMatch(current: string | null): string {
  const t = (current ?? "").toLowerCase();
  if (t === "unmatched_printed_qr") return "printed_qr_matched";
  if (t === "packet_link") return "packet_link";
  return current ?? "printed_qr_matched";
}

async function createContactFromTyped(
  facilityId: string,
  typed: ReferralSourceReviewTypedSource,
  createdBy: string
): Promise<string | null> {
  const name = (typed.referring_contact_name ?? "").trim();
  if (!name) return null;

  const parts = name.split(/\s+/);
  const first = parts[0] ?? "";
  const last = parts.slice(1).join(" ");

  const { data, error } = await supabaseAdmin
    .from("facility_contacts")
    .insert({
      facility_id: facilityId,
      full_name: name,
      first_name: first || null,
      last_name: last || null,
      direct_phone: typed.referring_contact_phone?.trim() || null,
      email: typed.referring_contact_email?.trim() || null,
      is_active: true,
    })
    .select("id")
    .maybeSingle();

  if (error || !data?.id) {
    console.warn("[source-review] create contact:", error?.message);
    return null;
  }
  return String(data.id);
}

async function storeReferralSourceAlias(input: {
  facilityId: string;
  contactId: string | null;
  typed: ReferralSourceReviewTypedSource;
  leadId: string;
  createdBy: string;
}): Promise<void> {
  const phone =
    normalizePhoneDigits(input.typed.referring_contact_phone ?? "") ||
    normalizePhoneDigits(input.typed.office_phone ?? "");
  const email = (input.typed.referring_contact_email ?? "").trim().toLowerCase();
  const domain = email.includes("@") ? email.slice(email.indexOf("@") + 1) : null;

  const { error } = await supabaseAdmin.from("facility_referral_source_aliases").insert({
    facility_id: input.facilityId,
    contact_id: input.contactId,
    alias_name: input.typed.referring_office_name?.trim() || null,
    alias_phone: phone.length >= 10 ? phone : null,
    alias_email_domain: domain,
    alias_city: input.typed.office_city?.trim() || null,
    created_from_lead_id: input.leadId,
    created_by: input.createdBy,
  });

  if (error) console.warn("[source-review] alias insert:", error.message);
}

async function finalizeSourceAttach(input: {
  staff: StaffProfile;
  leadId: string;
  lead: Record<string, unknown>;
  facilityId: string;
  contactId: string | null;
  note: string | null;
  confidenceBefore: number | null;
  facilityCreated?: boolean;
}): Promise<{ ok: true; activity_id?: string } | { ok: false; error: string }> {
  const attr = parseAttribution(input.lead.referral_attribution_json);
  const typed = typedSourceFromAttribution(attr);
  const now = new Date().toISOString();
  const refType = typeof input.lead.referral_source_type === "string" ? input.lead.referral_source_type : null;

  const { data: facility } = await supabaseAdmin
    .from("facilities")
    .select("id, name, assigned_rep_user_id")
    .eq("id", input.facilityId)
    .maybeSingle();

  if (!facility?.id) return { ok: false, error: "facility_not_found" };

  const facilityName = String((facility as { name?: string }).name ?? "Facility");
  const salesRepId =
    (typeof input.lead.produced_by_user_id === "string" ? input.lead.produced_by_user_id : null) ??
    (typeof (facility as { assigned_rep_user_id?: string }).assigned_rep_user_id === "string"
      ? (facility as { assigned_rep_user_id: string }).assigned_rep_user_id
      : null);

  const newAttr = {
    ...attr,
    facility_id: input.facilityId,
    facility_name: facilityName,
    contact_id: input.contactId,
    reviewed_by: input.staff.user_id,
    reviewed_at: now,
    manual_facility_match: true,
    review_note: input.note,
    confidence_before_manual_match: input.confidenceBefore,
    facility_created_from_review: input.facilityCreated === true,
  };

  const newRefType = resolveReferralSourceTypeAfterMatch(refType);

  const { error: updateErr } = await supabaseAdmin
    .from("leads")
    .update({
      referring_facility_id: input.facilityId,
      referring_facility_contact_id: input.contactId,
      referral_source_type: newRefType,
      referral_source: facilityName,
      needs_referral_source_review: false,
      referral_source_match_confidence: 1,
      referral_source_match_reason: input.note?.trim() || "Manually matched in source review",
      referral_attribution_json: newAttr,
      doctor_office_name: typed.referring_office_name ?? facilityName,
    })
    .eq("id", input.leadId);

  if (updateErr) return { ok: false, error: "lead_update_failed" };

  await supabaseAdmin
    .from("facilities")
    .update({ last_referral_at: now })
    .eq("id", input.facilityId);

  const { data: actRow, error: actErr } = await supabaseAdmin
    .from("facility_activities")
    .insert({
      facility_id: input.facilityId,
      facility_contact_id: input.contactId,
      staff_user_id: input.staff.user_id,
      activity_type: "Referral Received",
      outcome: "Referral Sent",
      activity_at: now,
      notes: ["Referral source manually matched from QR/source review.", input.note].filter(Boolean).join(" "),
      linked_lead_id: input.leadId,
      referral_created: true,
    })
    .select("id")
    .single();

  let activityId: string | undefined;
  if (actErr) {
    console.warn("[source-review] activity insert:", actErr.message);
  } else if (actRow?.id) {
    activityId = String(actRow.id);
    await supabaseAdmin
      .from("leads")
      .update({ referring_facility_activity_id: activityId })
      .eq("id", input.leadId);
  }

  await storeReferralSourceAlias({
    facilityId: input.facilityId,
    contactId: input.contactId,
    typed,
    leadId: input.leadId,
    createdBy: input.staff.user_id,
  });

  const contact = input.lead.contacts as { full_name?: string } | { full_name?: string }[] | null;
  const patientName = (Array.isArray(contact) ? contact[0]?.full_name : contact?.full_name) ?? "Referral prospect";

  queueFacilityNotification(() =>
    notifyReferralSourceReviewCompleted({
      leadId: input.leadId,
      facilityId: input.facilityId,
      facilityName,
      patientName,
      salesRepUserId: salesRepId,
      matched: true,
    })
  );

  if (salesRepId && salesRepId !== input.staff.user_id) {
    queueFacilityNotification(() =>
      notifyFacilityReferralCreated({
        leadId: input.leadId,
        facilityId: input.facilityId,
        facilityName,
        patientName,
        intakeOwnerUserId: null,
        salesRepUserId: salesRepId,
      })
    );
  }

  return { ok: true, activity_id: activityId };
}

export async function attachReferralSource(
  staff: StaffProfile,
  leadId: string,
  input: {
    facility_id: string;
    contact_id?: string | null;
    create_contact?: boolean;
    note?: string | null;
  }
): Promise<{ ok: true; activity_id?: string } | { ok: false; error: string }> {
  if (!canReviewReferralSources(staff)) return { ok: false, error: "forbidden" };
  if (!UUID_RE.test(leadId) || !UUID_RE.test(input.facility_id)) return { ok: false, error: "invalid_id" };

  const lead = await loadLeadForReview(leadId);
  if (!lead) return { ok: false, error: "not_found" };
  if (!lead.needs_referral_source_review && !leadInReviewScope(lead)) {
    return { ok: false, error: "already_reviewed" };
  }

  const attr = parseAttribution(lead.referral_attribution_json);
  const typed = typedSourceFromAttribution(attr);
  let contactId =
    input.contact_id && UUID_RE.test(input.contact_id) ? input.contact_id : null;

  if (!contactId && input.create_contact) {
    contactId = await createContactFromTyped(input.facility_id, typed, staff.user_id);
  }

  const confidenceBefore =
    typeof lead.referral_source_match_confidence === "number"
      ? lead.referral_source_match_confidence
      : null;

  return finalizeSourceAttach({
    staff,
    leadId,
    lead,
    facilityId: input.facility_id,
    contactId,
    note: input.note ?? null,
    confidenceBefore,
  });
}

export async function createFacilityFromReferralReview(
  staff: StaffProfile,
  leadId: string,
  input: {
    facility: {
      name: string;
      city?: string | null;
      state?: string | null;
      main_phone?: string | null;
      email?: string | null;
      type?: string | null;
    };
    contact?: {
      name?: string | null;
      phone?: string | null;
      email?: string | null;
    } | null;
    note?: string | null;
    skip_duplicate_check?: boolean;
  }
): Promise<
  | { ok: true; facility_id: string; contact_id: string | null; duplicate_warning?: string | null }
  | { ok: false; error: string; duplicate_warning?: string | null }
> {
  if (!canReviewReferralSources(staff)) return { ok: false, error: "forbidden" };
  if (!UUID_RE.test(leadId)) return { ok: false, error: "invalid_id" };

  const name = (input.facility.name ?? "").trim();
  if (!name) return { ok: false, error: "name_required" };

  const lead = await loadLeadForReview(leadId);
  if (!lead) return { ok: false, error: "not_found" };

  const attr = parseAttribution(lead.referral_attribution_json);
  const typed = typedSourceFromAttribution(attr);

  if (!input.skip_duplicate_check) {
    const match = await matchReferringFacilityFromPublicForm({
      referring_facility_name: name,
      referring_office_city: input.facility.city ?? typed.office_city,
      referring_office_phone: input.facility.main_phone ?? typed.office_phone,
      referring_contact_phone: typed.referring_contact_phone,
      referring_contact_email: typed.referring_contact_email,
    });
    const top = match.possible_matches[0];
    if (top && top.confidence >= 0.72) {
      return {
        ok: false,
        error: "possible_duplicate",
        duplicate_warning: `Similar facility exists: ${top.facility_name} (${Math.round(top.confidence * 100)}% match). Attach that facility instead or confirm create.`,
      };
    }
  }

  const { data: facRow, error: facErr } = await supabaseAdmin
    .from("facilities")
    .insert({
      name,
      city: (input.facility.city ?? typed.office_city ?? "").trim() || null,
      state: (input.facility.state ?? "").trim() || null,
      main_phone: (input.facility.main_phone ?? typed.office_phone ?? "").trim() || null,
      email: (input.facility.email ?? typed.referring_contact_email ?? "").trim() || null,
      type: (input.facility.type ?? "").trim() || null,
      status: "New",
      priority: "Medium",
      is_active: true,
      general_notes: "Created from public referral source review.",
    })
    .select("id")
    .maybeSingle();

  if (facErr || !facRow?.id) return { ok: false, error: "facility_create_failed" };
  const facilityId = String(facRow.id);

  let contactId: string | null = null;
  const contactName = (input.contact?.name ?? typed.referring_contact_name ?? "").trim();
  if (contactName) {
    contactId = await createContactFromTyped(
      facilityId,
      {
        ...typed,
        referring_contact_name: contactName,
        referring_contact_phone: input.contact?.phone ?? typed.referring_contact_phone,
        referring_contact_email: input.contact?.email ?? typed.referring_contact_email,
      },
      staff.user_id
    );
  }

  const confidenceBefore =
    typeof lead.referral_source_match_confidence === "number"
      ? lead.referral_source_match_confidence
      : null;

  const attachResult = await finalizeSourceAttach({
    staff,
    leadId,
    lead,
    facilityId,
    contactId,
    note: input.note ?? "New facility created from source review.",
    confidenceBefore,
    facilityCreated: true,
  });

  if (!attachResult.ok) return attachResult;

  return { ok: true, facility_id: facilityId, contact_id: contactId };
}

export async function markReferralSourceReviewed(
  staff: StaffProfile,
  leadId: string,
  input: { reason: ReferralSourceReviewMarkReason; notes?: string | null }
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!canReviewReferralSources(staff)) return { ok: false, error: "forbidden" };
  if (!UUID_RE.test(leadId)) return { ok: false, error: "invalid_id" };

  const lead = await loadLeadForReview(leadId);
  if (!lead) return { ok: false, error: "not_found" };
  if (!lead.needs_referral_source_review) return { ok: false, error: "already_reviewed" };

  const attr = parseAttribution(lead.referral_attribution_json);
  const now = new Date().toISOString();

  const { error } = await supabaseAdmin
    .from("leads")
    .update({
      needs_referral_source_review: false,
      referral_attribution_json: {
        ...attr,
        reviewed_by: staff.user_id,
        reviewed_at: now,
        review_outcome: input.reason,
        review_notes: (input.notes ?? "").trim() || null,
        manual_facility_match: false,
      },
    })
    .eq("id", leadId);

  if (error) return { ok: false, error: "update_failed" };

  const contact = lead.contacts as { full_name?: string } | { full_name?: string }[] | null;
  const patientName = (Array.isArray(contact) ? contact[0]?.full_name : contact?.full_name) ?? "Referral prospect";

  queueFacilityNotification(() =>
    notifyReferralSourceReviewCompleted({
      leadId,
      facilityId: null,
      facilityName: null,
      patientName,
      salesRepUserId:
        typeof lead.produced_by_user_id === "string" ? lead.produced_by_user_id : null,
      matched: false,
    })
  );

  return { ok: true };
}

export async function loadLeadReferralSourceReviewPanel(leadId: string): Promise<{
  needs_review: boolean;
  typed_source: ReferralSourceReviewTypedSource;
  match_confidence: number | null;
  match_reason: string | null;
  referral_source_type: string | null;
  reviewed_at: string | null;
  reviewed_by_label: string | null;
  review_outcome: string | null;
  facility_name: string | null;
  facility_id: string | null;
  suggestions: ReferralSourceReviewSuggestion[];
} | null> {
  if (!UUID_RE.test(leadId)) return null;
  const lead = await loadLeadForReview(leadId);
  if (!lead || String(lead.source ?? "") !== "facility_outreach") return null;

  const attr = parseAttribution(lead.referral_attribution_json);
  const reviewedBy =
    typeof attr.reviewed_by === "string" && UUID_RE.test(attr.reviewed_by) ? attr.reviewed_by : null;

  let reviewedByLabel: string | null = null;
  if (reviewedBy) {
    const { data: rep } = await supabaseAdmin
      .from("staff_profiles")
      .select("full_name, email")
      .eq("user_id", reviewedBy)
      .maybeSingle();
    reviewedByLabel = staffLabelFromLookup(reviewedBy, {
      [reviewedBy]: {
        full_name: (rep as { full_name?: string | null } | null)?.full_name ?? null,
        email: (rep as { email?: string | null } | null)?.email ?? null,
      },
    });
  }

  let facilityName: string | null = null;
  const facilityId =
    typeof lead.referring_facility_id === "string" ? lead.referring_facility_id : null;
  if (facilityId) {
    const { data: f } = await supabaseAdmin.from("facilities").select("name").eq("id", facilityId).maybeSingle();
    facilityName = String((f as { name?: string } | null)?.name ?? "") || null;
  }

  const needsReview = Boolean(lead.needs_referral_source_review);
  const suggestions = needsReview ? await getReferralSourceReviewSuggestions(leadId) : [];

  return {
    needs_review: needsReview,
    typed_source: typedSourceFromAttribution(attr),
    match_confidence:
      typeof lead.referral_source_match_confidence === "number"
        ? lead.referral_source_match_confidence
        : null,
    match_reason:
      typeof lead.referral_source_match_reason === "string" ? lead.referral_source_match_reason : null,
    referral_source_type:
      typeof lead.referral_source_type === "string" ? lead.referral_source_type : null,
    reviewed_at: typeof attr.reviewed_at === "string" ? attr.reviewed_at : null,
    reviewed_by_label: reviewedByLabel,
    review_outcome: typeof attr.review_outcome === "string" ? attr.review_outcome : null,
    facility_name: facilityName,
    facility_id: facilityId,
    suggestions,
  };
}
