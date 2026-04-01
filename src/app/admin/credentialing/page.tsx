import Link from "next/link";
import { redirect } from "next/navigation";

import {
  CONTRACTING_STATUS_LABELS,
  CREDENTIALING_LIST_SEGMENTS,
  CREDENTIALING_STATUS_LABELS,
  type CredentialingListSegment,
  isCredentialingListSegment,
} from "@/lib/crm/credentialing-status-options";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function buildSegmentHref(segment: CredentialingListSegment): string {
  return segment === "all" ? "/admin/credentialing" : `/admin/credentialing?segment=${segment}`;
}

export default async function AdminCredentialingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    redirect("/admin");
  }

  const raw = await searchParams;
  const segRaw = typeof raw.segment === "string" ? raw.segment.trim().toLowerCase() : "";
  const segment: CredentialingListSegment = isCredentialingListSegment(segRaw) ? segRaw : "all";

  const supabase = await createServerSupabaseClient();
  let query = supabase
    .from("payer_credentialing_records")
    .select(
      "id, payer_name, payer_type, market_state, credentialing_status, contracting_status, portal_url, primary_contact_name, primary_contact_phone, primary_contact_email, notes, last_follow_up_at, updated_at"
    )
    .order("updated_at", { ascending: false })
    .limit(500);

  if (segment === "in_progress") {
    query = query.eq("credentialing_status", "in_progress");
  } else if (segment === "submitted") {
    query = query.eq("credentialing_status", "submitted");
  } else if (segment === "enrolled") {
    query = query.eq("credentialing_status", "enrolled");
  } else if (segment === "contracted") {
    query = query.eq("contracting_status", "contracted");
  } else if (segment === "stalled") {
    query = query.or("credentialing_status.eq.stalled,contracting_status.eq.stalled");
  }

  const { data: rows, error } = await query;

  const list = (rows ?? []) as {
    id: string;
    payer_name: string;
    payer_type: string | null;
    market_state: string | null;
    credentialing_status: string;
    contracting_status: string;
    portal_url: string | null;
    primary_contact_name: string | null;
    primary_contact_phone: string | null;
    primary_contact_email: string | null;
    notes: string | null;
    last_follow_up_at: string | null;
    updated_at: string;
  }[];

  const chipBase =
    "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition";
  const chipOff = `${chipBase} border-slate-200 bg-white text-slate-600 hover:border-sky-200 hover:bg-sky-50`;
  const chipOn = `${chipBase} border-sky-300 bg-sky-50 text-sky-900`;

  return (
    <div className="space-y-6 p-6">
      <nav className="flex flex-wrap gap-3 text-sm font-semibold text-sky-800">
        <Link href="/admin" className="underline-offset-2 hover:underline">
          Admin
        </Link>
        <span className="text-slate-300">|</span>
        <Link href="/admin/crm/contacts" className="underline-offset-2 hover:underline">
          Contacts
        </Link>
        <Link href="/admin/crm/leads" className="underline-offset-2 hover:underline">
          Leads
        </Link>
        <Link href="/admin/crm/patients" className="underline-offset-2 hover:underline">
          Patients
        </Link>
        <span className="text-slate-300">|</span>
        <span className="text-slate-900">Credentialing</span>
      </nav>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Operations</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Payer credentialing</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Track payer onboarding, enrollment, and contracting. This is separate from the CRM{" "}
            <Link href="/admin/crm/contacts" className="font-semibold text-sky-800 hover:underline">
              Contacts
            </Link>{" "}
            directory (people and care relationships).
          </p>
        </div>
        <Link
          href="/admin/credentialing/new"
          className="inline-flex shrink-0 items-center justify-center rounded-[20px] bg-gradient-to-r from-sky-600 to-cyan-500 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-sky-200/60 transition hover:-translate-y-px hover:shadow-md"
        >
          New payer record
        </Link>
      </div>

      {error ? (
        <p className="text-sm text-red-700">
          {error.message.includes("payer_credentialing_records")
            ? "Run the payer_credentialing database migration, then reload."
            : error.message}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {CREDENTIALING_LIST_SEGMENTS.map(({ value, label }) => (
          <Link key={value} href={buildSegmentHref(value)} className={segment === value ? chipOn : chipOff}>
            {label}
          </Link>
        ))}
      </div>

      <div className="overflow-x-auto rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-xs font-semibold text-slate-600">
              <th className="px-4 py-3">Payer</th>
              <th className="px-4 py-3">Type / market</th>
              <th className="px-4 py-3">Credentialing</th>
              <th className="px-4 py-3">Contracting</th>
              <th className="px-4 py-3">Portal</th>
              <th className="px-4 py-3">Primary contact</th>
              <th className="px-4 py-3">Last follow-up</th>
              <th className="px-4 py-3">Updated</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-slate-500">
                  No payer records yet.{" "}
                  <Link href="/admin/credentialing/new" className="font-semibold text-sky-800 hover:underline">
                    Add one
                  </Link>
                  .
                </td>
              </tr>
            ) : (
              list.map((r) => {
                const notesPreview = (r.notes ?? "").trim().slice(0, 80);
                const credLabel =
                  CREDENTIALING_STATUS_LABELS[r.credentialing_status as keyof typeof CREDENTIALING_STATUS_LABELS] ??
                  r.credentialing_status;
                const contLabel =
                  CONTRACTING_STATUS_LABELS[r.contracting_status as keyof typeof CONTRACTING_STATUS_LABELS] ??
                  r.contracting_status;
                return (
                  <tr key={r.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3 font-medium text-slate-900">{r.payer_name}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {(r.payer_type ?? "").trim() || "—"}
                      {(r.market_state ?? "").trim() ? (
                        <>
                          <br />
                          <span className="text-slate-500">{r.market_state}</span>
                        </>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700">{credLabel}</td>
                    <td className="px-4 py-3 text-xs text-slate-700">{contLabel}</td>
                    <td className="max-w-[140px] px-4 py-3 text-xs">
                      {r.portal_url?.trim() ? (
                        <a
                          href={r.portal_url.trim()}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold text-sky-800 underline-offset-2 hover:underline"
                        >
                          Open
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="max-w-[180px] px-4 py-3 text-xs text-slate-700">
                      {(r.primary_contact_name ?? "").trim() || "—"}
                      {(r.primary_contact_phone ?? "").trim() ? (
                        <span className="mt-0.5 block tabular-nums text-slate-600">
                          {formatPhoneForDisplay(r.primary_contact_phone)}
                        </span>
                      ) : null}
                      {(r.primary_contact_email ?? "").trim() ? (
                        <span className="mt-0.5 block truncate text-slate-500">{r.primary_contact_email}</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {r.last_follow_up_at
                        ? new Date(r.last_follow_up_at).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {new Date(r.updated_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <Link
                        href={`/admin/credentialing/${r.id}`}
                        className="font-semibold text-sky-800 underline-offset-2 hover:underline"
                      >
                        Open
                      </Link>
                      {notesPreview ? (
                        <p className="mt-1 max-w-[140px] text-[10px] leading-snug text-slate-500" title={r.notes ?? ""}>
                          {notesPreview}
                          {(r.notes ?? "").length > 80 ? "…" : ""}
                        </p>
                      ) : null}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
