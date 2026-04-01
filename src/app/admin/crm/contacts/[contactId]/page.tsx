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
  resolveDirectoryOwnerUserId,
  resolveDirectorySourceLabel,
  resolveDirectoryStatusLabel,
} from "@/lib/crm/contact-directory";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";
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
  const backHref =
    returnTo && returnTo.startsWith("?") ? `/admin/crm/contacts${returnTo}` : "/admin/crm/contacts";

  const supabase = await createServerSupabaseClient();

  const { data: crow, error } = await supabase
    .from("contacts")
    .select(
      "id, first_name, last_name, full_name, organization_name, primary_phone, secondary_phone, email, contact_type, status, referral_source, owner_user_id, relationship_metadata, notes, created_at, updated_at"
    )
    .eq("id", contactId)
    .maybeSingle();

  if (error || !crow) {
    notFound();
  }

  const row = crow as ContactDirectoryDbRow;

  const [{ data: prow }, { data: lrows }] = await Promise.all([
    supabase.from("patients").select("id, contact_id, patient_status").eq("contact_id", contactId).maybeSingle(),
    supabase
      .from("leads")
      .select("id, contact_id, source, status, owner_user_id, created_at")
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false }),
  ]);

  const patient: PatientLinkBrief | null = prow
    ? {
        id: String((prow as { id: string }).id),
        patient_status: String((prow as { patient_status: string }).patient_status),
      }
    : null;

  const leads: LeadLinkBrief[] = ((lrows ?? []) as LeadRowWithContact[])
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .map(({ id, source, status, owner_user_id }) => ({ id, source, status, owner_user_id }));

  const ownerId = resolveDirectoryOwnerUserId(row, leads);
  let ownerLabel = "—";
  if (ownerId) {
    const { data: sp } = await supabase
      .from("staff_profiles")
      .select("user_id, email, full_name")
      .eq("user_id", ownerId)
      .maybeSingle();
    if (sp) ownerLabel = staffPrimaryLabel(sp as { user_id: string; email: string | null; full_name: string | null });
  }

  const badges = buildRelationshipTypeBadges(row, patient, leads);
  const displayName = contactDirectoryDisplayName(row);
  const metaJson =
    row.relationship_metadata && typeof row.relationship_metadata === "object"
      ? JSON.stringify(row.relationship_metadata, null, 2)
      : String(row.relationship_metadata ?? "{}");

  const cardCls = "rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm";

  return (
    <div className="space-y-6 p-6">
      <nav className="flex flex-wrap gap-3 text-sm font-semibold text-sky-800">
        <Link href="/admin" className="underline-offset-2 hover:underline">
          Admin
        </Link>
        <span className="text-slate-300">|</span>
        <Link href={backHref} className="underline-offset-2 hover:underline">
          Contacts
        </Link>
        <span className="text-slate-300">|</span>
        <span className="text-slate-900">Contact detail</span>
      </nav>

      <div>
        <h1 className="text-2xl font-bold text-slate-900">{displayName}</h1>
        <p className="mt-1 text-sm text-slate-600">CRM master record · {row.id}</p>
      </div>

      <div className={`${cardCls} flex flex-wrap gap-2`}>
        {badges.map((b) => (
          <span
            key={b}
            className="inline-flex rounded-full border border-sky-100 bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-900"
          >
            {b}
          </span>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={cardCls}>
          <h2 className="text-sm font-bold text-slate-900">Contact</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4 border-b border-slate-100 py-2">
              <dt className="text-slate-500">Organization</dt>
              <dd className="text-right text-slate-800">{(row.organization_name ?? "").trim() || "—"}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-slate-100 py-2">
              <dt className="text-slate-500">Person name</dt>
              <dd className="text-right text-slate-800">
                {(row.full_name ?? "").trim() ||
                  [row.first_name, row.last_name].filter(Boolean).join(" ").trim() ||
                  "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-slate-100 py-2">
              <dt className="text-slate-500">Phones</dt>
              <dd className="text-right tabular-nums text-slate-800">
                {formatPhoneForDisplay(row.primary_phone)}
                {row.secondary_phone ? ` · ${formatPhoneForDisplay(row.secondary_phone)}` : ""}
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-slate-100 py-2">
              <dt className="text-slate-500">Email</dt>
              <dd className="max-w-[60%] truncate text-right text-slate-800">{row.email ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-slate-100 py-2">
              <dt className="text-slate-500">Status</dt>
              <dd className="text-right text-slate-800">{resolveDirectoryStatusLabel(row, patient, leads)}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-slate-100 py-2">
              <dt className="text-slate-500">Owner</dt>
              <dd className="text-right text-slate-800">{ownerLabel}</dd>
            </div>
            <div className="flex justify-between gap-4 py-2">
              <dt className="text-slate-500">Source / referral</dt>
              <dd className="text-right text-slate-800">{resolveDirectorySourceLabel(row, leads)}</dd>
            </div>
          </dl>
        </div>

        <div className={cardCls}>
          <h2 className="text-sm font-bold text-slate-900">Linked records</h2>
          <ul className="mt-3 list-inside list-disc space-y-2 text-sm text-sky-800">
            {patient ? (
              <li>
                <Link href={`/admin/crm/patients/${patient.id}`} className="underline-offset-2 hover:underline">
                  Patient ({patient.patient_status})
                </Link>
              </li>
            ) : (
              <li className="list-none text-slate-500">No patient record.</li>
            )}
            {leads.map((l) => (
              <li key={l.id}>
                <Link href={`/admin/crm/leads/${l.id}`} className="underline-offset-2 hover:underline">
                  Lead · {l.source}
                  {l.status ? ` (${l.status})` : ""}
                </Link>
              </li>
            ))}
            {leads.length === 0 ? (
              <li className="list-none text-slate-500">No open lead rows for this contact.</li>
            ) : null}
          </ul>
          <p className="mt-4 text-xs text-slate-500">
            Full payer contracting and credentialing checklists can live under a dedicated Admin → Credentialing section,
            keyed off this contact, without overloading the shared directory table.
          </p>
        </div>
      </div>

      <div className={cardCls}>
        <h2 className="text-sm font-bold text-slate-900">Credentialing snapshot</h2>
        <p className="mt-1 text-xs text-slate-600">
          Summary: <span className="font-medium text-slate-800">{credentialingSummaryFromMetadata(row.relationship_metadata)}</span>
        </p>
        <pre className="mt-3 max-h-64 overflow-auto rounded-xl bg-slate-50 p-3 text-xs text-slate-800">{metaJson}</pre>
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
