import Link from "next/link";
import { redirect } from "next/navigation";

import { WorkspacePhonePageHeader } from "../_components/WorkspacePhonePageHeader";
import { WorkspaceLeadRowActions } from "@/app/workspace/phone/leads/_components/WorkspaceLeadRowActions";
import { displayNameFromContact } from "@/app/workspace/phone/patients/_lib/patient-hub";
import { leadRowsActiveOnly } from "@/lib/crm/leads-active";
import { getCrmCalendarTodayIso } from "@/lib/crm/crm-local-date";
import { formatLeadLastContactSummary } from "@/lib/crm/lead-contact-outcome";
import { formatLeadNextActionLabel } from "@/lib/crm/lead-follow-up-options";
import { formatLeadPipelineStatusLabel, isLeadPipelineTerminal } from "@/lib/crm/lead-pipeline-status";
import { supabaseAdmin } from "@/lib/admin";
import { pickOutboundE164ForDial } from "@/lib/workspace-phone/launch-urls";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";
import { canAccessWorkspacePhone, getStaffProfile } from "@/lib/staff-profile";

type ContactEmb = {
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

export default async function WorkspaceFollowUpsTodayPage() {
  const staff = await getStaffProfile();
  if (!canAccessWorkspacePhone(staff)) {
    redirect("/admin/phone");
  }

  const todayIso = getCrmCalendarTodayIso();

  const { data: leadRows, error: leadsErr } = await leadRowsActiveOnly(
    supabaseAdmin
      .from("leads")
      .select(
        "id, contact_id, status, follow_up_date, next_action, last_contact_at, last_outcome, contacts ( id, full_name, first_name, last_name, primary_phone )"
      )
      .eq("follow_up_date", todayIso)
      .limit(300)
  );

  if (leadsErr) {
    console.warn("[workspace/phone/follow-ups-today] leads:", leadsErr.message);
  }

  const due: LeadRow[] = (leadRows ?? []).filter((r) => {
    const s = typeof r.status === "string" ? r.status : "";
    return !isLeadPipelineTerminal(s);
  }) as LeadRow[];

  due.sort((a, b) => {
    const ca = normalizeContact(a.contacts as ContactEmb | ContactEmb[] | null);
    const cb = normalizeContact(b.contacts as ContactEmb | ContactEmb[] | null);
    return displayNameFromContact(ca).localeCompare(displayNameFromContact(cb), undefined, {
      sensitivity: "base",
    });
  });

  return (
    <div className="flex flex-1 flex-col px-4 pb-6 pt-5 sm:px-5">
      <WorkspacePhonePageHeader
        title="Follow-ups today"
        subtitle={
          <>
            CRM follow-up date is today (US Central). Open a lead in{" "}
            <Link href="/admin/crm/leads" className="font-medium text-sky-700 underline-offset-2 hover:underline">
              CRM
            </Link>{" "}
            to log outcomes.
          </>
        }
      />
      <p className="mt-1 text-sm font-medium text-amber-900">
        {todayIso} · {due.length} lead{due.length === 1 ? "" : "s"}
      </p>

      <ul className="mt-6 space-y-3">
        {due.length === 0 ? (
          <li className="rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-6 text-center text-sm text-slate-600 shadow-sm">
            No leads due for follow-up today.
          </li>
        ) : null}
        {due.map((row) => {
          const c = normalizeContact(row.contacts as ContactEmb | ContactEmb[] | null);
          const name = displayNameFromContact(c);
          const contactId = typeof row.contact_id === "string" ? row.contact_id.trim() : "";
          const phoneRaw = typeof c?.primary_phone === "string" ? c.primary_phone : null;
          const phoneDisplay = formatPhoneForDisplay(phoneRaw);
          const nextLabel = formatLeadNextActionLabel(row.next_action);
          const dialE164 = pickOutboundE164ForDial(phoneRaw);

          return (
            <li
              key={row.id}
              className="rounded-2xl border border-amber-200/60 bg-white/95 p-4 shadow-sm shadow-amber-100/40"
            >
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
                  {row.next_action ? (
                    <span
                      className="max-w-[14rem] truncate rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-900"
                      title={nextLabel}
                    >
                      Next: {nextLabel}
                    </span>
                  ) : (
                    <span className="rounded-full bg-slate-50 px-2 py-0.5 text-[10px] text-slate-500">No next action</span>
                  )}
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
