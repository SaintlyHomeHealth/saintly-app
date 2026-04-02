import Link from "next/link";
import { redirect } from "next/navigation";

import { WorkspacePhonePageHeader } from "../_components/WorkspacePhonePageHeader";
import { supabaseAdmin } from "@/lib/admin";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";
import {
  displayNameFromContact,
  formatContactAddress,
  formatAdminPhoneWhen,
  leadChipLabel,
} from "@/app/workspace/phone/patients/_lib/patient-hub";
import { canAccessWorkspacePhone, getStaffProfile } from "@/lib/staff-profile";

type ContactRow = {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  primary_phone: string | null;
  secondary_phone: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};

type ListItemPatient = {
  kind: "patient";
  patientId: string;
  patientStatus: string | null;
  contactId: string;
  contact: ContactRow;
  assignmentRole: string;
  lastActivityAt: string | null;
  hasVoicemail: boolean;
  conversationId: string | null;
  leadStatus: string | null;
};

type ListItemThread = {
  kind: "thread";
  conversationId: string;
  contactId: string;
  contact: ContactRow;
  lastActivityAt: string | null;
  leadStatus: string | null;
};

function roleChip(role: string): string {
  const r = role.trim().toLowerCase();
  if (r === "primary_nurse") return "Primary";
  if (r === "backup_nurse") return "Backup";
  if (r === "intake") return "Intake";
  if (r === "admin") return "Admin";
  if (r === "clinician") return "Clinician";
  return role.replace(/_/g, " ");
}

function rolePriorityForList(role: string): number {
  const r = role.trim().toLowerCase();
  if (r === "primary_nurse") return 0;
  if (r === "backup_nurse") return 1;
  if (r === "clinician") return 2;
  if (r === "intake") return 3;
  return 4;
}

export default async function WorkspacePatientsPage() {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff)) {
    redirect("/admin/phone");
  }

  const viewerId = staff.user_id;

  /** Step 1: assignments only (reliable). Nested `patients(contacts)` embeds can fail or empty in some PostgREST configs. */
  const { data: assignmentRows, error: assignErr } = await supabaseAdmin
    .from("patient_assignments")
    .select("id, role, patient_id")
    .eq("assigned_user_id", viewerId)
    .eq("is_active", true);

  if (assignErr) {
    console.warn("[workspace/phone/patients] assignments:", assignErr.message);
  }

  const roleByPatientId = new Map<string, string>();
  for (const row of assignmentRows ?? []) {
    const pid = typeof row.patient_id === "string" ? row.patient_id.trim() : "";
    if (!pid) continue;
    const role = typeof row.role === "string" ? row.role : "—";
    const prev = roleByPatientId.get(pid);
    if (!prev || rolePriorityForList(role) < rolePriorityForList(prev)) {
      roleByPatientId.set(pid, role);
    }
  }

  const patientIds = [...roleByPatientId.keys()];

  type PatientWithContact = {
    id: string;
    patient_status: string | null;
    contact_id: string | null;
    contacts: ContactRow | ContactRow[] | null;
  };

  const patientById = new Map<string, PatientWithContact>();
  if (patientIds.length > 0) {
    const { data: pRows, error: pErr } = await supabaseAdmin
      .from("patients")
      .select(
        "id, patient_status, contact_id, contacts ( id, full_name, first_name, last_name, primary_phone, secondary_phone, address_line_1, address_line_2, city, state, zip )"
      )
      .in("id", patientIds);

    if (pErr) {
      console.warn("[workspace/phone/patients] patients:", pErr.message);
    }

    for (const raw of pRows ?? []) {
      const p = raw as PatientWithContact;
      if (p?.id) patientById.set(String(p.id), p);
    }

    const missingContactIds: string[] = [];
    for (const p of patientById.values()) {
      const cid = typeof p.contact_id === "string" ? p.contact_id.trim() : "";
      if (!cid) continue;
      const cRaw = p.contacts;
      const hasEmbed =
        cRaw && (Array.isArray(cRaw) ? cRaw.length > 0 : typeof cRaw === "object");
      if (!hasEmbed) missingContactIds.push(cid);
    }

    const uniqueMissing = [...new Set(missingContactIds)];
    if (uniqueMissing.length > 0) {
      const { data: cOnly } = await supabaseAdmin
        .from("contacts")
        .select(
          "id, full_name, first_name, last_name, primary_phone, secondary_phone, address_line_1, address_line_2, city, state, zip"
        )
        .in("id", uniqueMissing);

      const cMap = new Map((cOnly ?? []).map((row) => [String((row as ContactRow).id), row as ContactRow]));
      for (const [id, p] of patientById.entries()) {
        const cid = typeof p.contact_id === "string" ? p.contact_id.trim() : "";
        if (!cid) continue;
        const cRaw = p.contacts;
        const hasEmbed =
          cRaw && (Array.isArray(cRaw) ? cRaw.length > 0 : typeof cRaw === "object");
        if (hasEmbed) continue;
        const c = cMap.get(cid);
        if (c) patientById.set(id, { ...p, contacts: c });
      }
    }
  }

  const patientItems: ListItemPatient[] = [];
  const patientContactIds = new Set<string>();

  for (const pid of patientIds) {
    const po = patientById.get(pid);
    if (!po) continue;
    const cRaw = po.contacts;
    const c =
      cRaw && typeof cRaw === "object" && !Array.isArray(cRaw)
        ? (cRaw as ContactRow)
        : Array.isArray(cRaw) && cRaw[0]
          ? (cRaw[0] as ContactRow)
          : null;
    const contactId = c?.id ?? (typeof po.contact_id === "string" ? po.contact_id : "");
    const contact: ContactRow =
      c ??
      ({
        id: contactId || "unknown",
        full_name: null,
        first_name: null,
        last_name: null,
        primary_phone: null,
        secondary_phone: null,
        address_line_1: null,
        address_line_2: null,
        city: null,
        state: null,
        zip: null,
      } satisfies ContactRow);
    if (contactId && contactId !== "unknown") patientContactIds.add(contactId);

    patientItems.push({
      kind: "patient",
      patientId: po.id,
      patientStatus: typeof po.patient_status === "string" ? po.patient_status : null,
      contactId: contact.id,
      contact,
      assignmentRole: roleByPatientId.get(pid) ?? "—",
      lastActivityAt: null,
      hasVoicemail: false,
      conversationId: null,
      leadStatus: null,
    });
  }

  const contactIds = patientItems.map((x) => x.contactId);
  const convByContact = new Map<
    string,
    { id: string; last_message_at: string | null; lead_status: string | null }
  >();
  const vmByContact = new Set<string>();
  const latestCallByContact = new Map<string, string>();

  if (contactIds.length > 0) {
    const { data: convs } = await supabaseAdmin
      .from("conversations")
      .select("id, primary_contact_id, last_message_at, lead_status")
      .eq("channel", "sms")
      .in("primary_contact_id", contactIds);

    for (const cv of convs ?? []) {
      const cid = typeof cv.primary_contact_id === "string" ? cv.primary_contact_id : "";
      if (!cid) continue;
      const existing = convByContact.get(cid);
      const lm = typeof cv.last_message_at === "string" ? cv.last_message_at : null;
      if (!existing || (lm && (!existing.last_message_at || lm > existing.last_message_at))) {
        convByContact.set(cid, {
          id: String(cv.id),
          last_message_at: lm,
          lead_status: typeof cv.lead_status === "string" ? cv.lead_status : null,
        });
      }
    }

    const { data: calls } = await supabaseAdmin
      .from("phone_calls")
      .select("contact_id, started_at, voicemail_recording_sid")
      .in("contact_id", contactIds)
      .order("started_at", { ascending: false });

    for (const call of calls ?? []) {
      const cid = typeof call.contact_id === "string" ? call.contact_id : "";
      if (!cid) continue;
      const started = typeof call.started_at === "string" ? call.started_at : null;
      if (started && !latestCallByContact.has(cid)) {
        latestCallByContact.set(cid, started);
      }
      const vm = typeof call.voicemail_recording_sid === "string" ? call.voicemail_recording_sid.trim() : "";
      if (vm) vmByContact.add(cid);
    }
  }

  for (const it of patientItems) {
    const conv = convByContact.get(it.contactId);
    it.conversationId = conv?.id ?? null;
    it.leadStatus = conv?.lead_status ?? null;
    const lm = conv?.last_message_at ?? null;
    const lc = latestCallByContact.get(it.contactId) ?? null;
    const candidates = [lm, lc].filter(Boolean) as string[];
    it.lastActivityAt = candidates.length ? candidates.sort().reverse()[0]! : null;
    it.hasVoicemail = vmByContact.has(it.contactId);
  }

  const threadItems: ListItemThread[] = [];
  const { data: convOnly } = await supabaseAdmin
    .from("conversations")
    .select("id, last_message_at, lead_status, primary_contact_id")
    .eq("channel", "sms")
    .eq("assigned_to_user_id", viewerId)
    .not("primary_contact_id", "is", null)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(60);

  const extraContactIds = [...new Set(
    (convOnly ?? [])
      .map((r) => (typeof r.primary_contact_id === "string" ? r.primary_contact_id : ""))
      .filter((id) => id && !patientContactIds.has(id))
  )];

  const extraContacts: ContactRow[] = [];
  if (extraContactIds.length > 0) {
    const { data: cRows } = await supabaseAdmin
      .from("contacts")
      .select(
        "id, full_name, first_name, last_name, primary_phone, secondary_phone, address_line_1, address_line_2, city, state, zip"
      )
      .in("id", extraContactIds);
    for (const c of (cRows ?? []) as ContactRow[]) {
      if (c?.id) extraContacts.push(c);
    }
  }
  const extraById = new Map(extraContacts.map((c) => [c.id, c]));

  for (const r of convOnly ?? []) {
    const cid = typeof r.primary_contact_id === "string" ? r.primary_contact_id : "";
    if (!cid || patientContactIds.has(cid)) continue;
    const contact = extraById.get(cid);
    if (!contact) continue;
    threadItems.push({
      kind: "thread",
      conversationId: String(r.id),
      contactId: cid,
      contact,
      lastActivityAt: typeof r.last_message_at === "string" ? r.last_message_at : null,
      leadStatus: typeof r.lead_status === "string" ? r.lead_status : null,
    });
  }

  const merged = [...patientItems, ...threadItems].sort((a, b) => {
    const ta = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0;
    const tb = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0;
    return tb - ta;
  });

  return (
    <div className="px-4 pb-8 pt-5 sm:px-5">
      <WorkspacePhonePageHeader
        title="Patients"
        subtitle="Assigned to you — call, text, and follow up without opening the CRM."
        actions={
          <Link
            href="/workspace/phone/today"
            className="inline-flex items-center rounded-full bg-gradient-to-r from-sky-600 to-cyan-500 px-4 py-2 text-xs font-semibold text-white shadow-sm shadow-sky-200/70 transition hover:-translate-y-px hover:shadow-md hover:shadow-sky-200/90"
          >
            Today
          </Link>
        }
      />

      {assignErr ? (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">Could not load assignments.</p>
      ) : null}

      {merged.length === 0 ? (
        <div className="rounded-2xl bg-slate-100/80 px-4 py-10 text-center">
          <p className="text-sm font-medium text-slate-700">No patients yet</p>
          <p className="mt-2 text-sm text-slate-500">
            When a patient is assigned to you in the chart or routed to you in messaging, they will appear here.
          </p>
          <Link
            href="/workspace/phone/inbox"
            className="mt-4 inline-flex rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
          >
            Open inbox
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {merged.map((item) => (
            <PatientListCard key={`${item.kind}-${item.kind === "patient" ? item.patientId : item.conversationId}`} item={item} />
          ))}
        </ul>
      )}

      <p className="mt-8 text-center text-[11px] leading-relaxed text-slate-400">
        Patient rows use CRM assignments and your inbox. Full chart edits stay in Admin.
      </p>
    </div>
  );
}

function PatientListCard({ item }: { item: ListItemPatient | ListItemThread }) {
  const c = item.contact;
  const name = displayNameFromContact(c);
  const address = formatContactAddress(c);
  const phoneRaw = c.primary_phone?.trim() ?? "";
  const phone = phoneRaw ? formatPhoneForDisplay(phoneRaw) : "—";
  const altRaw = c.secondary_phone?.trim() ?? "";
  const alt = altRaw ? formatPhoneForDisplay(altRaw) : "";
  const when = item.lastActivityAt ? formatAdminPhoneWhen(item.lastActivityAt) : "—";
  const chip = item.kind === "patient" ? roleChip(item.assignmentRole) : "Thread";
  const lead = leadChipLabel(item.leadStatus);
  const statusChip =
    item.kind === "patient" && item.patientStatus ? item.patientStatus.replace(/_/g, " ") : null;

  const detailHref =
    item.kind === "patient"
      ? `/workspace/phone/patients/${item.patientId}`
      : `/workspace/phone/inbox/${item.conversationId}`;

  return (
    <li>
      <Link
        href={detailHref}
        className="block rounded-2xl bg-white/90 px-4 py-3.5 shadow-sm shadow-slate-200/40 ring-1 ring-slate-200/60 transition active:scale-[0.99]"
      >
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-base font-semibold text-slate-900">{name}</p>
          <span className="shrink-0 text-[11px] text-slate-400">{when}</span>
        </div>
        {address ? <p className="mt-1 line-clamp-2 text-xs leading-snug text-slate-500">{address}</p> : null}
        <p className="mt-1 text-[11px] tabular-nums text-slate-600">{phone}</p>
        {alt ? <p className="mt-0.5 text-[11px] tabular-nums text-slate-500">Alt {alt}</p> : null}

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
            {chip}
          </span>
          <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold capitalize text-sky-800">
            {lead}
          </span>
          {statusChip ? (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold capitalize text-emerald-900">
              {statusChip}
            </span>
          ) : null}
          {item.kind === "patient" && item.hasVoicemail ? (
            <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-900">
              Voicemail
            </span>
          ) : null}
        </div>
      </Link>
    </li>
  );
}
