import Link from "next/link";
import { redirect } from "next/navigation";

import { getCrmCalendarTodayIso } from "@/lib/crm/crm-local-date";
import { formatLeadLastContactSummary } from "@/lib/crm/lead-contact-outcome";
import { formatLeadNextActionLabel } from "@/lib/crm/lead-follow-up-options";
import {
  formatLeadPipelineStatusLabel,
  isValidLeadPipelineStatus,
  LEAD_PIPELINE_STATUS_OPTIONS,
} from "@/lib/crm/lead-pipeline-status";
import { formatLeadSourceLabel, LEAD_SOURCE_OPTIONS } from "@/lib/crm/lead-source-options";
import { PAYER_BROAD_CATEGORY_OPTIONS } from "@/lib/crm/payer-type-options";
import { contactRowsActiveOnly } from "@/lib/crm/contacts-active";
import { leadRowsActiveOnly } from "@/lib/crm/leads-active";
import { SERVICE_DISCIPLINE_CODES } from "@/lib/crm/service-disciplines";
import { supabaseAdmin } from "@/lib/admin";
import { formatPhoneForDisplay, normalizePhone } from "@/lib/phone/us-phone-format";
import {
  buildWorkspaceKeypadCallHref,
  buildWorkspaceSmsToContactHref,
  pickOutboundE164ForDial,
} from "@/lib/workspace-phone/launch-urls";
import { LeadDeleteButton } from "@/app/admin/crm/leads/_components/LeadDeleteButton";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

type ContactEmb = {
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  primary_phone?: string | null;
};

function contactDisplayName(c: ContactEmb | null): string {
  if (!c) return "—";
  const fn = (c.full_name ?? "").trim();
  if (fn) return fn;
  const parts = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
  return parts || "—";
}

function normalizeContact(raw: ContactEmb | ContactEmb[] | null | undefined): ContactEmb | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw;
}

function trunc(s: string | null | undefined, n: number): string {
  const t = (s ?? "").trim();
  if (!t) return "—";
  return t.length > n ? t.slice(0, n) + "…" : t;
}

function formatFollowUpDate(iso: string | null | undefined): string {
  if (!iso || typeof iso !== "string") return "—";
  const d = iso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return "—";
  const parsed = new Date(`${d}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return d;
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

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

function matchesDisciplineLead(
  serviceDisciplines: string[] | null,
  serviceType: string | null,
  disc: string
): boolean {
  const sd = Array.isArray(serviceDisciplines) ? serviceDisciplines : [];
  if (sd.includes(disc)) return true;
  const legacy = (serviceType ?? "").trim();
  if (!legacy) return false;
  return legacy.split(",").some((x) => x.trim() === disc);
}

function matchesSearchLead(contact: ContactEmb | null, q: string): boolean {
  if (!q.trim()) return true;
  const n = contactDisplayName(contact).toLowerCase();
  const phone = (contact?.primary_phone ?? "").toLowerCase();
  const needle = q.trim().toLowerCase();
  const phoneDigits = normalizePhone(contact?.primary_phone ?? "");
  const needleDigits = normalizePhone(q);
  if (needleDigits && phoneDigits.includes(needleDigits)) return true;
  return n.includes(needle) || phone.includes(needle);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMPTY_SENTINEL = "00000000-0000-0000-0000-000000000000";

function escapeIlikeToken(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_").replace(/[(),]/g, " ");
}

type LeadRow = {
  id: string;
  contact_id: string;
  source: string;
  status: string | null;
  owner_user_id: string | null;
  created_at: string;
  intake_status: string | null;
  referral_source: string | null;
  payer_name: string | null;
  payer_type: string | null;
  referring_provider_name: string | null;
  next_action: string | null;
  follow_up_date: string | null;
  last_contact_at: string | null;
  last_outcome: string | null;
  service_disciplines: string[] | null;
  service_type: string | null;
  contacts: ContactEmb | ContactEmb[] | null;
};

export default async function AdminCrmLeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    redirect("/admin");
  }

  const rawSp = await searchParams;
  const one = (k: string) => {
    const v = rawSp[k];
    return typeof v === "string" ? v : Array.isArray(v) ? v[0] : "";
  };

  const f = {
    status: one("status").trim(),
    source: one("source").trim(),
    owner: one("owner").trim(),
    followUp: one("followUp").trim(),
    payerType: one("payerType").trim(),
    discipline: one("discipline").trim(),
    q: one("q").trim(),
  };

  const toastParam = one("toast").trim();
  const dismissToastHref = (() => {
    const u = new URLSearchParams();
    if (f.status) u.set("status", f.status);
    if (f.source) u.set("source", f.source);
    if (f.owner) u.set("owner", f.owner);
    if (f.followUp) u.set("followUp", f.followUp);
    if (f.payerType) u.set("payerType", f.payerType);
    if (f.discipline) u.set("discipline", f.discipline);
    if (f.q) u.set("q", f.q);
    const qs = u.toString();
    return qs ? `/admin/crm/leads?${qs}` : "/admin/crm/leads";
  })();

  const followUpToday = f.followUp.toLowerCase() === "today";
  const todayIso = getCrmCalendarTodayIso();

  const { data: staffRows } = await supabaseAdmin
    .from("staff_profiles")
    .select("user_id, email, role, full_name")
    .order("email", { ascending: true });

  const staffOptions = (staffRows ?? []) as {
    user_id: string;
    email: string | null;
    role: string;
    full_name: string | null;
  }[];

  const staffById = new Map(staffOptions.map((s) => [s.user_id, s]));

  let contactIdFilter: string[] | null = null;
  if (f.q.trim()) {
    const needle = escapeIlikeToken(f.q.trim().slice(0, 120));
    const { data: hits } = await contactRowsActiveOnly(
      supabaseAdmin
        .from("contacts")
        .select("id")
        .or(`full_name.ilike.%${needle}%,primary_phone.ilike.%${needle}%`)
        .limit(300)
    );
    contactIdFilter = [...new Set((hits ?? []).map((h) => String(h.id)).filter(Boolean))];
    if (contactIdFilter.length === 0) {
      contactIdFilter = [EMPTY_SENTINEL];
    }
  }

  let query = leadRowsActiveOnly(
    supabaseAdmin
      .from("leads")
      .select(
        "id, contact_id, source, status, owner_user_id, created_at, intake_status, referral_source, payer_name, payer_type, referring_provider_name, next_action, follow_up_date, last_contact_at, last_outcome, service_disciplines, service_type, contacts ( full_name, first_name, last_name, primary_phone )"
      )
      .order("created_at", { ascending: false })
      .limit(500)
  );

  if (contactIdFilter) {
    query = query.in("contact_id", contactIdFilter);
  }

  if (f.status && isValidLeadPipelineStatus(f.status)) {
    query = query.eq("status", f.status);
  }

  if (f.source && LEAD_SOURCE_OPTIONS.some((o) => o.value === f.source)) {
    query = query.eq("source", f.source);
  }

  if (UUID_RE.test(f.owner)) {
    query = query.eq("owner_user_id", f.owner);
  }

  if (followUpToday) {
    query = query.eq("follow_up_date", todayIso);
  }

  if (f.payerType && PAYER_BROAD_CATEGORY_OPTIONS.includes(f.payerType as (typeof PAYER_BROAD_CATEGORY_OPTIONS)[number])) {
    query = query.eq("payer_type", f.payerType);
  }

  const { data: rows, error } = await query;

  let list = (rows ?? []) as LeadRow[];

  if (f.discipline && SERVICE_DISCIPLINE_CODES.includes(f.discipline as (typeof SERVICE_DISCIPLINE_CODES)[number])) {
    list = list.filter((r) => matchesDisciplineLead(r.service_disciplines, r.service_type, f.discipline));
  }

  if (f.q.trim()) {
    list = list.filter((r) => matchesSearchLead(normalizeContact(r.contacts), f.q));
  }

  list = list.slice(0, 100);

  const filterInputCls =
    "rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 shadow-sm";
  const addLeadCls =
    "inline-flex shrink-0 items-center justify-center rounded-[20px] bg-gradient-to-r from-sky-600 to-cyan-500 px-3 py-2 text-center text-xs font-semibold text-white shadow-sm shadow-sky-200/60 transition hover:-translate-y-px hover:shadow-md hover:shadow-sky-200/80 sm:text-sm";

  const toastBanner =
    toastParam === "lead_deleted" ? (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
        <span>Lead removed from the active list.</span>
        <Link href={dismissToastHref} className="font-semibold text-emerald-900 underline-offset-2 hover:underline">
          Dismiss
        </Link>
      </div>
    ) : toastParam === "lead_delete_failed" || toastParam === "lead_delete_denied" || toastParam === "lead_delete_invalid" || toastParam === "lead_delete_gone" ? (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-950">
        <span>
          {toastParam === "lead_delete_denied"
            ? "You do not have permission to delete that lead."
            : toastParam === "lead_delete_gone"
              ? "That lead is no longer available (it may already be archived)."
              : toastParam === "lead_delete_invalid"
                ? "Could not delete that lead (missing reference)."
                : "Could not delete that lead. Try again."}
        </span>
        <Link href={dismissToastHref} className="font-semibold text-rose-900 underline-offset-2 hover:underline">
          Dismiss
        </Link>
      </div>
    ) : null;

  return (
    <div className="space-y-6 p-6">
      {toastBanner}
      <AdminPageHeader
        eyebrow="Pipeline"
        title="Leads"
        description={
          <>
            Intake and follow-ups — up to 100 rows after filters. Open a lead for full detail.
            {error ? <span className="mt-2 block text-sm text-red-700">{error.message}</span> : null}
          </>
        }
        actions={
          <Link href="/admin/crm/leads/new" className={addLeadCls}>
            + New Lead
          </Link>
        }
      />

      <form
        method="get"
        action="/admin/crm/leads"
        className="flex flex-wrap items-end gap-3 rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm"
      >
        <label className="flex min-w-[8rem] flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Status
          <select name="status" defaultValue={f.status} className={filterInputCls}>
            <option value="">All</option>
            {LEAD_PIPELINE_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[8rem] flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Source
          <select name="source" defaultValue={f.source} className={filterInputCls}>
            <option value="">All</option>
            {LEAD_SOURCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[10rem] flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Owner
          <select name="owner" defaultValue={f.owner} className={filterInputCls}>
            <option value="">All</option>
            {staffOptions.map((s) => (
              <option key={s.user_id} value={s.user_id}>
                {staffPrimaryLabel(s)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[8rem] flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Follow-up
          <select name="followUp" defaultValue={followUpToday ? "today" : ""} className={filterInputCls}>
            <option value="">Any</option>
            <option value="today">Today (Central)</option>
          </select>
        </label>
        <label className="flex min-w-[8rem] flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Payer type
          <select name="payerType" defaultValue={f.payerType} className={filterInputCls}>
            <option value="">All</option>
            {PAYER_BROAD_CATEGORY_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[6rem] flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Discipline
          <select name="discipline" defaultValue={f.discipline} className={filterInputCls}>
            <option value="">All</option>
            {SERVICE_DISCIPLINE_CODES.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[12rem] flex-1 flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Search name / phone
          <input
            type="search"
            name="q"
            defaultValue={f.q}
            placeholder="Name or phone…"
            className={filterInputCls}
          />
        </label>
        <button
          type="submit"
          className="rounded-lg border border-sky-600 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-900 hover:bg-sky-100"
        >
          Apply
        </button>
        <Link
          href="/admin/crm/leads"
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Clear
        </Link>
      </form>

      <div className="overflow-x-auto rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[1200px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-xs font-semibold text-slate-600">
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Owner</th>
              <th className="min-w-[8rem] px-4 py-3">Next action</th>
              <th className="min-w-[9rem] px-4 py-3">Last contact</th>
              <th className="whitespace-nowrap px-4 py-3">Follow-up</th>
              <th className="px-4 py-3">Intake</th>
              <th className="px-4 py-3">Payer type</th>
              <th className="px-4 py-3">Payer</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Call / text</th>
              <th className="whitespace-nowrap px-4 py-3">Open</th>
              <th className="whitespace-nowrap px-4 py-3">Delete</th>
              <th className="px-4 py-3">Created</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={14} className="px-4 py-8 text-slate-500">
                  No leads match these filters.
                </td>
              </tr>
            ) : (
              list.map((r) => {
                const contact = normalizeContact(r.contacts);
                const phone = (contact?.primary_phone ?? "").trim();
                const owner = r.owner_user_id ? staffById.get(r.owner_user_id) : null;
                const cid = typeof r.contact_id === "string" ? r.contact_id.trim() : "";
                const dialE164 = pickOutboundE164ForDial(phone);
                const keypadHref = dialE164
                  ? buildWorkspaceKeypadCallHref({
                      dial: dialE164,
                      leadId: r.id,
                      contactId: cid,
                      contextName: contactDisplayName(contact),
                    })
                  : null;
                const smsHref =
                  cid && pickOutboundE164ForDial(phone)
                    ? buildWorkspaceSmsToContactHref({ contactId: cid, leadId: r.id })
                    : null;
                return (
                  <tr key={r.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3 text-xs text-slate-800">{formatLeadPipelineStatusLabel(r.status)}</td>
                    <td className="px-4 py-3 text-slate-700">{formatLeadSourceLabel(r.source)}</td>
                    <td className="max-w-[120px] truncate px-4 py-3 text-xs text-slate-600">
                      {owner ? staffPrimaryLabel(owner) : "—"}
                    </td>
                    <td className="max-w-[130px] px-4 py-3 text-xs text-slate-700">
                      {formatLeadNextActionLabel(r.next_action)}
                    </td>
                    <td className="max-w-[10rem] px-4 py-3 text-xs text-slate-700">
                      {formatLeadLastContactSummary(r.last_contact_at, r.last_outcome)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-700">
                      {formatFollowUpDate(r.follow_up_date)}
                    </td>
                    <td className="max-w-[90px] truncate px-4 py-3 text-slate-600">{r.intake_status ?? "—"}</td>
                    <td className="max-w-[100px] truncate px-4 py-3 text-xs text-slate-600">{r.payer_type ?? "—"}</td>
                    <td className="max-w-[120px] truncate px-4 py-3 text-slate-600">{trunc(r.payer_name, 28)}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/crm/leads/${r.id}`}
                        className="font-semibold text-sky-800 underline-offset-2 hover:underline"
                      >
                        {contactDisplayName(contact)}
                      </Link>
                      {phone ? (
                        <div className="mt-0.5 text-[11px] tabular-nums text-slate-600">{formatPhoneForDisplay(phone)}</div>
                      ) : null}
                      <div className="font-mono text-[10px] text-slate-400">{r.contact_id}</div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex flex-col gap-1">
                        {keypadHref ? (
                          <Link
                            href={keypadHref}
                            prefetch={false}
                            className="text-[11px] font-semibold text-emerald-800 underline-offset-2 hover:underline"
                          >
                            Call
                          </Link>
                        ) : (
                          <span className="text-[10px] text-slate-400">No phone</span>
                        )}
                        {smsHref ? (
                          <Link
                            href={smsHref}
                            prefetch={false}
                            className="text-[11px] font-semibold text-sky-800 underline-offset-2 hover:underline"
                          >
                            Text
                          </Link>
                        ) : (
                          <span className="text-[10px] text-slate-400">No SMS</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/crm/leads/${r.id}`}
                        className="text-[11px] font-semibold text-sky-800 underline-offset-2 hover:underline"
                      >
                        Detail
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 align-top">
                      <LeadDeleteButton leadId={r.id} variant="table" />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600">
                      {new Date(r.created_at).toLocaleString()}
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
