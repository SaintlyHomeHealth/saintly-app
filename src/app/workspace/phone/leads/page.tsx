import Link from "next/link";
import { redirect } from "next/navigation";

import { WorkspaceLeadRowActions } from "@/app/workspace/phone/leads/_components/WorkspaceLeadRowActions";
import { displayNameFromContact } from "@/app/workspace/phone/patients/_lib/patient-hub";
import { getCrmCalendarTodayIso } from "@/lib/crm/crm-local-date";
import { formatLeadLastContactSummary } from "@/lib/crm/lead-contact-outcome";
import { formatLeadNextActionLabel } from "@/lib/crm/lead-follow-up-options";
import { formatLeadPipelineStatusLabel, isLeadPipelineTerminal } from "@/lib/crm/lead-pipeline-status";
import { supabaseAdmin } from "@/lib/admin";
import { pickOutboundE164ForDial } from "@/lib/workspace-phone/launch-urls";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";
import { canAccessWorkspacePhone, getStaffProfile } from "@/lib/staff-profile";

type ContactEmb = {
  id?: string;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  primary_phone?: string | null;
};

function normalizeContact(raw: ContactEmb | ContactEmb[] | null | undefined): ContactEmb | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw;
}

function formatFollowUpDate(iso: string | null | undefined): string {
  if (!iso || typeof iso !== "string") return "—";
  const d = iso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return "—";
  const parsed = new Date(`${d}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return d;
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function hasSmsCapablePhone(raw: string | null | undefined): boolean {
  const t = typeof raw === "string" ? raw.trim() : "";
  if (!t) return false;
  return Boolean(pickOutboundE164ForDial(t));
}

type LeadRow = {
  id: string;
  contact_id: string | null;
  status: string | null;
  follow_up_date: string | null;
  next_action: string | null;
  last_contact_at: string | null;
  last_outcome: string | null;
  contacts: ContactEmb | ContactEmb[] | null;
};

function one(sp: Record<string, string | string[] | undefined>, key: string): string {
  const v = sp[key];
  return typeof v === "string" ? v : Array.isArray(v) ? (v[0] ?? "") : "";
}

function smsErrMessage(code: string): string {
  switch (code) {
    case "no_phone":
      return "No valid SMS number on file for that contact.";
    case "bad_contact":
      return "Contact not found.";
    case "persist_failed":
      return "Could not open SMS thread. Try again or use Admin → Messages.";
    default:
      return "Could not open SMS thread.";
  }
}

export default async function WorkspacePhoneLeadsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await getStaffProfile();
  if (!canAccessWorkspacePhone(staff)) {
    redirect("/admin/phone");
  }

  const sp = searchParams ? await searchParams : {};
  const smsErr = one(sp, "smsErr").trim();

  const todayIso = getCrmCalendarTodayIso();

  const { data: leadRows, error: leadsErr } = await supabaseAdmin
    .from("leads")
    .select(
      "id, contact_id, status, follow_up_date, next_action, last_contact_at, last_outcome, contacts ( id, full_name, first_name, last_name, primary_phone )"
    )
    .limit(400);

  if (leadsErr) {
    console.warn("[workspace/phone/leads] leads:", leadsErr.message);
  }

  const openLeads: LeadRow[] = (leadRows ?? []).filter((r) => {
    const s = typeof r.status === "string" ? r.status : "";
    return !isLeadPipelineTerminal(s);
  }) as LeadRow[];

  function followUpSortKey(iso: string | null | undefined): string {
    if (!iso || typeof iso !== "string") return "9999-12-31";
    const d = iso.slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : "9999-12-31";
  }

  openLeads.sort((a, b) => {
    const fd = followUpSortKey(a.follow_up_date).localeCompare(followUpSortKey(b.follow_up_date));
    if (fd !== 0) return fd;
    const ca = normalizeContact(a.contacts as ContactEmb | ContactEmb[] | null);
    const cb = normalizeContact(b.contacts as ContactEmb | ContactEmb[] | null);
    return displayNameFromContact(ca).localeCompare(displayNameFromContact(cb), undefined, {
      sensitivity: "base",
    });
  });

  return (
    <div className="flex flex-1 flex-col px-4 pb-4 pt-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Leads</h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Call or text from the phone workspace. Full workflow stays in{" "}
            <Link href="/admin/crm/leads" className="font-medium text-sky-700 underline-offset-2 hover:underline">
              CRM
            </Link>
            .
          </p>
        </div>
      </div>

      {smsErr ? (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          {smsErrMessage(smsErr)}
        </div>
      ) : null}

      <ul className="mt-4 space-y-3">
        {openLeads.length === 0 ? (
          <li className="rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-6 text-center text-sm text-slate-600 shadow-sm">
            No open leads in the pipeline.
          </li>
        ) : null}
        {openLeads.map((row) => {
          const c = normalizeContact(row.contacts as ContactEmb | ContactEmb[] | null);
          const name = displayNameFromContact(c);
          const contactId = typeof row.contact_id === "string" ? row.contact_id.trim() : "";
          const phoneRaw = typeof c?.primary_phone === "string" ? c.primary_phone : null;
          const phoneDisplay = formatPhoneForDisplay(phoneRaw);
          const fu = row.follow_up_date?.slice(0, 10) ?? "";
          const followUpToday = fu === todayIso;
          const nextLabel = formatLeadNextActionLabel(row.next_action);
          const dialE164 = pickOutboundE164ForDial(phoneRaw);

          return (
            <li
              key={row.id}
              className="rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-sm shadow-slate-200/40"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{name}</p>
                  <p className="mt-0.5 text-xs text-slate-600">{phoneDisplay}</p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Last contact:{" "}
                    <span className="font-medium text-slate-700">
                      {formatLeadLastContactSummary(row.last_contact_at, row.last_outcome)}
                    </span>
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700">
                      {formatLeadPipelineStatusLabel(row.status)}
                    </span>
                    {followUpToday ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-950">
                        Follow-up today
                      </span>
                    ) : null}
                    {row.next_action ? (
                      <span
                        className="max-w-[14rem] truncate rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-900"
                        title={nextLabel}
                      >
                        Next: {nextLabel}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1.5 text-[11px] text-slate-500">
                    Follow-up:{" "}
                    <span className="font-medium text-slate-700">{formatFollowUpDate(row.follow_up_date)}</span>
                  </p>
                </div>
              </div>
              {contactId ? (
                <WorkspaceLeadRowActions
                  leadId={row.id}
                  contactId={contactId}
                  dialE164={dialE164}
                  hasSmsCapablePhone={hasSmsCapablePhone(phoneRaw)}
                  displayName={name}
                />
              ) : (
                <p className="mt-2 text-xs text-rose-700">Missing contact on this lead.</p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
