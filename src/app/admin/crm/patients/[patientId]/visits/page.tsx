import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { createPatientVisit, setPatientVisitStatus } from "../../../actions";
import { formatAppDateTime } from "@/lib/datetime/app-timezone";
import { supabaseAdmin } from "@/lib/admin";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type VisitRow = {
  id: string;
  patient_id: string;
  assigned_user_id: string | null;
  scheduled_for: string | null;
  status: string;
  en_route_at: string | null;
  arrived_at: string | null;
  completed_at: string | null;
  arrived_lat: number | null;
  arrived_lng: number | null;
  completed_lat: number | null;
  completed_lng: number | null;
  created_at: string;
};

function fmtWhen(iso: string | null): string {
  if (!iso) return "—";
  return formatAppDateTime(iso, iso, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

const btnPrimary =
  "rounded border border-sky-600 bg-sky-50 px-2 py-1 text-[11px] font-semibold text-sky-900 hover:bg-sky-100";
const btnGreen =
  "rounded border border-emerald-600 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-900 hover:bg-emerald-100";
const btnMuted = "rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-100";
const selectCls =
  "max-w-[14rem] rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-800";

export default async function PatientVisitsPage({
  params,
  searchParams,
}: {
  params: Promise<{ patientId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    redirect("/admin");
  }

  const sp = searchParams ? await searchParams : {};
  const smsFlash = typeof sp.sms === "string" ? sp.sms : Array.isArray(sp.sms) ? sp.sms[0] : undefined;
  const smsErrRaw = typeof sp.smsErr === "string" ? sp.smsErr : Array.isArray(sp.smsErr) ? sp.smsErr[0] : undefined;
  const visitDupRaw = sp.visitDup;
  const visitDupFlash =
    visitDupRaw === "1" || (Array.isArray(visitDupRaw) && visitDupRaw[0] === "1");

  const { patientId } = await params;
  if (!patientId) {
    notFound();
  }

  const supabase = await createServerSupabaseClient();

  const { data: patient, error: pErr } = await supabase
    .from("patients")
    .select("id, contact_id, patient_status, contacts ( full_name, first_name, last_name )")
    .eq("id", patientId)
    .maybeSingle();

  if (pErr || !patient?.id) {
    notFound();
  }

  const contactRaw = patient.contacts as
    | { full_name?: string | null; first_name?: string | null; last_name?: string | null }
    | { full_name?: string | null; first_name?: string | null; last_name?: string | null }[]
    | null;
  const c = Array.isArray(contactRaw) ? contactRaw[0] : contactRaw;
  const name =
    (c?.full_name ?? "").trim() ||
    [c?.first_name, c?.last_name].filter(Boolean).join(" ").trim() ||
    "Patient";

  const { data: visitRows, error: vErr } = await supabase
    .from("patient_visits")
    .select(
      "id, patient_id, assigned_user_id, scheduled_for, status, en_route_at, arrived_at, completed_at, arrived_lat, arrived_lng, completed_lat, completed_lng, created_at"
    )
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false });

  const visits = (visitRows ?? []) as VisitRow[];

  const { data: staffRows } = await supabaseAdmin
    .from("staff_profiles")
    .select("user_id, email, role")
    .order("email", { ascending: true });

  const staffOptions = (staffRows ?? []) as { user_id: string; email: string | null; role: string }[];
  const emailByUserId: Record<string, string> = {};
  for (const o of staffOptions) {
    emailByUserId[o.user_id] = o.email?.trim() || `${o.user_id.slice(0, 8)}…`;
  }

  return (
    <div className="space-y-6 p-6">
      <AdminPageHeader
        eyebrow="Patients"
        title={`Visits · ${name}`}
        description={
          <>
            Patient status: {patient.patient_status ?? "—"} ·{" "}
            <Link href={`/admin/crm/patients/${patientId}`} className="font-semibold text-sky-800 hover:underline">
              Intake profile
            </Link>
            {" · "}
            <Link href="/admin/crm/patients" className="font-semibold text-sky-800 hover:underline">
              All patients
            </Link>
            {smsFlash === "sent" ? (
              <span className="mt-3 block rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                SMS sent.
              </span>
            ) : null}
            {smsFlash === "failed" ? (
              <span className="mt-3 block rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                SMS failed{smsErrRaw ? `: ${smsErrRaw}` : "."}
              </span>
            ) : null}
            {smsFlash === "skipped" ? (
              <span className="mt-3 block rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                Visit marked en route (SMS not sent — choose “Send SMS” to text the patient).
              </span>
            ) : null}
            {visitDupFlash ? (
              <span className="mt-3 block rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
                A visit already exists for this patient at the same scheduled time and assignment. Nothing new was created.
              </span>
            ) : null}
            {vErr ? <span className="mt-2 block text-sm text-red-700">{vErr.message}</span> : null}
          </>
        }
      />

      <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">New visit</h2>
        <form action={createPatientVisit} className="mt-3 flex flex-wrap items-end gap-2">
          <input type="hidden" name="patientId" value={patientId} />
          <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
            Scheduled for (optional)
            <input
              type="datetime-local"
              name="scheduledFor"
              className="rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-800"
            />
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
            Assigned staff (optional)
            <select name="assignedUserId" className={selectCls} defaultValue="">
              <option value="">—</option>
              {staffOptions.map((s) => (
                <option key={s.user_id} value={s.user_id}>
                  {(s.email?.trim() || s.user_id.slice(0, 8) + "…") + ` (${s.role})`}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className={btnPrimary}>
            Create visit
          </button>
        </form>
      </div>

      <div className="overflow-x-auto rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-xs font-semibold text-slate-600">
              <th className="px-4 py-3">Scheduled</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Assigned</th>
              <th className="px-4 py-3">Execution</th>
              <th className="min-w-[280px] px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visits.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-slate-500">
                  No visits yet.
                </td>
              </tr>
            ) : (
              visits.map((v) => {
                const st = v.status;
                const assignee = v.assigned_user_id ? emailByUserId[v.assigned_user_id] ?? v.assigned_user_id.slice(0, 8) + "…" : "—";
                return (
                  <tr key={v.id} className="border-b border-slate-100 last:border-0">
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">{fmtWhen(v.scheduled_for)}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{st}</td>
                    <td className="max-w-[200px] truncate px-4 py-3 text-xs text-slate-600">{assignee}</td>
                    <td className="px-4 py-3 text-[11px] text-slate-600">
                      <div className="space-y-0.5">
                        {v.en_route_at ? <p>En route {fmtWhen(v.en_route_at)}</p> : null}
                        {v.arrived_at ? <p>Arrived {fmtWhen(v.arrived_at)}</p> : null}
                        {v.completed_at ? <p>Completed {fmtWhen(v.completed_at)}</p> : null}
                        {(v.arrived_lat != null && v.arrived_lng != null) ||
                        (v.completed_lat != null && v.completed_lng != null) ? (
                          <p>Location captured</p>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex flex-wrap gap-1">
                        {st === "scheduled" ? (
                          <>
                            <form action={setPatientVisitStatus} className="flex flex-wrap items-center gap-1">
                              <input type="hidden" name="visitId" value={v.id} />
                              <input type="hidden" name="nextStatus" value="en_route" />
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
                              <input type="hidden" name="visitId" value={v.id} />
                              <input type="hidden" name="nextStatus" value="canceled" />
                              <button type="submit" className={btnMuted}>
                                Cancel
                              </button>
                            </form>
                          </>
                        ) : null}
                        {st === "en_route" ? (
                          <>
                            <form action={setPatientVisitStatus}>
                              <input type="hidden" name="visitId" value={v.id} />
                              <input type="hidden" name="nextStatus" value="arrived" />
                              <button type="submit" className={btnGreen}>
                                Arrived
                              </button>
                            </form>
                            <form action={setPatientVisitStatus}>
                              <input type="hidden" name="visitId" value={v.id} />
                              <input type="hidden" name="nextStatus" value="canceled" />
                              <button type="submit" className={btnMuted}>
                                Cancel
                              </button>
                            </form>
                          </>
                        ) : null}
                        {st === "arrived" ? (
                          <>
                            <form action={setPatientVisitStatus}>
                              <input type="hidden" name="visitId" value={v.id} />
                              <input type="hidden" name="nextStatus" value="completed" />
                              <button type="submit" className={btnGreen}>
                                Completed
                              </button>
                            </form>
                            <form action={setPatientVisitStatus}>
                              <input type="hidden" name="visitId" value={v.id} />
                              <input type="hidden" name="nextStatus" value="canceled" />
                              <button type="submit" className={btnMuted}>
                                Cancel
                              </button>
                            </form>
                          </>
                        ) : null}
                        {(st === "completed" || st === "canceled") && (
                          <span className="text-[11px] text-slate-400">—</span>
                        )}
                      </div>
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
