import { notFound, redirect } from "next/navigation";

import { LeadWorkspace } from "../lead-workspace";
import { parseEmploymentApplicationMeta, type EmploymentApplicationMeta } from "@/lib/crm/lead-employment-meta";
import { parseLeadIntakeRequestFromMetadata } from "@/lib/crm/lead-intake-request";
import { isLeadPipelineTerminal, isValidLeadPipelineStatus } from "@/lib/crm/lead-pipeline-status";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";
import { supabaseAdmin } from "@/lib/admin";
import type { LeadActivityRow } from "@/lib/crm/lead-activities-timeline";
import { isMissingSchemaObjectError } from "@/lib/crm/supabase-migration-fallback";
import { leadRowsActiveOnly } from "@/lib/crm/leads-active";
import { LEAD_INSURANCE_BUCKET } from "@/lib/crm/lead-insurance-storage";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type ContactEmb = {
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  primary_phone?: string | null;
  secondary_phone?: string | null;
  email?: string | null;
  address_line_1?: string | null;
  address_line_2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  notes?: string | null;
};

function contactDisplayName(c: ContactEmb | null): string {
  if (!c) return "—";
  const fn = (c.full_name ?? "").trim();
  if (fn) return fn;
  const parts = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
  return parts || "—";
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

async function leadInsuranceSignedUrl(path: string | null | undefined): Promise<string | null> {
  if (!path || typeof path !== "string" || !path.trim()) return null;
  const { data, error } = await supabaseAdmin.storage
    .from(LEAD_INSURANCE_BUCKET)
    .createSignedUrl(path.trim(), 3600);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/** Without `medicare_*` — works before migration `20260413120000_lead_activities_medicare.sql`. */
const LEAD_DETAIL_CONTACTS_EMBED =
  "contacts ( full_name, first_name, last_name, primary_phone, secondary_phone, email, address_line_1, address_line_2, city, state, zip, notes )";

const LEAD_DETAIL_SELECT_CORE =
  "id, contact_id, source, status, owner_user_id, lead_type, next_action, follow_up_date, follow_up_at, created_at, last_contact_at, last_contact_type, last_outcome, last_note, notes, external_source_metadata, referring_doctor_name, doctor_office_name, doctor_office_phone, doctor_office_fax, doctor_office_contact_person, referring_provider_name, referring_provider_phone, payer_name, payer_type, referral_source, service_type, service_disciplines, intake_status, dob, primary_insurance_file_url, secondary_insurance_file_url";

const LEAD_DETAIL_SELECT_WITH_MEDICARE = `${LEAD_DETAIL_SELECT_CORE}, medicare_number, medicare_effective_date, medicare_notes, ${LEAD_DETAIL_CONTACTS_EMBED}`;
const LEAD_DETAIL_SELECT_LEGACY = `${LEAD_DETAIL_SELECT_CORE}, ${LEAD_DETAIL_CONTACTS_EMBED}`;

export default async function LeadIntakePage({
  params,
  searchParams,
}: {
  params: Promise<{ leadId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    redirect("/admin");
  }

  const { leadId } = await params;
  if (!leadId?.trim()) {
    notFound();
  }

  const sp = searchParams ? await searchParams : {};
  const convertErrRaw =
    typeof sp.convertError === "string" ? sp.convertError : Array.isArray(sp.convertError) ? sp.convertError[0] : "";
  let convertErr = "";
  if (convertErrRaw) {
    const t = convertErrRaw.trim();
    try {
      convertErr = decodeURIComponent(t);
    } catch {
      convertErr = t;
    }
  }

  const supabase = await createServerSupabaseClient();

  let rowRes = await leadRowsActiveOnly(
    supabase.from("leads").select(LEAD_DETAIL_SELECT_WITH_MEDICARE).eq("id", leadId.trim())
  ).maybeSingle();

  if (rowRes.error && isMissingSchemaObjectError(rowRes.error)) {
    rowRes = await leadRowsActiveOnly(
      supabase.from("leads").select(LEAD_DETAIL_SELECT_LEGACY).eq("id", leadId.trim())
    ).maybeSingle();
  }

  const { data: row, error } = rowRes;

  if (error || !row?.id) {
    notFound();
  }

  const { data: staffRows } = await supabase
    .from("staff_profiles")
    .select("user_id, email, full_name")
    .order("email", { ascending: true });

  const staffOptions = (staffRows ?? []) as {
    user_id: string;
    email: string | null;
    full_name: string | null;
  }[];

  const cr = row.contacts as ContactEmb | ContactEmb[] | null;
  const c = Array.isArray(cr) ? cr[0] : cr;

  const L = row as Record<string, unknown>;
  const contactId = typeof L.contact_id === "string" && L.contact_id.trim() ? L.contact_id.trim() : "";

  const { data: patientRow } = contactId
    ? await supabase.from("patients").select("id").eq("contact_id", contactId).maybeSingle()
    : { data: null };

  const patientId = patientRow?.id ? String(patientRow.id) : null;

  const serviceDisciplinesRaw = Array.isArray(L.service_disciplines)
    ? (L.service_disciplines as unknown[]).filter((x): x is string => typeof x === "string" && x.trim() !== "")
    : [];
  const serviceTypeLegacy = typeof L.service_type === "string" ? L.service_type.trim() : "";
  const leadDisciplinesForForm =
    serviceDisciplinesRaw.length > 0
      ? serviceDisciplinesRaw
      : serviceTypeLegacy
        ? serviceTypeLegacy.split(",").map((s) => s.trim()).filter(Boolean)
        : [];

  const ownerUid =
    typeof L.owner_user_id === "string" && L.owner_user_id.trim() ? L.owner_user_id.trim() : "";
  const nextActionVal = typeof L.next_action === "string" && L.next_action.trim() ? L.next_action.trim() : "";
  const followUpRaw = L.follow_up_date;
  const followUpIso =
    typeof followUpRaw === "string" && /^\d{4}-\d{2}-\d{2}/.test(followUpRaw)
      ? followUpRaw.slice(0, 10)
      : "";

  const followUpAtRaw = L.follow_up_at;
  const followUpAtIso =
    typeof followUpAtRaw === "string" && followUpAtRaw.trim() ? followUpAtRaw.trim() : null;

  const rawStatus = typeof L.status === "string" ? L.status.trim() : "";
  const pipelineDefault =
    rawStatus && isValidLeadPipelineStatus(rawStatus) && !isLeadPipelineTerminal(rawStatus)
      ? rawStatus
      : rawStatus && !isValidLeadPipelineStatus(rawStatus)
        ? rawStatus
        : "new";
  const terminal = isLeadPipelineTerminal(rawStatus);
  const isConverted = rawStatus.toLowerCase() === "converted";
  const isDead = rawStatus.toLowerCase() === "dead_lead";

  const primaryPhone = typeof c?.primary_phone === "string" ? c.primary_phone.trim() : "";
  const secondaryPhone = typeof c?.secondary_phone === "string" ? c.secondary_phone.trim() : "";

  const contactFullNameDefault =
    (typeof c?.full_name === "string" && c.full_name.trim()) ||
    [c?.first_name, c?.last_name]
      .map((x) => (typeof x === "string" ? x.trim() : ""))
      .filter(Boolean)
      .join(" ")
      .trim() ||
    "";

  const contactProfileDefaults = {
    fullName: contactFullNameDefault,
    primaryPhone,
    secondaryPhone,
    email: str(c?.email),
    address_line_1: str(c?.address_line_1),
    address_line_2: str(c?.address_line_2),
    city: str(c?.city),
    state: str(c?.state),
    zip: str(c?.zip),
    notes: str(c?.notes),
  };

  const lastContactAt = typeof L.last_contact_at === "string" && L.last_contact_at.trim() ? L.last_contact_at : null;
  const lastContactType =
    typeof L.last_contact_type === "string" && L.last_contact_type.trim() ? L.last_contact_type.trim() : null;
  const lastOutcome = typeof L.last_outcome === "string" && L.last_outcome.trim() ? L.last_outcome.trim() : null;
  const lastNote = typeof L.last_note === "string" ? L.last_note : "";
  const leadCreatedAt = typeof L.created_at === "string" && L.created_at.trim() ? L.created_at : null;

  const leadTypeRaw = typeof L.lead_type === "string" ? L.lead_type.trim() : "";
  const isEmployeeLead = leadTypeRaw === "employee";
  const employmentMeta: EmploymentApplicationMeta | null = isEmployeeLead
    ? parseEmploymentApplicationMeta(L.external_source_metadata)
    : null;
  const referralSourceLine = str(L.referral_source);

  const intakeDefaults = {
    referring_doctor_name: str(L.referring_doctor_name),
    doctor_office_name: str(L.doctor_office_name),
    doctor_office_phone: str(L.doctor_office_phone),
    doctor_office_fax: str(L.doctor_office_fax),
    doctor_office_contact_person: str(L.doctor_office_contact_person),
    referring_provider_name: str(L.referring_provider_name),
    referring_provider_phone: str(L.referring_provider_phone),
    payer_name: str(L.payer_name),
    payer_type: str(L.payer_type),
    referral_source: str(L.referral_source),
    intake_status: str(L.intake_status),
  };

  const intakeRequestDefaults = parseLeadIntakeRequestFromMetadata(L.external_source_metadata);

  const dobRaw = L.dob;
  const dobIso =
    typeof dobRaw === "string" && /^\d{4}-\d{2}-\d{2}/.test(dobRaw)
      ? dobRaw.slice(0, 10)
      : null;

  const primaryInsurancePath =
    typeof L.primary_insurance_file_url === "string" && L.primary_insurance_file_url.trim() !== ""
      ? L.primary_insurance_file_url.trim()
      : null;
  const secondaryInsurancePath =
    typeof L.secondary_insurance_file_url === "string" && L.secondary_insurance_file_url.trim() !== ""
      ? L.secondary_insurance_file_url.trim()
      : null;

  const [primaryInsuranceViewUrl, secondaryInsuranceViewUrl] = await Promise.all([
    leadInsuranceSignedUrl(primaryInsurancePath),
    leadInsuranceSignedUrl(secondaryInsurancePath),
  ]);

  const activityRes = await supabaseAdmin
    .from("lead_activities")
    .select("id, lead_id, event_type, body, metadata, created_at, created_by_user_id, deleted_at, deletable")
    .eq("lead_id", leadId.trim())
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  let initialActivities: LeadActivityRow[] = [];
  if (activityRes.error) {
    if (isMissingSchemaObjectError(activityRes.error)) {
      console.warn("[crm/lead detail] lead_activities unavailable (migration not applied?):", activityRes.error.message);
    } else {
      console.warn("[crm/lead detail] lead_activities query failed:", activityRes.error.message);
    }
  } else {
    initialActivities = (activityRes.data ?? []) as LeadActivityRow[];
  }

  const medicareNum = typeof L.medicare_number === "string" ? L.medicare_number : "";
  const medicareNotesStr = typeof L.medicare_notes === "string" ? L.medicare_notes : "";
  const medicareEffRaw = L.medicare_effective_date;
  const medicareEffectiveDateIso =
    typeof medicareEffRaw === "string" && /^\d{4}-\d{2}-\d{2}/.test(medicareEffRaw)
      ? medicareEffRaw.slice(0, 10)
      : "";

  return (
    <LeadWorkspace
      mode="existing"
      leadId={String(L.id)}
      contactId={contactId}
      displayName={contactDisplayName(c ?? null)}
      sourceRaw={str(L.source)}
      rawStatus={rawStatus}
      pipelineDefault={pipelineDefault}
      terminal={terminal}
      isConverted={isConverted}
      isDead={isDead}
      primaryPhone={primaryPhone}
      patientId={patientId}
      convertErr={convertErr}
      ownerUid={ownerUid}
      nextActionVal={nextActionVal}
      followUpIso={followUpIso}
      followUpAtIso={followUpAtIso}
      leadDisciplinesForForm={leadDisciplinesForForm}
      intakeDefaults={intakeDefaults}
      contactProfileDefaults={contactProfileDefaults}
      staffOptions={staffOptions}
      lastContactAt={lastContactAt}
      lastContactType={lastContactType}
      lastOutcome={lastOutcome}
      lastNote={lastNote}
      leadCreatedAt={leadCreatedAt}
      isEmployeeLead={isEmployeeLead}
      employmentMeta={employmentMeta}
      referralSourceLine={referralSourceLine}
      applicationNotes={typeof L.notes === "string" ? L.notes : ""}
      intakeRequestDefaults={intakeRequestDefaults}
      dobIso={dobIso}
      primaryInsurancePath={primaryInsurancePath}
      secondaryInsurancePath={secondaryInsurancePath}
      primaryInsuranceViewUrl={primaryInsuranceViewUrl}
      secondaryInsuranceViewUrl={secondaryInsuranceViewUrl}
      medicareNumber={medicareNum}
      medicareEffectiveDateIso={medicareEffectiveDateIso}
      medicareNotes={medicareNotesStr}
      initialActivities={initialActivities}
    />
  );
}
