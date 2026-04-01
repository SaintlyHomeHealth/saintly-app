import Link from "next/link";
import { redirect } from "next/navigation";

import { PatientSmsForm } from "./patient-sms-form";
import { updateCrmPatientStatus } from "../actions";
import { PAYER_BROAD_CATEGORY_OPTIONS } from "@/lib/crm/payer-type-options";
import { SERVICE_DISCIPLINE_CODES } from "@/lib/crm/service-disciplines";
import { supabaseAdmin } from "@/lib/admin";
import { formatPhoneForDisplay, normalizePhone } from "@/lib/phone/us-phone-format";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";
import { createServerSupabaseClient } from "@/lib/supabase/server";

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

type AssignmentRow = {
  id: string;
  assigned_user_id: string | null;
  role: string;
  is_active: boolean;
  discipline?: string | null;
  is_primary?: boolean | null;
};

type PatientRow = {
  id: string;
  contact_id: string;
  patient_status: string;
  start_of_care: string | null;
  payer_name: string | null;
  payer_type: string | null;
  physician_name: string | null;
  referring_provider_name: string | null;
  intake_status: string | null;
  referral_source: string | null;
  service_type: string | null;
  service_disciplines: string[] | null;
  created_at: string;
  contacts: ContactEmb | ContactEmb[] | null;
  patient_assignments: AssignmentRow[] | null;
};

function normalizeContact(raw: PatientRow["contacts"]): ContactEmb | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return (raw[0] as ContactEmb) ?? null;
  return raw as ContactEmb;
}

function normalizeAssignments(raw: PatientRow["patient_assignments"]): AssignmentRow[] {
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw as AssignmentRow];
}

function activePrimaryNurse(assignments: AssignmentRow[]): string | null {
  for (const a of assignments) {
    if (a.is_active && a.role === "primary_nurse" && a.assigned_user_id) {
      return a.assigned_user_id;
    }
  }
  return null;
}

function displayServiceLines(r: PatientRow): string {
  const arr = Array.isArray(r.service_disciplines)
    ? r.service_disciplines.filter((x): x is string => typeof x === "string" && x.trim() !== "")
    : [];
  if (arr.length > 0) return arr.join(", ");
  const legacy = (r.service_type ?? "").trim();
  return legacy || "—";
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

function matchesDisciplineFilter(r: PatientRow, disc: string): boolean {
  if (!disc) return true;
  const sd = Array.isArray(r.service_disciplines) ? r.service_disciplines : [];
  if (sd.includes(disc)) return true;
  const assigns = normalizeAssignments(r.patient_assignments);
  return assigns.some((a) => a.is_active && a.role === "clinician" && (a.discipline ?? "") === disc);
}

function matchesSearch(r: PatientRow, contact: ContactEmb | null, q: string): boolean {
  if (!q.trim()) return true;
  const n = contactDisplayName(contact).toLowerCase();
  const phone = (contact?.primary_phone ?? "").toLowerCase();
  const needle = q.trim().toLowerCase();
  const phoneDigits = normalizePhone(contact?.primary_phone ?? "");
  const needleDigits = normalizePhone(q);
  if (needleDigits && phoneDigits.includes(needleDigits)) return true;
  return n.includes(needle) || phone.includes(needle);
}

function buildFilterQueryString(sp: {
  status?: string;
  assignedTo?: string;
  discipline?: string;
  payerType?: string;
  primaryNurse?: string;
  q?: string;
}): string {
  const u = new URLSearchParams();
  if (sp.status) u.set("status", sp.status);
  if (sp.assignedTo) u.set("assignedTo", sp.assignedTo);
  if (sp.discipline) u.set("discipline", sp.discipline);
  if (sp.payerType) u.set("payerType", sp.payerType);
  if (sp.primaryNurse) u.set("primaryNurse", sp.primaryNurse);
  if (sp.q) u.set("q", sp.q);
  return u.toString();
}

function intersectIds(a: string[] | null, b: string[]): string[] {
  if (a === null) return b;
  const set = new Set(a);
  return b.filter((x) => set.has(x));
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const EMPTY_SENTINEL = "00000000-0000-0000-0000-000000000000";

export default async function AdminCrmPatientsPage({
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
    assignedTo: one("assignedTo").trim(),
    discipline: one("discipline").trim(),
    payerType: one("payerType").trim(),
    primaryNurse: one("primaryNurse").trim(),
    q: one("q").trim(),
  };

  const returnTo = buildFilterQueryString(f);

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

  let combinedPatientIds: string[] | null = null;

  if (f.assignedTo === "me") {
    const { data: asn } = await supabaseAdmin
      .from("patient_assignments")
      .select("patient_id")
      .eq("assigned_user_id", staff.user_id)
      .eq("is_active", true);
    combinedPatientIds = [...new Set((asn ?? []).map((x) => String(x.patient_id)).filter(Boolean))];
  } else if (UUID_RE.test(f.assignedTo)) {
    const { data: asn } = await supabaseAdmin
      .from("patient_assignments")
      .select("patient_id")
      .eq("assigned_user_id", f.assignedTo)
      .eq("is_active", true);
    combinedPatientIds = [...new Set((asn ?? []).map((x) => String(x.patient_id)).filter(Boolean))];
  }

  if (UUID_RE.test(f.primaryNurse)) {
    const { data: asn } = await supabaseAdmin
      .from("patient_assignments")
      .select("patient_id")
      .eq("assigned_user_id", f.primaryNurse)
      .eq("role", "primary_nurse")
      .eq("is_active", true);
    const primaryIds = [...new Set((asn ?? []).map((x) => String(x.patient_id)).filter(Boolean))];
    combinedPatientIds = intersectIds(combinedPatientIds, primaryIds);
  }

  const supabase = await createServerSupabaseClient();
  let query = supabase.from("patients").select(
    "id, contact_id, patient_status, start_of_care, payer_name, payer_type, physician_name, referring_provider_name, intake_status, referral_source, service_type, service_disciplines, created_at, contacts ( full_name, first_name, last_name, primary_phone ), patient_assignments ( id, assigned_user_id, role, is_active, discipline, is_primary )"
  );

  if (f.status && ["active", "inactive", "discharged", "pending"].includes(f.status)) {
    query = query.eq("patient_status", f.status);
  }

  if (f.payerType && PAYER_BROAD_CATEGORY_OPTIONS.includes(f.payerType as (typeof PAYER_BROAD_CATEGORY_OPTIONS)[number])) {
    query = query.eq("payer_type", f.payerType);
  }

  if (combinedPatientIds !== null) {
    if (combinedPatientIds.length === 0) {
      query = query.eq("id", EMPTY_SENTINEL);
    } else {
      query = query.in("id", combinedPatientIds);
    }
  }

  const { data: rows, error } = await query.order("created_at", { ascending: false }).limit(500);

  let list = (rows ?? []) as PatientRow[];

  if (f.assignedTo === "unassigned") {
    const { data: asn } = await supabaseAdmin
      .from("patient_assignments")
      .select("patient_id")
      .eq("role", "primary_nurse")
      .eq("is_active", true);
    const withPrimary = new Set((asn ?? []).map((x) => String(x.patient_id)).filter(Boolean));
    list = list.filter((r) => !withPrimary.has(r.id));
  }

  if (f.discipline && SERVICE_DISCIPLINE_CODES.includes(f.discipline as (typeof SERVICE_DISCIPLINE_CODES)[number])) {
    list = list.filter((r) => matchesDisciplineFilter(r, f.discipline));
  }

  if (f.q.trim()) {
    list = list.filter((r) => matchesSearch(r, normalizeContact(r.contacts), f.q));
  }

  list = list.slice(0, 100);

  const primaryUserIds = [
    ...new Set(
      list
        .map((r) => activePrimaryNurse(normalizeAssignments(r.patient_assignments)))
        .filter((x): x is string => Boolean(x))
    ),
  ];

  const clinicianUserIds = [
    ...new Set(
      list.flatMap((r) =>
        normalizeAssignments(r.patient_assignments)
          .filter((a) => a.is_active && a.role === "clinician" && a.assigned_user_id)
          .map((a) => a.assigned_user_id as string)
      )
    ),
  ];

  const allStaffIds = [...new Set([...primaryUserIds, ...clinicianUserIds])];

  const emailByUserId: Record<string, string> = {};
  const displayByUserId: Record<string, string> = {};
  for (const o of staffOptions) {
    const em = o.email?.trim();
    emailByUserId[o.user_id] = em || `${o.user_id.slice(0, 8)}…`;
    displayByUserId[o.user_id] = staffPrimaryLabel(o);
  }
  for (const uid of allStaffIds) {
    if (!emailByUserId[uid]) {
      emailByUserId[uid] = uid.slice(0, 8) + "…";
    }
    if (!displayByUserId[uid]) {
      displayByUserId[uid] = emailByUserId[uid] ?? uid.slice(0, 8) + "…";
    }
  }

  const filterInputCls =
    "rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 shadow-sm";
  const addPatientCls =
    "inline-flex shrink-0 items-center justify-center rounded-[20px] bg-gradient-to-r from-sky-600 to-cyan-500 px-3 py-2 text-center text-xs font-semibold text-white shadow-sm shadow-sky-200/60 transition hover:-translate-y-px hover:shadow-md hover:shadow-sky-200/80 sm:text-sm";

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
        <span className="text-slate-900">Patients</span>
        <span className="text-slate-300">|</span>
        <Link href="/admin/crm/dispatch" className="underline-offset-2 hover:underline">
          Dispatch
        </Link>
        <span className="text-slate-300">|</span>
        <Link href="/admin/crm/roster" className="underline-offset-2 hover:underline">
          Roster
        </Link>
      </nav>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">CRM · Patients</h1>
          <p className="mt-1 text-sm text-slate-600">
            Overview (up to 100 rows after filters). Use filters to narrow; open a patient to manage assignments.
          </p>
          {error ? <p className="mt-2 text-sm text-red-700">{error.message}</p> : null}
        </div>
        <Link
          href="/admin/crm/patients/new"
          className={addPatientCls}
          title="Add or convert a patient."
        >
          + Add patient
        </Link>
      </div>

      <form
        method="get"
        action="/admin/crm/patients"
        className="flex flex-wrap items-end gap-2 rounded-[20px] border border-slate-200 bg-slate-50/80 p-4 shadow-sm"
      >
        <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Status
          <select name="status" defaultValue={f.status} className={filterInputCls}>
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="pending">Pending</option>
            <option value="discharged">Discharged</option>
          </select>
        </label>
        <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Assigned to
          <select name="assignedTo" defaultValue={f.assignedTo} className={`${filterInputCls} min-w-[11rem]`}>
            <option value="">All patients</option>
            <option value="me">My patients</option>
            <option value="unassigned">Unassigned (no primary nurse)</option>
            <optgroup label="Staff member">
              {staffOptions.map((s) => (
                <option key={s.user_id} value={s.user_id}>
                  {staffPrimaryLabel(s)}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Discipline
          <select name="discipline" defaultValue={f.discipline} className={filterInputCls}>
            <option value="">Any</option>
            {SERVICE_DISCIPLINE_CODES.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Payer type
          <select name="payerType" defaultValue={f.payerType} className={`${filterInputCls} min-w-[9rem]`}>
            <option value="">Any</option>
            {PAYER_BROAD_CATEGORY_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Primary nurse
          <select name="primaryNurse" defaultValue={f.primaryNurse} className={`${filterInputCls} min-w-[11rem]`}>
            <option value="">Any</option>
            {staffOptions.map((s) => (
              <option key={`pn-${s.user_id}`} value={s.user_id}>
                {staffPrimaryLabel(s)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[10rem] flex-col gap-0.5 text-[11px] font-medium text-slate-600">
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
          href="/admin/crm/patients"
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Clear
        </Link>
      </form>

      <div className="overflow-x-auto rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-xs font-semibold text-slate-600">
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Start of care</th>
              <th className="px-4 py-3">Services</th>
              <th className="px-4 py-3">Payer</th>
              <th className="px-4 py-3">Payer type</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Primary nurse</th>
              <th className="min-w-[180px] px-4 py-3">Clinicians</th>
              <th className="whitespace-nowrap px-4 py-3">Actions</th>
              <th className="min-w-[180px] px-4 py-3">SMS</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-slate-500">
                  No patients match these filters.
                </td>
              </tr>
            ) : (
              list.map((r) => {
                const contact = normalizeContact(r.contacts);
                const assigns = normalizeAssignments(r.patient_assignments);
                const primaryUid = activePrimaryNurse(assigns);
                const hasPhone = Boolean((contact?.primary_phone ?? "").trim());
                const clinicians = assigns.filter((a) => a.is_active && a.role === "clinician" && a.assigned_user_id);

                return (
                  <tr key={r.id} className="border-b border-slate-100 last:border-0">
                    <td className="align-top px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <span className="capitalize text-slate-800">{r.patient_status}</span>
                        <form action={updateCrmPatientStatus} className="flex flex-wrap items-center gap-1">
                          <input type="hidden" name="patientId" value={r.id} />
                          <input type="hidden" name="returnTo" value={returnTo} />
                          <select
                            name="patient_status"
                            defaultValue={r.patient_status}
                            className="max-w-[9rem] rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-800"
                          >
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                            <option value="pending">Pending</option>
                            <option value="discharged">Discharged</option>
                          </select>
                          <button
                            type="submit"
                            className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-700 hover:bg-slate-50"
                          >
                            Set
                          </button>
                        </form>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{r.start_of_care ?? "—"}</td>
                    <td className="max-w-[140px] px-4 py-3 text-xs text-slate-700" title={displayServiceLines(r)}>
                      {displayServiceLines(r)}
                    </td>
                    <td className="max-w-[160px] truncate px-4 py-3 text-slate-600">{r.payer_name ?? "—"}</td>
                    <td className="max-w-[120px] truncate px-4 py-3 text-slate-600">{r.payer_type ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-800">
                      <div className="text-sm">{contactDisplayName(contact)}</div>
                      {(contact?.primary_phone ?? "").trim() ? (
                        <div className="mt-0.5 text-[11px] tabular-nums text-slate-600">
                          {formatPhoneForDisplay(contact?.primary_phone ?? "")}
                        </div>
                      ) : null}
                      <div className="font-mono text-[10px] text-slate-400">{r.contact_id}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700">
                      {primaryUid ? (
                        <div>
                          <div className="text-sm text-slate-800">{displayByUserId[primaryUid] ?? emailByUserId[primaryUid]}</div>
                          <div className="mt-0.5 text-[10px] text-slate-400">
                            {(emailByUserId[primaryUid] ?? "").trim() || "—"}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="max-w-[280px] px-4 py-3 align-top text-xs leading-snug text-slate-700">
                      {clinicians.length === 0 ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        <span title={clinicians.map((a) => emailByUserId[a.assigned_user_id as string] ?? "").join(" · ")}>
                          {clinicians
                            .map((a) => {
                              const uid = a.assigned_user_id as string;
                              const name = displayByUserId[uid] ?? emailByUserId[uid] ?? uid.slice(0, 8);
                              const disc = (a.discipline ?? "").trim();
                              const prim = a.is_primary === true;
                              const base = disc ? `${name} (${disc})` : name;
                              return prim ? `${base}*` : base;
                            })
                            .join(", ")}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 align-top">
                      <div className="flex flex-col gap-1.5">
                        <Link
                          href={`/admin/crm/patients/${r.id}`}
                          className="text-xs font-semibold text-sky-800 underline-offset-2 hover:underline"
                        >
                          Manage
                        </Link>
                        <Link
                          href={`/admin/crm/patients/${r.id}/visits`}
                          className="text-[11px] font-medium text-slate-600 underline-offset-2 hover:underline"
                        >
                          Visits
                        </Link>
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <PatientSmsForm patientId={r.id} disabled={!hasPhone} />
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
