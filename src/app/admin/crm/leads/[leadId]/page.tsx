import { notFound, redirect } from "next/navigation";

import { LeadWorkspace } from "../lead-workspace";
import { isLeadPipelineTerminal, isValidLeadPipelineStatus } from "@/lib/crm/lead-pipeline-status";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type ContactEmb = {
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  primary_phone?: string | null;
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
  const { data: row, error } = await supabase
    .from("leads")
    .select(
      "id, contact_id, source, status, owner_user_id, next_action, follow_up_date, last_contact_at, last_outcome, last_note, referring_doctor_name, doctor_office_name, doctor_office_phone, doctor_office_fax, doctor_office_contact_person, referring_provider_name, referring_provider_phone, payer_name, payer_type, referral_source, service_type, service_disciplines, intake_status, contacts ( full_name, first_name, last_name, primary_phone, email, address_line_1, address_line_2, city, state, zip, notes )"
    )
    .eq("id", leadId.trim())
    .maybeSingle();

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
    email: str(c?.email),
    address_line_1: str(c?.address_line_1),
    address_line_2: str(c?.address_line_2),
    city: str(c?.city),
    state: str(c?.state),
    zip: str(c?.zip),
    notes: str(c?.notes),
  };

  const lastContactAt = typeof L.last_contact_at === "string" && L.last_contact_at.trim() ? L.last_contact_at : null;
  const lastOutcome = typeof L.last_outcome === "string" && L.last_outcome.trim() ? L.last_outcome.trim() : null;
  const lastNote = typeof L.last_note === "string" ? L.last_note : "";

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
      leadDisciplinesForForm={leadDisciplinesForForm}
      intakeDefaults={intakeDefaults}
      contactProfileDefaults={contactProfileDefaults}
      staffOptions={staffOptions}
      lastContactAt={lastContactAt}
      lastOutcome={lastOutcome}
      lastNote={lastNote}
    />
  );
}
