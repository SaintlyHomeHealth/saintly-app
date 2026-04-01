import Link from "next/link";
import { redirect } from "next/navigation";

import { setPatientVisitStatus } from "../actions";
import { supabaseAdmin } from "@/lib/admin";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type ContactEmb = {
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  primary_phone?: string | null;
};

type VisitRow = {
  id: string;
  patient_id: string;
  assigned_user_id: string | null;
  scheduled_for: string | null;
  status: string;
  created_at: string;
  patients:
    | {
        id: string;
        contact_id: string;
        contacts: ContactEmb | ContactEmb[] | null;
      }
    | {
        id: string;
        contact_id: string;
        contacts: ContactEmb | ContactEmb[] | null;
      }[]
    | null;
};

const STATUS_ORDER = ["scheduled", "en_route", "arrived", "completed", "canceled"] as const;

function contactName(c: ContactEmb | null): string {
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

function normalizePatientEmb(raw: VisitRow["patients"]): {
  id: string;
  contact_id: string;
  contacts: ContactEmb | null;
} | null {
  if (!raw) return null;
  const p = Array.isArray(raw) ? raw[0] : raw;
  if (!p?.id) return null;
  return {
    id: p.id,
    contact_id: p.contact_id,
    contacts: normalizeContact(p.contacts ?? null),
  };
}

function fmtWhen(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const btnPrimary =
  "rounded border border-sky-600 bg-sky-50 px-2 py-1 text-[11px] font-semibold text-sky-900 hover:bg-sky-100";
const btnGreen =
  "rounded border border-emerald-600 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-900 hover:bg-emerald-100";
const btnMuted = "rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-100";
const selectCls =
  "max-w-[9rem] rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-800";

const RETURN_DISPATCH = "/admin/crm/dispatch";

function VisitActions({ visitId, status }: { visitId: string; status: string }) {
  const st = status;
  return (
    <div className="flex flex-wrap gap-1">
      {st === "scheduled" ? (
        <>
          <form action={setPatientVisitStatus} className="flex flex-wrap items-center gap-1">
            <input type="hidden" name="visitId" value={visitId} />
            <input type="hidden" name="nextStatus" value="en_route" />
            <input type="hidden" name="returnTo" value={RETURN_DISPATCH} />
            <label className="flex items-center gap-1 text-[10px] text-slate-600">
              SMS
              <select name="sendSms" className={selectCls} defaultValue="">
                <option value="">No</option>
                <option value="1">Send SMS</option>
              </select>
            </label>
            <button type="submit" className={btnPrimary}>
              En route
            </button>
          </form>
          <form action={setPatientVisitStatus}>
            <input type="hidden" name="visitId" value={visitId} />
            <input type="hidden" name="nextStatus" value="canceled" />
            <input type="hidden" name="returnTo" value={RETURN_DISPATCH} />
            <button type="submit" className={btnMuted}>
              Cancel
            </button>
          </form>
        </>
      ) : null}
      {st === "en_route" ? (
        <>
          <form action={setPatientVisitStatus}>
            <input type="hidden" name="visitId" value={visitId} />
            <input type="hidden" name="nextStatus" value="arrived" />
            <input type="hidden" name="returnTo" value={RETURN_DISPATCH} />
            <button type="submit" className={btnGreen}>
              Arrived
            </button>
          </form>
          <form action={setPatientVisitStatus}>
            <input type="hidden" name="visitId" value={visitId} />
            <input type="hidden" name="nextStatus" value="canceled" />
            <input type="hidden" name="returnTo" value={RETURN_DISPATCH} />
            <button type="submit" className={btnMuted}>
              Cancel
            </button>
          </form>
        </>
      ) : null}
      {st === "arrived" ? (
        <>
          <form action={setPatientVisitStatus}>
            <input type="hidden" name="visitId" value={visitId} />
            <input type="hidden" name="nextStatus" value="completed" />
            <input type="hidden" name="returnTo" value={RETURN_DISPATCH} />
            <button type="submit" className={btnGreen}>
              Completed
            </button>
          </form>
          <form action={setPatientVisitStatus}>
            <input type="hidden" name="visitId" value={visitId} />
            <input type="hidden" name="nextStatus" value="canceled" />
            <input type="hidden" name="returnTo" value={RETURN_DISPATCH} />
            <button type="submit" className={btnMuted}>
              Cancel
            </button>
          </form>
        </>
      ) : null}
      {(st === "completed" || st === "canceled") && <span className="text-[11px] text-slate-400">—</span>}
    </div>
  );
}

export default async function DispatchPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    redirect("/admin");
  }

  const sp = searchParams ? await searchParams : {};
  const smsFlash = typeof sp.sms === "string" ? sp.sms : Array.isArray(sp.sms) ? sp.sms[0] : undefined;
  const smsErrRaw = typeof sp.smsErr === "string" ? sp.smsErr : Array.isArray(sp.smsErr) ? sp.smsErr[0] : undefined;

  const supabase = await createServerSupabaseClient();

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  const selectVisits = `
    id,
    patient_id,
    assigned_user_id,
    scheduled_for,
    status,
    created_at,
    patients (
      id,
      contact_id,
      contacts ( full_name, first_name, last_name, primary_phone )
    )
  `;

  const [{ data: timedRows, error: e1 }, { data: openNullRows, error: e2 }] = await Promise.all([
    supabase
      .from("patient_visits")
      .select(selectVisits)
      .gte("scheduled_for", startIso)
      .lt("scheduled_for", endIso),
    supabase
      .from("patient_visits")
      .select(selectVisits)
      .is("scheduled_for", null)
      .in("status", ["scheduled", "en_route", "arrived"])
      .gte("created_at", startIso)
      .lt("created_at", endIso),
  ]);

  const errMsg = e1?.message ?? e2?.message;
  const byId = new Map<string, VisitRow>();
  for (const r of (timedRows ?? []) as VisitRow[]) {
    byId.set(r.id, r);
  }
  for (const r of (openNullRows ?? []) as VisitRow[]) {
    byId.set(r.id, r);
  }

  const merged = [...byId.values()].sort((a, b) => {
    const ta = a.scheduled_for ? new Date(a.scheduled_for).getTime() : Number.POSITIVE_INFINITY;
    const tb = b.scheduled_for ? new Date(b.scheduled_for).getTime() : Number.POSITIVE_INFINITY;
    if (ta !== tb) return ta - tb;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const assigneeIds = [...new Set(merged.map((v) => v.assigned_user_id).filter((x): x is string => Boolean(x)))];
  const emailByUserId: Record<string, string> = {};
  if (assigneeIds.length > 0) {
    const { data: profs } = await supabaseAdmin.from("staff_profiles").select("user_id, email").in("user_id", assigneeIds);
    for (const p of profs ?? []) {
      const uid = p.user_id as string;
      emailByUserId[uid] = (p.email as string | null)?.trim() || `${uid.slice(0, 8)}…`;
    }
  }

  const buckets: Record<string, VisitRow[]> = {};
  for (const s of STATUS_ORDER) {
    buckets[s] = [];
  }
  for (const v of merged) {
    const st = v.status;
    if (buckets[st]) {
      buckets[st].push(v);
    }
  }

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
        <span className="text-slate-900">Dispatch</span>
        <span className="text-slate-300">|</span>
        <Link href="/admin/crm/roster" className="underline-offset-2 hover:underline">
          Roster
        </Link>
      </nav>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Operations</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">Today&apos;s visits</h1>
        <p className="mt-1 text-sm text-slate-600">Scheduled for today (local), plus unscheduled visits created today.</p>
        {smsFlash === "sent" ? (
          <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">SMS sent.</p>
        ) : null}
        {smsFlash === "failed" ? (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            SMS failed{smsErrRaw ? `: ${smsErrRaw}` : "."}
          </p>
        ) : null}
        {smsFlash === "skipped" ? (
          <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            Visit marked en route (SMS not sent — choose “Send SMS” to text the patient).
          </p>
        ) : null}
        {errMsg ? <p className="mt-2 text-sm text-red-700">{errMsg}</p> : null}
      </div>

      {STATUS_ORDER.map((statusKey) => {
        const rows = buckets[statusKey] ?? [];
        return (
          <div key={statusKey} className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
              <h2 className="text-sm font-semibold capitalize text-slate-900">{statusKey.replace("_", " ")}</h2>
              <p className="text-xs text-slate-500">{rows.length} visit{rows.length === 1 ? "" : "s"}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs font-semibold text-slate-600">
                    <th className="px-4 py-2">Patient</th>
                    <th className="px-4 py-2">Phone</th>
                    <th className="px-4 py-2">Nurse</th>
                    <th className="px-4 py-2">Scheduled</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="min-w-[240px] px-4 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-slate-500">
                        None.
                      </td>
                    </tr>
                  ) : (
                    rows.map((v) => {
                      const p = normalizePatientEmb(v.patients);
                      const c = p?.contacts ?? null;
                      const phone = (c?.primary_phone ?? "").trim();
                      const nurse = v.assigned_user_id
                        ? emailByUserId[v.assigned_user_id] ?? v.assigned_user_id.slice(0, 8) + "…"
                        : "—";
                      return (
                        <tr key={v.id} className="border-b border-slate-100 last:border-0">
                          <td className="px-4 py-2">
                            <div className="font-medium text-slate-900">{contactName(c)}</div>
                            <Link
                              href={`/admin/crm/patients/${v.patient_id}/visits`}
                              className="text-[10px] font-semibold text-sky-700 hover:underline"
                            >
                              Patient visits
                            </Link>
                          </td>
                          <td className="whitespace-nowrap px-4 py-2 text-xs tabular-nums text-slate-600">
                            {phone ? formatPhoneForDisplay(phone) : "—"}
                          </td>
                          <td className="max-w-[160px] truncate px-4 py-2 text-xs text-slate-700">{nurse}</td>
                          <td className="whitespace-nowrap px-4 py-2 text-slate-700">{fmtWhen(v.scheduled_for)}</td>
                          <td className="px-4 py-2 text-slate-800">{v.status}</td>
                          <td className="px-4 py-2 align-top">
                            <VisitActions visitId={v.id} status={v.status} />
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
      })}
    </div>
  );
}
