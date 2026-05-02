import Link from "next/link";
import { redirect } from "next/navigation";

import { WorkspacePhonePageHeader } from "../_components/WorkspacePhonePageHeader";
import { WorkspaceLeadRowActions } from "@/app/workspace/phone/leads/_components/WorkspaceLeadRowActions";
import { displayNameFromContact } from "@/app/workspace/phone/patients/_lib/patient-hub";
import { leadRowsActiveOnly } from "@/lib/crm/leads-active";
import { pipelineStatusBadgeClass } from "@/lib/crm/crm-leads-list-visual";
import { getCrmCalendarTodayIso } from "@/lib/crm/crm-local-date";
import { formatLeadLastContactSummary } from "@/lib/crm/lead-contact-outcome";
import { formatLeadNextActionLabel } from "@/lib/crm/lead-follow-up-options";
import { formatLeadPipelineStatusLabel, isLeadPipelineTerminal } from "@/lib/crm/lead-pipeline-status";
import { supabaseAdmin } from "@/lib/admin";
import { pickOutboundE164ForDial } from "@/lib/workspace-phone/launch-urls";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";
import {
  routePerfLog,
  routePerfStart,
  routePerfStepsEnabled,
  routePerfTimed,
} from "@/lib/perf/route-perf";
import { staffMayAccessWorkspaceSms } from "@/lib/phone/staff-phone-policy";
import { canAccessWorkspacePhone, getStaffProfile, isWorkspaceEmployeeRole } from "@/lib/staff-profile";

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
  created_at: string | null;
  contacts: ContactEmb | ContactEmb[] | null;
};

type ConvActivityRow = {
  last_message_at: string | null;
  updated_at: string | null;
  created_at: string | null;
};

const WORKSPACE_LEADS_LIMIT = 100;

function rowActivityMs(r: ConvActivityRow): number {
  let best = 0;
  for (const iso of [r.last_message_at, r.updated_at, r.created_at]) {
    if (!iso) continue;
    const t = new Date(iso).getTime();
    if (Number.isFinite(t) && t > best) best = t;
  }
  return best;
}

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
  const perfStart = routePerfStart();
  const staff = routePerfStepsEnabled()
    ? await routePerfTimed("workspace_phone_leads.staff_profile", getStaffProfile)
    : await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff) || !staffMayAccessWorkspaceSms(staff)) {
    redirect("/workspace/phone/visits");
  }

  if (isWorkspaceEmployeeRole(staff.role)) {
    redirect("/workspace/phone/visits");
  }

  const sp = searchParams ? await searchParams : {};
  const smsErr = one(sp, "smsErr").trim();

  const todayIso = getCrmCalendarTodayIso();

  const leadsQuery = leadRowsActiveOnly(
    supabaseAdmin
      .from("leads")
      .select(
        "id, contact_id, status, follow_up_date, next_action, last_contact_at, last_outcome, created_at, contacts ( id, full_name, first_name, last_name, primary_phone )"
      )
      .order("last_contact_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false, nullsFirst: false })
      .limit(WORKSPACE_LEADS_LIMIT)
  );
  const { data: leadRows, error: leadsErr } = routePerfStepsEnabled()
    ? await routePerfTimed("workspace_phone_leads.leads_query", () => leadsQuery)
    : await leadsQuery;

  if (leadsErr) {
    console.warn("[workspace/phone/leads] leads:", leadsErr.message);
  }

  const openLeads: LeadRow[] = (leadRows ?? []).filter((r) => {
    const s = typeof r.status === "string" ? r.status : "";
    return !isLeadPipelineTerminal(s);
  }) as LeadRow[];

  const contactIds = [
    ...new Set(
      openLeads
        .map((r) => (typeof r.contact_id === "string" ? r.contact_id.trim() : ""))
        .filter(Boolean)
    ),
  ];

  const convByContact = new Map<string, ConvActivityRow>();

  if (contactIds.length > 0) {
    const convQuery = supabaseAdmin
      .from("conversations")
      .select("primary_contact_id, last_message_at, updated_at, created_at")
      .eq("channel", "sms")
      .is("deleted_at", null)
      .in("primary_contact_id", contactIds);
    const { data: convRows, error: convErr } = routePerfStepsEnabled()
      ? await routePerfTimed("workspace_phone_leads.conversation_activity", () => convQuery)
      : await convQuery;

    if (convErr) {
      console.warn("[workspace/phone/leads] conversations:", convErr.message);
    }

    for (const row of convRows ?? []) {
      const pc = typeof row.primary_contact_id === "string" ? row.primary_contact_id.trim() : "";
      if (!pc) continue;
      const next: ConvActivityRow = {
        last_message_at: typeof row.last_message_at === "string" ? row.last_message_at : null,
        updated_at: typeof row.updated_at === "string" ? row.updated_at : null,
        created_at: typeof row.created_at === "string" ? row.created_at : null,
      };
      const prev = convByContact.get(pc);
      if (!prev || rowActivityMs(next) > rowActivityMs(prev)) {
        convByContact.set(pc, next);
      }
    }
  }

  function leadWorkspaceActivityMs(lead: LeadRow): number {
    const cid = typeof lead.contact_id === "string" ? lead.contact_id.trim() : "";
    const empty: ConvActivityRow = { last_message_at: null, updated_at: null, created_at: null };
    const fromConv = cid ? rowActivityMs(convByContact.get(cid) ?? empty) : 0;
    let lc = 0;
    if (lead.last_contact_at) {
      const t = new Date(lead.last_contact_at).getTime();
      if (Number.isFinite(t)) lc = t;
    }
    let cr = 0;
    if (lead.created_at) {
      const t = new Date(lead.created_at).getTime();
      if (Number.isFinite(t)) cr = t;
    }
    return Math.max(fromConv, lc, cr);
  }

  openLeads.sort((a, b) => {
    const ma = leadWorkspaceActivityMs(a);
    const mb = leadWorkspaceActivityMs(b);
    if (mb !== ma) return mb - ma;
    const ca = a.created_at ? new Date(a.created_at).getTime() : 0;
    const cb = b.created_at ? new Date(b.created_at).getTime() : 0;
    if (cb !== ca) return cb - ca;
    const na = normalizeContact(a.contacts as ContactEmb | ContactEmb[] | null);
    const nb = normalizeContact(b.contacts as ContactEmb | ContactEmb[] | null);
    return displayNameFromContact(na).localeCompare(displayNameFromContact(nb), undefined, {
      sensitivity: "base",
    });
  });

  if (perfStart) {
    routePerfLog("workspace/phone/leads", perfStart);
  }

  return (
    <div className="ws-phone-page-shell flex flex-1 flex-col px-4 pb-6 pt-5 sm:px-5">
      <WorkspacePhonePageHeader
        title="Leads"
        subtitle={
          <>
            Call or text from here. Full pipeline workflow stays in{" "}
            <Link href="/admin/crm/leads" className="font-medium text-sky-700 underline-offset-2 hover:underline">
              CRM
            </Link>
            .
          </>
        }
      />

      {smsErr ? (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          {smsErrMessage(smsErr)}
        </div>
      ) : null}

      <ul className="mt-4 space-y-3">
        {openLeads.length === 0 ? (
          <li className="ws-phone-card px-4 py-6 text-center text-sm text-slate-600">
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
              className="ws-phone-card p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-phone-navy">{name}</p>
                  <p className="mt-0.5 text-xs text-slate-600">{phoneDisplay}</p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Last contact:{" "}
                    <span className="font-medium text-slate-700">
                      {formatLeadLastContactSummary(row.last_contact_at, row.last_outcome, row.status)}
                    </span>
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span
                      className={`inline-flex max-w-full shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${pipelineStatusBadgeClass(row.status)}`}
                    >
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
