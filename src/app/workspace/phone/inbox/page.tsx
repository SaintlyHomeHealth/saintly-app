import Link from "next/link";
import { redirect } from "next/navigation";
import { InboxIcon, MessageCircleMore } from "lucide-react";

import { InboxSearchBar } from "./_components/InboxSearchBar";
import { WorkspacePhonePageHeader } from "../_components/WorkspacePhonePageHeader";
import { leadRowsActiveOnly } from "@/lib/crm/leads-active";
import { labelForContactType } from "@/lib/crm/contact-types";
import { formatLeadPipelineStatusLabel } from "@/lib/crm/lead-pipeline-status";
import { formatAdminPhoneWhen } from "@/lib/phone/format-admin-when";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";
import { routePerfLog, routePerfStart } from "@/lib/perf/route-perf";
import { isValidE164 } from "@/lib/softphone/phone-number";
import {
  canAccessWorkspacePhone,
  getStaffProfile,
  hasFullCallVisibility,
  isWorkspaceEmployeeRole,
} from "@/lib/staff-profile";
import { supabaseAdmin } from "@/lib/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { buildWorkspaceKeypadCallHref, pickOutboundE164ForDial } from "@/lib/workspace-phone/launch-urls";

type ContactEmbed = {
  id?: unknown;
  full_name?: unknown;
  first_name?: unknown;
  last_name?: unknown;
  primary_phone?: unknown;
  contact_type?: unknown;
  email?: unknown;
};

function crmDisplayNameFromContactsRaw(contactsRaw: unknown): string | null {
  let emb: ContactEmbed | null = null;
  if (contactsRaw && typeof contactsRaw === "object" && !Array.isArray(contactsRaw)) {
    emb = contactsRaw as ContactEmbed;
  } else if (Array.isArray(contactsRaw) && contactsRaw[0] && typeof contactsRaw[0] === "object") {
    emb = contactsRaw[0] as ContactEmbed;
  }
  const fn = emb && typeof emb.full_name === "string" ? emb.full_name.trim() : "";
  const f1 = emb && typeof emb.first_name === "string" ? emb.first_name : null;
  const f2 = emb && typeof emb.last_name === "string" ? emb.last_name : null;
  return fn || [f1, f2].filter(Boolean).join(" ").trim() || null;
}

function normalizeContact(contactsRaw: unknown): ContactEmbed | null {
  if (contactsRaw && typeof contactsRaw === "object" && !Array.isArray(contactsRaw)) {
    return contactsRaw as ContactEmbed;
  }
  if (Array.isArray(contactsRaw) && contactsRaw[0] && typeof contactsRaw[0] === "object") {
    return contactsRaw[0] as ContactEmbed;
  }
  return null;
}

function leadChipLabel(raw: unknown): string {
  const v = typeof raw === "string" ? raw.trim() : "";
  if (!v) return "Unclassified";
  if (v === "new_lead") return "New lead";
  return v.replace(/_/g, " ");
}

function unreadCountFromMetadata(raw: unknown): number {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return 0;
  const v = (raw as Record<string, unknown>).unread_count;
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

function parseVoiceAiMini(meta: unknown): {
  summary: string | null;
  category: string | null;
  urgency: string | null;
  recommended_action: string | null;
  excerpt: string | null;
} {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return { summary: null, category: null, urgency: null, recommended_action: null, excerpt: null };
  }
  const v = (meta as Record<string, unknown>).voice_ai;
  if (!v || typeof v !== "object" || Array.isArray(v)) {
    return { summary: null, category: null, urgency: null, recommended_action: null, excerpt: null };
  }
  const o = v as Record<string, unknown>;
  const summary = typeof o.short_summary === "string" ? o.short_summary.trim().slice(0, 280) : null;
  const category = typeof o.caller_category === "string" ? o.caller_category.trim() : null;
  const urgency = typeof o.urgency === "string" ? o.urgency.trim() : null;
  const recommended_action =
    typeof o.recommended_action === "string" ? o.recommended_action.trim().slice(0, 220) : null;
  const excerpt =
    typeof o.live_transcript_excerpt === "string" ? o.live_transcript_excerpt.trim().slice(0, 200) : null;
  return {
    summary: summary || null,
    category: category || null,
    urgency: urgency || null,
    recommended_action: recommended_action || null,
    excerpt: excerpt || null,
  };
}

function entityLabel(input: {
  metadata: unknown;
  primaryContactId: string | null;
  contact: ContactEmbed | null;
  leadId: string | null;
  patientId: string | null;
}): string {
  const meta = input.metadata;
  const unknownTexter =
    meta &&
    typeof meta === "object" &&
    !Array.isArray(meta) &&
    (meta as Record<string, unknown>).unknown_texter === true;
  if (!input.primaryContactId && unknownTexter) return "Unknown";
  if (input.patientId) return "Patient";
  if (input.leadId) return "Lead";
  const ct = input.contact?.contact_type;
  if (typeof ct === "string" && ct.trim()) {
    const lab = labelForContactType(ct);
    if (lab !== "—") return lab;
  }
  return input.primaryContactId ? "Contact" : "Unknown";
}

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function WorkspaceInboxPage({ searchParams }: PageProps) {
  const perfStart = routePerfStart();
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff)) {
    redirect("/admin/phone");
  }

  const sp = (await searchParams) ?? {};
  const qRaw = typeof sp.q === "string" ? sp.q.trim() : "";
  const selectedRaw = typeof sp.selected === "string" ? sp.selected.trim() : "";

  const hasFull = hasFullCallVisibility(staff);
  const supabase = await createServerSupabaseClient();

  let q = supabase
    .from("conversations")
    .select(
      "id, main_phone_e164, last_message_at, lead_status, assigned_to_user_id, primary_contact_id, metadata, next_action, follow_up_due_at, follow_up_completed_at, contacts ( id, full_name, first_name, last_name, primary_phone, contact_type, email )"
    )
    .eq("channel", "sms")
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(80);

  if (!hasFull) {
    q = q.or(`assigned_to_user_id.eq.${staff.user_id},assigned_to_user_id.is.null`);
  }

  const { data: convRows, error } = await q;
  if (error && process.env.NODE_ENV === "development") {
    console.warn("[workspace/phone/inbox] list:", error.message);
  }

  let rows = convRows ?? [];
  if (qRaw) {
    const ql = qRaw.toLowerCase();
    rows = rows.filter((r) => {
      const phone = typeof r.main_phone_e164 === "string" ? r.main_phone_e164.toLowerCase() : "";
      const name = (crmDisplayNameFromContactsRaw(r.contacts) ?? "").toLowerCase();
      return phone.includes(ql) || name.includes(ql);
    });
  }

  const ids = rows.map((r) => r.id as string);
  const previewByConvId: Record<string, string> = {};
  if (ids.length > 0) {
    const previewRowCap = Math.min(500, Math.max(120, ids.length * 8));
    const { data: msgRows } = await supabase
      .from("messages")
      .select("conversation_id, body, created_at")
      .in("conversation_id", ids)
      .order("created_at", { ascending: false })
      .limit(previewRowCap);

    const seen = new Set<string>();
    for (const m of msgRows ?? []) {
      const cid = typeof m.conversation_id === "string" ? m.conversation_id : "";
      if (!cid || seen.has(cid)) continue;
      seen.add(cid);
      const body = typeof m.body === "string" ? m.body.trim() : "";
      previewByConvId[cid] = body.slice(0, 100) + (body.length > 100 ? "…" : "");
    }
  }

  const contactIds = [
    ...new Set(
      rows
        .map((r) => {
          const pc = (r as { primary_contact_id?: unknown }).primary_contact_id;
          return pc != null && String(pc).trim() !== "" ? String(pc).trim() : null;
        })
        .filter((x): x is string => Boolean(x))
    ),
  ];

  const leadByContactId = new Map<string, { id: string; status: string | null }>();
  const patientByContactId = new Map<string, string>();

  if (contactIds.length > 0) {
    const [leadsRes, patientsRes] = await Promise.all([
      leadRowsActiveOnly(
        supabase.from("leads").select("id, contact_id, status").in("contact_id", contactIds)
      ),
      supabase.from("patients").select("id, contact_id").in("contact_id", contactIds),
    ]);
    if (leadsRes.error && process.env.NODE_ENV === "development") {
      console.warn("[workspace/phone/inbox] leads lookup:", leadsRes.error.message);
    }
    if (patientsRes.error && process.env.NODE_ENV === "development") {
      console.warn("[workspace/phone/inbox] patients lookup:", patientsRes.error.message);
    }
    for (const row of leadsRes.data ?? []) {
      const cid = typeof row.contact_id === "string" ? row.contact_id : "";
      const lid = typeof row.id === "string" ? row.id : "";
      if (cid && lid && !leadByContactId.has(cid)) {
        leadByContactId.set(cid, { id: lid, status: typeof row.status === "string" ? row.status : null });
      }
    }
    for (const row of patientsRes.data ?? []) {
      const cid = typeof row.contact_id === "string" ? row.contact_id : "";
      const pid = typeof row.id === "string" ? row.id : "";
      if (cid && pid) patientByContactId.set(cid, pid);
    }
  }

  const selectedId = selectedRaw && rows.some((r) => String(r.id) === selectedRaw) ? selectedRaw : ids[0] ?? null;
  const selectedRow = rows.find((r) => String(r.id) === selectedId) ?? null;

  const selectedContact = selectedRow ? normalizeContact(selectedRow.contacts) : null;
  const selectedPrimaryContactId =
    selectedRow &&
    (selectedRow as { primary_contact_id?: unknown }).primary_contact_id != null &&
    String((selectedRow as { primary_contact_id?: unknown }).primary_contact_id).trim() !== ""
      ? String((selectedRow as { primary_contact_id?: unknown }).primary_contact_id)
      : null;

  const selectedLead =
    selectedPrimaryContactId && leadByContactId.has(selectedPrimaryContactId)
      ? leadByContactId.get(selectedPrimaryContactId)!
      : null;
  const selectedPatientId =
    selectedPrimaryContactId && patientByContactId.has(selectedPrimaryContactId)
      ? patientByContactId.get(selectedPrimaryContactId)!
      : null;

  const selectedName = selectedRow ? crmDisplayNameFromContactsRaw(selectedRow.contacts) : null;
  const selectedPhoneRaw =
    selectedRow && typeof selectedRow.main_phone_e164 === "string" && selectedRow.main_phone_e164.trim()
      ? selectedRow.main_phone_e164.trim()
      : "";
  const selectedPhoneDisplay = selectedPhoneRaw ? formatPhoneForDisplay(selectedPhoneRaw) : "—";
  const selectedPreview = selectedId ? previewByConvId[selectedId] ?? "" : "";
  const selectedAiConv = selectedRow ? parseVoiceAiMini((selectedRow as { metadata?: unknown }).metadata) : null;
  const selectedNextAction =
    selectedRow && typeof (selectedRow as { next_action?: unknown }).next_action === "string"
      ? (selectedRow as { next_action: string }).next_action.trim()
      : "";
  const selectedFollowUpDue =
    selectedRow && typeof (selectedRow as { follow_up_due_at?: unknown }).follow_up_due_at === "string"
      ? (selectedRow as { follow_up_due_at: string }).follow_up_due_at
      : null;
  const selectedFollowUpDone =
    selectedRow && typeof (selectedRow as { follow_up_completed_at?: unknown }).follow_up_completed_at === "string"
      ? (selectedRow as { follow_up_completed_at: string }).follow_up_completed_at
      : null;

  let lastCallLine: string | null = null;
  let selectedAiFromPhone: ReturnType<typeof parseVoiceAiMini> | null = null;
  if (selectedPrimaryContactId) {
    const { data: callRow } = await supabase
      .from("phone_calls")
      .select("created_at, status, direction, metadata")
      .eq("contact_id", selectedPrimaryContactId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (callRow && typeof callRow.created_at === "string") {
      const dir = typeof callRow.direction === "string" ? callRow.direction.toLowerCase() : "";
      const st = typeof callRow.status === "string" ? callRow.status : "—";
      lastCallLine = `${formatAdminPhoneWhen(callRow.created_at)} · ${dir || "call"} · ${st}`;
      selectedAiFromPhone = parseVoiceAiMini(callRow.metadata);
    }
  }

  const selectedAi =
    selectedAiFromPhone &&
    (selectedAiFromPhone.summary ||
      selectedAiFromPhone.category ||
      selectedAiFromPhone.urgency ||
      selectedAiFromPhone.recommended_action ||
      selectedAiFromPhone.excerpt)
      ? selectedAiFromPhone
      : selectedAiConv;

  const dialE164 = pickOutboundE164ForDial(selectedPhoneRaw);
  const canOpenLeadInCrm = Boolean(selectedLead) && !isWorkspaceEmployeeRole(staff.role);
  const nurseOrClinical = isWorkspaceEmployeeRole(staff.role);

  const workspaceCallHref =
    selectedPhoneRaw && dialE164 && isValidE164(dialE164)
      ? buildWorkspaceKeypadCallHref({
          dial: dialE164,
          leadId: selectedLead?.id,
          contactId: selectedPrimaryContactId ?? undefined,
          contextName: selectedName ?? undefined,
        })
      : null;

  /**
   * `/workspace/phone/patients/[patientId]` only loads when this user has an active
   * `patient_assignments` row (same guard as the hub detail page). Linking CRM patient id
   * without that assignment yields 404 — fall back to the patient list.
   */
  let canOpenWorkspacePatientDetail = false;
  if (selectedPatientId) {
    const { data: assignRows } = await supabaseAdmin
      .from("patient_assignments")
      .select("id")
      .eq("patient_id", selectedPatientId)
      .eq("assigned_user_id", staff.user_id)
      .eq("is_active", true)
      .limit(1);
    canOpenWorkspacePatientDetail = Boolean(assignRows?.length);
  }

  if (perfStart) {
    routePerfLog("workspace/phone/inbox", perfStart);
  }

  const linkParams = (id: string) =>
    new URLSearchParams({ selected: id, ...(qRaw ? { q: qRaw } : {}) }).toString();

  return (
    <div className="px-4 pb-6 pt-5 sm:px-5">
      <WorkspacePhonePageHeader
        title="Inbox"
        subtitle="Triage SMS threads, then open a thread to reply, assign follow-ups, or log CRM updates."
        actions={<InboxSearchBar defaultQuery={qRaw} selectedConversationId={selectedId} />}
      />

      <div className="mt-2 grid gap-4 lg:grid-cols-[minmax(300px,1fr)_minmax(300px,1.1fr)] xl:grid-cols-[minmax(340px,1fr)_minmax(360px,1.05fr)]">
        <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-md shadow-slate-200/45">
          <ul className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <li className="px-4 py-10 text-center">
                <InboxIcon className="mx-auto h-5 w-5 text-slate-400" strokeWidth={2} />
                <p className="mt-2 text-sm text-slate-500">No conversations yet.</p>
                <Link
                  href="/workspace/phone/calls"
                  className="mt-3 inline-flex rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Open calls
                </Link>
              </li>
            ) : (
              rows.map((r) => {
                const id = String(r.id);
                const phone =
                  typeof r.main_phone_e164 === "string" && r.main_phone_e164.trim()
                    ? r.main_phone_e164
                    : "—";
                const name = crmDisplayNameFromContactsRaw(r.contacts);
                const when = formatAdminPhoneWhen(
                  typeof r.last_message_at === "string" ? r.last_message_at : null
                );
                const preview = previewByConvId[id] ?? "";
                const leadStatusChip = leadChipLabel((r as { lead_status?: unknown }).lead_status);
                const isSelected = id === selectedId;
                const unreadCount = unreadCountFromMetadata((r as { metadata?: unknown }).metadata);
                const pc =
                  (r as { primary_contact_id?: unknown }).primary_contact_id != null &&
                  String((r as { primary_contact_id?: unknown }).primary_contact_id).trim() !== ""
                    ? String((r as { primary_contact_id?: unknown }).primary_contact_id)
                    : null;
                const c = normalizeContact(r.contacts);
                const lid = pc && leadByContactId.has(pc) ? leadByContactId.get(pc)!.id : null;
                const pid = pc && patientByContactId.has(pc) ? patientByContactId.get(pc)! : null;
                const entity = entityLabel({
                  metadata: (r as { metadata?: unknown }).metadata,
                  primaryContactId: pc,
                  contact: c,
                  leadId: lid,
                  patientId: pid,
                });

                return (
                  <li key={id}>
                    <Link
                      href={`/workspace/phone/inbox?${linkParams(id)}`}
                      className={`block px-4 py-3 transition ${
                        isSelected
                          ? "bg-sky-50/80 ring-1 ring-inset ring-sky-300"
                          : unreadCount > 0
                            ? "bg-white hover:bg-sky-50/30 active:bg-slate-100"
                            : "hover:bg-slate-50 active:bg-slate-100"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p
                          className={`truncate font-semibold ${unreadCount > 0 ? "text-slate-950" : "text-slate-900"}`}
                        >
                          {name ?? phone}
                        </p>
                        <span className="shrink-0 text-[11px] text-slate-500">{when}</span>
                      </div>
                      {name ? <p className="truncate text-xs text-slate-500">{phone}</p> : null}
                      {preview ? <p className="mt-1.5 line-clamp-2 text-xs leading-snug text-slate-600">{preview}</p> : null}
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {unreadCount > 0 ? (
                          <span className="inline-flex rounded-full bg-sky-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                            {unreadCount} unread
                          </span>
                        ) : null}
                        <span className="inline-flex rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                          {entity}
                        </span>
                        <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold capitalize text-slate-600">
                          {leadStatusChip}
                        </span>
                      </div>
                    </Link>
                  </li>
                );
              })
            )}
          </ul>
        </section>

        <aside className="flex min-h-0 flex-col gap-3">
          <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-md shadow-slate-200/45">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Thread context</p>
            {selectedRow && selectedId ? (
              <>
                <p className="mt-2 truncate text-lg font-semibold text-slate-900">
                  {selectedName ?? selectedPhoneDisplay}
                </p>
                <p className="font-mono text-sm text-slate-600">{selectedPhoneDisplay}</p>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-semibold text-slate-800">
                    {entityLabel({
                      metadata: (selectedRow as { metadata?: unknown }).metadata,
                      primaryContactId: selectedPrimaryContactId,
                      contact: selectedContact,
                      leadId: selectedLead?.id ?? null,
                      patientId: selectedPatientId,
                    })}
                  </span>
                  <span className="inline-flex rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-semibold capitalize text-indigo-900">
                    {leadChipLabel((selectedRow as { lead_status?: unknown }).lead_status)}
                  </span>
                  {selectedLead?.status ? (
                    <span
                      className="inline-flex max-w-full truncate rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-950"
                      title={selectedLead.status}
                    >
                      Pipeline: {formatLeadPipelineStatusLabel(selectedLead.status)}
                    </span>
                  ) : null}
                </div>

                {selectedPreview ? (
                  <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Last message</p>
                    <p className="mt-1 text-sm leading-snug text-slate-800">{selectedPreview}</p>
                  </div>
                ) : null}

                {(selectedNextAction || selectedFollowUpDue) && !selectedFollowUpDone ? (
                  <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50/60 px-3 py-2 text-sm text-amber-950">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-900/80">Follow-up</p>
                    {selectedNextAction ? <p className="mt-0.5 font-medium">{selectedNextAction}</p> : null}
                    {selectedFollowUpDue ? (
                      <p className="mt-1 text-xs text-amber-900/90">
                        Due {formatAdminPhoneWhen(selectedFollowUpDue)}
                      </p>
                    ) : null}
                    <p className="mt-2 text-[11px] text-amber-900/80">Set or clear in the full thread view.</p>
                  </div>
                ) : null}

                {selectedAi &&
                (selectedAi.summary ||
                  selectedAi.category ||
                  selectedAi.urgency ||
                  selectedAi.recommended_action ||
                  selectedAi.excerpt) ? (
                  <div className="mt-4 rounded-xl border border-sky-100 bg-sky-50/50 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-800">AI insight</p>
                    {selectedAi.summary ? (
                      <p className="mt-1 text-sm text-slate-800">{selectedAi.summary}</p>
                    ) : (
                      <p className="mt-1 text-sm text-slate-500">No summary stored for this thread.</p>
                    )}
                    {selectedAi.recommended_action ? (
                      <p className="mt-2 text-xs font-semibold text-sky-950">
                        Next step: {selectedAi.recommended_action}
                      </p>
                    ) : null}
                    {selectedAi.excerpt ? (
                      <p className="mt-1 text-[11px] leading-snug text-slate-700">
                        <span className="font-semibold text-slate-600">Excerpt · </span>
                        {selectedAi.excerpt}
                      </p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                      {selectedAi.category ? (
                        <span className="rounded-full bg-white/90 px-2 py-0.5 font-medium text-slate-700">
                          {selectedAi.category.replace(/_/g, " ")}
                        </span>
                      ) : null}
                      {selectedAi.urgency ? (
                        <span className="rounded-full bg-white/90 px-2 py-0.5 font-medium text-slate-700">
                          {selectedAi.urgency}
                        </span>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {lastCallLine ? (
                  <p className="mt-3 text-xs text-slate-600">
                    <span className="font-semibold text-slate-700">Last call:</span> {lastCallLine}
                  </p>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href={`/workspace/phone/inbox/${selectedId}`}
                    className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                  >
                    Open thread
                  </Link>
                  {workspaceCallHref ? (
                    <Link
                      href={workspaceCallHref}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                    >
                      Call
                    </Link>
                  ) : (
                    <span className="rounded-full border border-slate-100 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-400">
                      Call
                    </span>
                  )}
                  {selectedPatientId ? (
                    canOpenWorkspacePatientDetail ? (
                      <Link
                        href={`/workspace/phone/patients/${selectedPatientId}`}
                        className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
                      >
                        Open patient
                      </Link>
                    ) : (
                      <Link
                        href="/workspace/phone/patients"
                        className="rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-50"
                        title="Patient chart hub only opens when you are assigned to that patient. The list shows your assigned patients."
                      >
                        Patients
                      </Link>
                    )
                  ) : null}
                  {selectedLead && canOpenLeadInCrm ? (
                    <Link
                      href={`/admin/crm/leads/${selectedLead.id}`}
                      className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-900 hover:bg-violet-100"
                    >
                      Open lead (CRM)
                    </Link>
                  ) : null}
                  {selectedLead && nurseOrClinical ? (
                    <span
                      className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600"
                      title="Lead is linked; full pipeline is in CRM for managers."
                    >
                      Lead linked
                    </span>
                  ) : null}
                  {!selectedPrimaryContactId &&
                  (selectedRow as { metadata?: unknown }).metadata &&
                  typeof (selectedRow as { metadata?: unknown }).metadata === "object" &&
                  !Array.isArray((selectedRow as { metadata?: unknown }).metadata) &&
                  (selectedRow as { metadata: Record<string, unknown> }).metadata.unknown_texter === true ? (
                    <Link
                      href={`/workspace/phone/inbox/${selectedId}`}
                      className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-950 hover:bg-amber-100"
                    >
                      Add contact / create CRM record
                    </Link>
                  ) : null}
                  <Link
                    href={`/workspace/phone/inbox/${selectedId}`}
                    className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-900 hover:bg-sky-100"
                  >
                    Follow-up in thread
                  </Link>
                </div>
              </>
            ) : (
              <div className="mt-2 text-sm text-slate-500">
                <MessageCircleMore className="mb-2 h-5 w-5 text-slate-400" strokeWidth={2} />
                Select a conversation to see CRM context and quick actions.
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200/70 bg-white/90 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Workspace</p>
            <p className="mt-1 text-xs text-slate-600">
              Jump to related areas — same destinations as the bottom navigation.
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
              <Link
                href="/workspace/phone/follow-ups-today"
                className="rounded-full bg-slate-100 px-2.5 py-1.5 font-semibold text-slate-800 hover:bg-slate-200/80"
              >
                Follow-ups Today
              </Link>
              <Link
                href="/workspace/phone/calls"
                className="rounded-full bg-slate-100 px-2.5 py-1.5 font-semibold text-slate-800 hover:bg-slate-200/80"
              >
                Calls
              </Link>
              <Link
                href="/workspace/phone/voicemail"
                className="rounded-full bg-slate-100 px-2.5 py-1.5 font-semibold text-slate-800 hover:bg-slate-200/80"
              >
                Voicemail
              </Link>
              <Link
                href="/workspace/phone/patients"
                className="rounded-full bg-slate-100 px-2.5 py-1.5 font-semibold text-slate-800 hover:bg-slate-200/80"
              >
                Patients
              </Link>
              <Link
                href="/workspace/phone/leads"
                className="rounded-full bg-slate-100 px-2.5 py-1.5 font-semibold text-slate-800 hover:bg-slate-200/80"
              >
                Leads
              </Link>
              <Link
                href="/workspace/phone/tasks"
                className="rounded-full bg-slate-100 px-2.5 py-1.5 font-semibold text-slate-800 hover:bg-slate-200/80"
              >
                Tasks
              </Link>
              <Link
                href="/workspace/phone/keypad"
                className="rounded-full bg-slate-100 px-2.5 py-1.5 font-semibold text-slate-800 hover:bg-slate-200/80"
              >
                Keypad
              </Link>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
