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
import { labelForContactType } from "@/lib/crm/contact-types";
import { formatLeadSourceLabel } from "@/lib/crm/lead-source-options";
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

function formatWhen(iso: string | null | undefined): string {
  if (!iso || typeof iso !== "string") return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 16);
  return d.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

const dtCls = "text-[10px] font-semibold uppercase tracking-wide text-slate-500";
const ddCls = "mt-0.5 text-sm text-slate-900";
const rowCls = "border-b border-slate-100 py-3 last:border-0";

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
      "id, first_name, last_name, full_name, organization_name, primary_phone, secondary_phone, email, address_line_1, address_line_2, city, state, zip, contact_type, status, referral_source, owner_user_id, relationship_metadata, notes, created_at, updated_at"
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
  const ownerLabel = directoryOwnerId ? staffPrimaryLabel(staffByUserId[directoryOwnerId] ?? { user_id: directoryOwnerId, email: null, full_name: null }) : "—";

  const badges = buildRelationshipTypeBadges(row, patient, leads);
  const displayName = contactDirectoryDisplayName(row);
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

  const cardCls = "rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm";

  return (
    <div className="space-y-6 p-6">
      <nav className="flex flex-wrap gap-3 text-sm font-semibold text-sky-800">
        <Link href="/admin" className="underline-offset-2 hover:underline">
          Admin
        </Link>
        <span className="text-slate-300">|</span>
        <Link href="/admin/crm/leads" className="underline-offset-2 hover:underline">
          Leads
        </Link>
        <Link href="/admin/crm/patients" className="underline-offset-2 hover:underline">
          Patients
        </Link>
        <span className="text-slate-300">|</span>
        <Link href={backHref} className="underline-offset-2 hover:underline">
          Contacts
        </Link>
        <span className="text-slate-300">|</span>
        <span className="text-slate-900">Profile</span>
      </nav>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">CRM · Contacts</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">{displayName}</h1>
        <p className="mt-1 text-sm text-slate-600">
          Contact ID <span className="font-mono text-xs text-slate-500">{row.id}</span>
          {" · "}
          Updated {formatWhen(row.updated_at)}
          {" · "}
          Created {formatWhen(row.created_at)}
        </p>
      </div>

      <div className={cardCls}>
        <h2 className="text-sm font-bold text-slate-900">Contact profile</h2>
        <p className="mt-1 text-xs text-slate-500">
          Source of truth is this <span className="font-medium text-slate-700">contacts</span> row (phones, email, and
          mailing address). Patient and lead charts add clinical and pipeline context via links below.
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
            <p className={dtCls}>Secondary / caregiver / alternate</p>
            <p className={`${ddCls} tabular-nums`}>{formatPhoneForDisplay(row.secondary_phone)}</p>
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
              Uses <span className="font-medium">contacts.referral_source</span> when set; otherwise the newest lead&apos;s
              source.
            </p>
          </div>
        </div>
      </div>

      <div className={cardCls}>
        <h2 className="text-sm font-bold text-slate-900">Linked charts</h2>
        <p className="mt-1 text-xs text-slate-500">Open the patient or lead workspace for clinical and pipeline detail.</p>

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
        <h2 className="text-sm font-bold text-slate-900">Payer and credentialing metadata</h2>
        <p className="mt-1 text-xs text-slate-500">
          Extra fields for payers and contracting live in <span className="font-mono text-[10px]">relationship_metadata</span>{" "}
          (JSON on this contact). They supplement type and status; deep onboarding workflows can stay in a dedicated
          credentialing area later.
        </p>
        <p className="mt-3 text-sm text-slate-800">
          <span className="text-slate-500">Summary:</span>{" "}
          <span className="font-medium">{credSummary}</span>
        </p>
        {!metaEmpty ? (
          <pre className="mt-3 max-h-72 overflow-auto rounded-xl bg-slate-50 p-3 font-mono text-xs text-slate-800">{metaJson}</pre>
        ) : (
          <p className="mt-3 text-sm text-slate-500">No JSON metadata saved on this contact yet.</p>
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
