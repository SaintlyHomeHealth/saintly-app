import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  type ContactDirectoryDbRow,
  type LeadLinkBrief,
  type LeadRowWithContact,
  type PatientLinkBrief,
  buildRelationshipTypeBadges,
  contactDirectoryDisplayName,
  credentialingSummaryFromMetadata,
  formatContactAddressBlock,
  relationshipMetadataIsEmpty,
  resolveDirectoryOwnerUserId,
  resolveDirectorySourceLabel,
  resolveDirectoryStatusLabel,
} from "@/lib/crm/contact-directory";
import {
  fetchContactDuplicateMatchPool,
  findDuplicateCandidatesForContact,
  type ContactDuplicateLite,
} from "@/lib/crm/contact-duplicate-detection";
import { labelForContactType } from "@/lib/crm/contact-types";
import { formatLeadSourceLabel } from "@/lib/crm/lead-source-options";
import { buildCaregiverAlternateSummary } from "@/lib/crm/patient-caregiver-display";
import { formatPhoneForDisplay, phoneToTelHref } from "@/lib/phone/us-phone-format";
import {
  buildAdminPhoneCallsSoftphoneHref,
  buildWorkspaceKeypadCallHref,
  pickOutboundE164ForDial,
} from "@/lib/workspace-phone/launch-urls";
import {
  canAccessWorkspacePhone,
  getStaffProfile,
  isManagerOrHigher,
  isPhoneWorkspaceUser,
  type StaffProfile,
} from "@/lib/staff-profile";
import { ContactArchiveButton } from "@/app/admin/crm/contacts/_components/ContactArchiveButton";
import { leadRowsActiveOnly } from "@/lib/crm/leads-active";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { devTimedSupabaseQuery } from "@/lib/perf/supabase-dev-query-log";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function staffPrimaryLabel(s: {
  user_id: string;
  email: string | null;
  full_name: string | null;
}): string {
  const name = (s.full_name ?? "").trim();
  if (name) return name;
  const em = (s.email ?? "").trim();
  if (em) {
    const local = em.split("@")[0]?.trim();
    if (local) {
      const words = local.replace(/[._+-]+/g, " ").split(/\s+/).filter(Boolean);
      if (words.length > 0) {
        return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
      }
    }
  }
  return `${s.user_id.slice(0, 8)}…`;
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso || typeof iso !== "string") return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 16);
  return d.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

function contactInAppCallHref(
  staff: StaffProfile,
  e164: string | null,
  opts: { contactId: string; leadId?: string; contextName: string }
): string | null {
  if (!e164 || !isPhoneWorkspaceUser(staff)) return null;
  if (canAccessWorkspacePhone(staff)) {
    return buildWorkspaceKeypadCallHref({
      dial: e164,
      contactId: opts.contactId,
      leadId: opts.leadId,
      contextName: opts.contextName,
      placeCall: true,
    });
  }
  return buildAdminPhoneCallsSoftphoneHref({ dial: e164, placeCall: true });
}

const dtCls = "text-[10px] font-semibold uppercase tracking-wide text-slate-500";
const ddCls = "mt-0.5 text-sm text-slate-900";
const rowCls = "border-b border-slate-100 py-3 last:border-0";

type TimelineItem = {
  atMs: number;
  atLabel: string;
  title: string;
  detail: string;
};

export default async function AdminCrmContactDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ contactId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    redirect("/admin");
  }

  const { contactId } = await params;
  const rawSp = await searchParams;
  const returnToRaw = rawSp.returnTo;
  const returnTo =
    typeof returnToRaw === "string"
      ? returnToRaw
      : Array.isArray(returnToRaw)
        ? returnToRaw[0] ?? ""
        : "";
  const toastRaw = rawSp.toast;
  const toastParam =
    typeof toastRaw === "string"
      ? toastRaw.trim()
      : Array.isArray(toastRaw)
        ? (toastRaw[0] ?? "").trim()
        : "";
  const backHref =
    returnTo && returnTo.startsWith("?") ? `/admin/crm/contacts${returnTo}` : "/admin/crm/contacts";

  const supabase = await createServerSupabaseClient();

  const { data: crow, error } = await supabase
    .from("contacts")
    .select(
      "id, first_name, last_name, full_name, organization_name, primary_phone, secondary_phone, email, address_line_1, address_line_2, city, state, zip, contact_type, status, referral_source, owner_user_id, relationship_metadata, notes, created_at, updated_at, archived_at"
    )
    .eq("id", contactId)
    .maybeSingle();

  if (error || !crow) {
    notFound();
  }

  const row = crow as ContactDirectoryDbRow;
  const isArchived = row.archived_at != null && String(row.archived_at).trim() !== "";

  const [{ data: prow }, { data: lrows }, { data: callRows }, { data: convRows }] = await Promise.all([
    supabase.from("patients").select("id, contact_id, patient_status, created_at").eq("contact_id", contactId).maybeSingle(),
    leadRowsActiveOnly(
      supabase
        .from("leads")
        .select("id, contact_id, source, status, owner_user_id, created_at, updated_at")
        .eq("contact_id", contactId)
        .order("created_at", { ascending: false })
    ),
    supabase
      .from("phone_calls")
      .select("id, started_at, created_at, direction, status, duration_seconds")
      .eq("contact_id", contactId)
      .order("started_at", { ascending: false, nullsFirst: false })
      .limit(12),
    supabase
      .from("conversations")
      .select("id")
      .eq("channel", "sms")
      .eq("primary_contact_id", contactId)
      .is("deleted_at", null)
      .limit(20),
  ]);

  const dupPoolRes = await devTimedSupabaseQuery("crm_contact_duplicate_pool", async () => ({
    data: await fetchContactDuplicateMatchPool(supabase, contactId, row as ContactDuplicateLite),
    error: null,
  }));
  const dupPool = dupPoolRes.data ?? [];

  const patientRow = prow as { id: string; patient_status: string; created_at?: string } | null;
  const patient: PatientLinkBrief | null = patientRow
    ? { id: String(patientRow.id), patient_status: String(patientRow.patient_status) }
    : null;

  const leadsRaw = (lrows ?? []) as (LeadRowWithContact & { updated_at?: string })[];
  const leads: LeadLinkBrief[] = leadsRaw
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .map(({ id, source, status, owner_user_id }) => ({ id, source, status, owner_user_id }));

  const primaryLeadId = leads[0]?.id;

  const convIds = (convRows ?? []).map((c) => (c as { id: string }).id).filter(Boolean);
  const { data: msgRows } =
    convIds.length > 0
      ? await supabase
          .from("messages")
          .select("created_at, direction, body, conversation_id")
          .in("conversation_id", convIds)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(15)
      : { data: [] };

  const ownerIdFromContact = (row.owner_user_id ?? "").trim() || null;
  const ownerIds = new Set<string>();
  if (ownerIdFromContact) ownerIds.add(ownerIdFromContact);
  for (const l of leads) {
    const u = (l.owner_user_id ?? "").trim();
    if (u) ownerIds.add(u);
  }

  const staffByUserId: Record<string, { user_id: string; email: string | null; full_name: string | null }> = {};
  if (ownerIds.size > 0) {
    const { data: spRows } = await supabase
      .from("staff_profiles")
      .select("user_id, email, full_name")
      .in("user_id", [...ownerIds]);
    for (const s of spRows ?? []) {
      const r = s as { user_id: string; email: string | null; full_name: string | null };
      staffByUserId[r.user_id] = r;
    }
  }

  const directoryOwnerId = resolveDirectoryOwnerUserId(row, leads);
  const ownerLabel = directoryOwnerId
    ? staffPrimaryLabel(staffByUserId[directoryOwnerId] ?? { user_id: directoryOwnerId, email: null, full_name: null })
    : "—";

  const dupCandidates = findDuplicateCandidatesForContact(row as ContactDuplicateLite, dupPool);

  const displayName = contactDirectoryDisplayName(row);
  const primaryE164 = pickOutboundE164ForDial(row.primary_phone);
  const secondaryE164 = pickOutboundE164ForDial(row.secondary_phone);
  const primaryCallHref = contactInAppCallHref(staff, primaryE164, {
    contactId,
    leadId: primaryLeadId,
    contextName: displayName,
  });
  const secondaryCallHref = contactInAppCallHref(staff, secondaryE164, {
    contactId,
    leadId: primaryLeadId,
    contextName: `${displayName} (caregiver)`,
  });
  const primaryTextHref = primaryE164 ? `/admin/phone/messages/new?to=${encodeURIComponent(primaryE164)}` : null;
  const secondaryTextHref = secondaryE164 ? `/admin/phone/messages/new?to=${encodeURIComponent(secondaryE164)}` : null;
  const primaryTel = phoneToTelHref(row.primary_phone);
  const secondaryTel = phoneToTelHref(row.secondary_phone);

  const caregiverSummary = buildCaregiverAlternateSummary({
    secondaryPhone: row.secondary_phone,
    relationshipMetadata: row.relationship_metadata,
  });

  const timeline: TimelineItem[] = [];

  for (const c of callRows ?? []) {
    const cr = c as {
      started_at?: string | null;
      created_at?: string | null;
      direction?: string | null;
      status?: string | null;
      duration_seconds?: number | null;
    };
    const at = (cr.started_at as string) || (cr.created_at as string) || "";
    if (!at) continue;
    const t = new Date(at).getTime();
    if (Number.isNaN(t)) continue;
    const dir = String(cr.direction ?? "").toLowerCase();
    const sub = `${dir || "call"} · ${String(cr.status ?? "—")}${
      typeof cr.duration_seconds === "number" ? ` · ${cr.duration_seconds}s` : ""
    }`;
    timeline.push({ atMs: t, atLabel: formatWhen(at), title: "Call", detail: sub });
  }

  for (const m of msgRows ?? []) {
    const mr = m as { created_at: string; direction?: string | null; body?: string | null };
    const at = mr.created_at;
    if (!at) continue;
    const t = new Date(at).getTime();
    if (Number.isNaN(t)) continue;
    const dir = String(mr.direction ?? "").toLowerCase() === "inbound" ? "In" : "Out";
    const body = (mr.body ?? "").trim().slice(0, 160);
    timeline.push({ atMs: t, atLabel: formatWhen(at), title: `SMS ${dir}`, detail: body || "—" });
  }

  for (const L of leadsRaw) {
    const uAt = (L.updated_at as string) || (L.created_at as string);
    if (!uAt) continue;
    const t = new Date(uAt).getTime();
    if (Number.isNaN(t)) continue;
    timeline.push({
      atMs: t,
      atLabel: formatWhen(uAt),
      title: "Lead activity",
      detail: `${formatLeadSourceLabel(L.source)} · ${(L.status ?? "—").replace(/_/g, " ")}`,
    });
  }

  if (patientRow?.created_at) {
    const t = new Date(patientRow.created_at).getTime();
    if (!Number.isNaN(t)) {
      timeline.push({
        atMs: t,
        atLabel: formatWhen(patientRow.created_at),
        title: "Patient chart",
        detail: `Patient record created (${patientRow.patient_status})`,
      });
    }
  }

  timeline.sort((a, b) => b.atMs - a.atMs);
  const timelineTop = timeline.slice(0, 18);

  const badges = buildRelationshipTypeBadges(row, patient, leads);
  const addressBlock = formatContactAddressBlock(row);
  const city = (row.city ?? "").trim();
  const state = (row.state ?? "").trim();
  const zip = (row.zip ?? "").trim();
  const personName =
    (row.full_name ?? "").trim() ||
    [row.first_name, row.last_name].filter(Boolean).join(" ").trim() ||
    "—";
  const storedTypeLabel = labelForContactType(row.contact_type);
  const rawType = (row.contact_type ?? "").trim();
  const statusRollup = resolveDirectoryStatusLabel(row, patient, leads);
  const sourceRollup = resolveDirectorySourceLabel(row, leads);
  const credSummary = credentialingSummaryFromMetadata(row.relationship_metadata);
  const metaEmpty = relationshipMetadataIsEmpty(row.relationship_metadata);
  const metaJson =
    row.relationship_metadata && typeof row.relationship_metadata === "object"
      ? JSON.stringify(row.relationship_metadata, null, 2)
      : String(row.relationship_metadata ?? "{}");

  const toastBanner =
    toastParam === "contact_archived" ? (
      <div
        role="status"
        className="rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950 shadow-sm"
      >
        Contact removed from active lists. Related calls, messages, and history are unchanged.
      </div>
    ) : toastParam === "contact_archive_denied" ||
        toastParam === "contact_archive_failed" ||
        toastParam === "contact_archive_invalid" ||
        toastParam === "contact_archive_gone" ? (
      <div
        role="alert"
        className="rounded-[20px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 shadow-sm"
      >
        {toastParam === "contact_archive_denied"
          ? "You do not have permission to archive contacts."
          : toastParam === "contact_archive_gone"
            ? "That contact is already archived or could not be found."
            : toastParam === "contact_archive_invalid"
              ? "Missing contact. Refresh and try again."
              : "Could not archive the contact. Try again or check logs."}
      </div>
    ) : null;

  const archivedNotice = isArchived ? (
    <div
      role="status"
      className="rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-sm"
    >
      This contact is archived: it stays linked to calls, SMS, leads, and patients but is hidden from the main Contacts
      directory.
    </div>
  ) : null;

  const cardCls = "rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm";
  const actionBtn =
    "inline-flex items-center justify-center rounded-[20px] border border-sky-600 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-900 shadow-sm hover:bg-sky-100 sm:text-sm";
  const actionBtnGhost =
    "inline-flex items-center justify-center rounded-[20px] border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 sm:text-sm";

  return (
    <div className="space-y-6 p-6">
      <AdminPageHeader
        eyebrow="Contacts"
        title={displayName}
        description={
          <>
            Contact ID <span className="font-mono text-xs text-slate-500">{row.id}</span>
            {" · "}
            Updated {formatWhen(row.updated_at)}
            {" · "}
            Created {formatWhen(row.created_at)}
          </>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={backHref}
              className="inline-flex items-center justify-center rounded-[20px] border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50 sm:text-sm"
            >
              Back to Contacts
            </Link>
            {!isArchived ? (
              <ContactArchiveButton contactId={row.id} archiveContext="detail" variant="detail" />
            ) : null}
          </div>
        }
      />

      {toastBanner}
      {archivedNotice}

      <div className={cardCls}>
        <h2 className="text-sm font-bold text-slate-900">Quick actions</h2>
        <p className="mt-1 text-xs text-slate-500">
          Call uses the in-app Twilio keypad when your account has phone access; text opens admin SMS compose for that
          E.164 number.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {primaryCallHref ? (
            <Link href={primaryCallHref} prefetch={false} className={actionBtn}>
              Call primary
            </Link>
          ) : primaryE164 ? (
            <span className="text-xs text-slate-500">Call unavailable (phone workspace not enabled)</span>
          ) : null}
          {primaryTextHref ? (
            <Link href={primaryTextHref} prefetch={false} className={actionBtnGhost}>
              Text primary
            </Link>
          ) : null}
          {secondaryCallHref ? (
            <Link href={secondaryCallHref} prefetch={false} className={actionBtn}>
              Call caregiver / alternate
            </Link>
          ) : null}
          {secondaryTextHref ? (
            <Link href={secondaryTextHref} prefetch={false} className={actionBtnGhost}>
              Text caregiver / alternate
            </Link>
          ) : null}
          {patient ? (
            <Link href={`/admin/crm/patients/${patient.id}`} className={actionBtnGhost}>
              Open patient chart
            </Link>
          ) : null}
          {leads.map((l) => (
            <Link key={l.id} href={`/admin/crm/leads/${l.id}`} className={actionBtnGhost}>
              Open lead ({formatLeadSourceLabel(l.source)})
            </Link>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-slate-500">
          {primaryTel ? (
            <a href={primaryTel} className="underline-offset-2 hover:underline">
              Fallback: open primary in device phone app
            </a>
          ) : null}
          {secondaryTel ? (
            <a href={secondaryTel} className="underline-offset-2 hover:underline">
              Fallback: caregiver in device phone app
            </a>
          ) : null}
        </div>
      </div>

      {dupCandidates.length > 0 ? (
        <div className="rounded-[28px] border border-amber-200 bg-amber-50/90 p-5 shadow-sm ring-1 ring-amber-100">
          <h2 className="text-sm font-bold text-amber-950">Possible duplicates (merge prep)</h2>
          <p className="mt-1 text-xs text-amber-900/90">
            Same batch logic as the Contacts list: we match on <strong>normalized primary phone digits</strong> (10+ digits)
            and/or <strong>normalized email</strong> (lowercase trim). Secondary phones are not used. Destructive merge is not
            implemented—open each profile and reconcile manually.
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            {dupCandidates.map((d) => (
              <li key={d.id}>
                <Link href={`/admin/crm/contacts/${d.id}`} className="font-semibold text-amber-950 underline-offset-2 hover:underline">
                  {d.label}
                </Link>
                <span className="ml-2 text-xs text-amber-800/90">
                  ({d.matchedBy.join(" + ")})
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className={cardCls}>
        <h2 className="text-sm font-bold text-slate-900">Recent linked activity</h2>
        <p className="mt-1 text-xs text-slate-500">
          Grounded rows: <span className="font-medium">phone_calls</span> for this contact,{" "}
          <span className="font-medium">messages</span> on SMS threads tied to this contact, lead timestamps, and patient
          creation.
        </p>
        {timelineTop.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No recent activity found.</p>
        ) : (
          <ul className="mt-4 space-y-3 border-t border-slate-100 pt-4">
            {timelineTop.map((ev, i) => (
              <li key={`${ev.atMs}-${i}`} className="text-sm">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{ev.atLabel}</p>
                <p className="font-semibold text-slate-900">{ev.title}</p>
                <p className="text-xs text-slate-600">{ev.detail}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={cardCls}>
        <h2 className="text-sm font-bold text-slate-900">Contact profile</h2>
        <p className="mt-1 text-xs text-slate-500">
          Source of truth is <span className="font-medium">contacts</span> (phones, email, address).{" "}
          <span className="font-medium">Caregiver / alternate</span> for SMS and routing is{" "}
          <span className="font-mono text-[10px]">secondary_phone</span>; optional names may appear from metadata below.
        </p>

        <div className="mt-4 flex flex-wrap gap-2 border-b border-slate-100 pb-4">
          {badges.map((b) => (
            <span
              key={b}
              className="inline-flex rounded-full border border-sky-100 bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-900"
            >
              {b}
            </span>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-600">
          <span className="font-semibold text-slate-700">Stored type value:</span>{" "}
          {rawType ? (
            <>
              <span className="font-mono text-[11px] text-slate-800">{rawType}</span>
              <span className="text-slate-500"> ({storedTypeLabel})</span>
            </>
          ) : (
            <span className="text-slate-500">— not set —</span>
          )}
        </p>

        <div className="mt-4 grid gap-0 sm:grid-cols-2">
          <div className={rowCls}>
            <p className={dtCls}>Organization</p>
            <p className={ddCls}>{(row.organization_name ?? "").trim() || "—"}</p>
          </div>
          <div className={rowCls}>
            <p className={dtCls}>Person name</p>
            <p className={ddCls}>{personName}</p>
          </div>
          <div className={rowCls}>
            <p className={dtCls}>Primary phone</p>
            <p className={`${ddCls} tabular-nums`}>{formatPhoneForDisplay(row.primary_phone)}</p>
          </div>
          <div className={rowCls}>
            <p className={dtCls}>Caregiver / alternate phone</p>
            <p className={`${ddCls} tabular-nums`}>{formatPhoneForDisplay(row.secondary_phone)}</p>
            {caregiverSummary.metadataLines.length > 0 ? (
              <ul className="mt-2 space-y-1 text-xs text-slate-700">
                {caregiverSummary.metadataLines.map((line, idx) => (
                  <li key={idx}>From metadata: {line}</li>
                ))}
              </ul>
            ) : null}
          </div>
          <div className={`${rowCls} sm:col-span-2`}>
            <p className={dtCls}>Email</p>
            <p className={ddCls}>{(row.email ?? "").trim() || "—"}</p>
          </div>

          <div className={`${rowCls} sm:col-span-2`}>
            <p className={dtCls}>Street address</p>
            {addressBlock ? (
              <div className={`${ddCls} whitespace-pre-line leading-relaxed`}>{addressBlock}</div>
            ) : (
              <p className={`${ddCls} text-slate-500`}>No address on file</p>
            )}
          </div>
          <div className={rowCls}>
            <p className={dtCls}>City</p>
            <p className={ddCls}>{city || "—"}</p>
          </div>
          <div className={rowCls}>
            <p className={dtCls}>State</p>
            <p className={ddCls}>{state || "—"}</p>
          </div>
          <div className={rowCls}>
            <p className={dtCls}>ZIP</p>
            <p className={`${ddCls} tabular-nums`}>{zip || "—"}</p>
          </div>
          <div className={rowCls}>
            <p className={dtCls}>Status (rolled up)</p>
            <p className={ddCls}>{statusRollup}</p>
          </div>
          <div className={rowCls}>
            <p className={dtCls}>Owner</p>
            <p className={ddCls}>{ownerLabel}</p>
          </div>
          <div className={`${rowCls} sm:col-span-2`}>
            <p className={dtCls}>Source / referral</p>
            <p className={ddCls}>{sourceRollup}</p>
            <p className="mt-1 text-[11px] text-slate-500">
              <span className="font-medium">contacts.referral_source</span> when set; else newest lead&apos;s source. Lead
              conversion keeps the same <span className="font-mono text-[10px]">contact_id</span>, so phones and caregiver
              lines stay on this row unless edited elsewhere.
            </p>
          </div>
        </div>
      </div>

      <div className={cardCls}>
        <h2 className="text-sm font-bold text-slate-900">Linked charts</h2>
        <p className="mt-1 text-xs text-slate-500">Patient (max one) and any lead rows pointing at this contact.</p>

        <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
          <div>
            <p className={dtCls}>Patient</p>
            {patient ? (
              <p className="mt-1">
                <Link
                  href={`/admin/crm/patients/${patient.id}`}
                  className="text-sm font-semibold text-sky-800 underline-offset-2 hover:underline"
                >
                  Open patient chart
                </Link>
                <span className="ml-2 text-sm text-slate-600">({patient.patient_status})</span>
              </p>
            ) : (
              <p className="mt-1 text-sm text-slate-500">No patient record uses this contact.</p>
            )}
          </div>

          <div>
            <p className={dtCls}>Leads</p>
            {leads.length === 0 ? (
              <p className="mt-1 text-sm text-slate-500">No lead rows for this contact.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {leads.map((l) => {
                  const lo = l.owner_user_id ? staffByUserId[l.owner_user_id] : null;
                  const leadOwner = lo ? staffPrimaryLabel(lo) : "—";
                  return (
                    <li
                      key={l.id}
                      className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5 text-sm text-slate-800"
                    >
                      <Link href={`/admin/crm/leads/${l.id}`} className="font-semibold text-sky-800 underline-offset-2 hover:underline">
                        Lead workspace
                      </Link>
                      <span className="mx-1.5 text-slate-300">·</span>
                      <span>{formatLeadSourceLabel(l.source)}</span>
                      {l.status ? (
                        <>
                          <span className="mx-1.5 text-slate-300">·</span>
                          <span className="capitalize text-slate-600">{l.status.replace(/_/g, " ")}</span>
                        </>
                      ) : null}
                      <span className="mt-1 block text-xs text-slate-500">
                        Owner: {leadOwner}
                        <span className="mx-2 text-slate-300">|</span>
                        <span className="font-mono text-[10px]">{l.id}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className={cardCls}>
        <h2 className="text-sm font-bold text-slate-900">Payer metadata on this contact</h2>
        <p className="mt-1 text-xs text-slate-500">
          Lightweight JSON for directory context. For full payer onboarding workflows use{" "}
          <Link href="/admin/credentialing" className="font-semibold text-sky-800 hover:underline">
            Credentialing
          </Link>{" "}
          (separate <span className="font-mono text-[10px]">payer_credentialing_records</span> table).
        </p>
        <p className="mt-3 text-sm text-slate-800">
          <span className="text-slate-500">Summary:</span> <span className="font-medium">{credSummary}</span>
        </p>
        {!metaEmpty ? (
          <pre className="mt-3 max-h-72 overflow-auto rounded-xl bg-slate-50 p-3 font-mono text-xs text-slate-800">{metaJson}</pre>
        ) : (
          <p className="mt-3 text-sm text-slate-500">No JSON metadata on this contact.</p>
        )}
      </div>

      {(row.notes ?? "").trim() ? (
        <div className={cardCls}>
          <h2 className="text-sm font-bold text-slate-900">Notes</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{row.notes}</p>
        </div>
      ) : null}
    </div>
  );
}
