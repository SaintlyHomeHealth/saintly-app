import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { getStaffProfile, isManagerOrHigher, type StaffRole } from "@/lib/staff-profile";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/admin";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";

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

type PatientEmb = {
  id: string;
  patient_status: string;
  payer_name: string | null;
  physician_name: string | null;
  referring_provider_name: string | null;
  contacts: ContactEmb | ContactEmb[] | null;
};

type RosterRow = {
  id: string;
  role: string;
  discipline?: string | null;
  assigned_at: string;
  assigned_user_id: string | null;
  patients: PatientEmb | PatientEmb[] | null;
};

function normalizePatient(raw: PatientEmb | PatientEmb[] | null | undefined): PatientEmb | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw;
}

function normalizeContact(raw: ContactEmb | ContactEmb[] | null | undefined): ContactEmb | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return (raw[0] as ContactEmb) ?? null;
  return raw;
}

export default async function AdminCrmRosterPage() {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    redirect("/admin");
  }

  const supabase = await createServerSupabaseClient();

  const orgWideRoles = new Set<StaffRole>(["manager", "admin", "super_admin"]);
  const viewOrgWide = orgWideRoles.has(staff.role);

  let rosterQuery = supabase
    .from("patient_assignments")
    .select(
      "id, role, discipline, assigned_at, assigned_user_id, patients ( id, patient_status, payer_name, physician_name, referring_provider_name, contacts ( full_name, first_name, last_name, primary_phone ) )"
    )
    .eq("is_active", true)
    .order("assigned_at", { ascending: false });

  if (!viewOrgWide) {
    rosterQuery = rosterQuery.eq("assigned_user_id", staff.user_id);
  }

  const { data: rows, error } = await rosterQuery;

  const list = (rows ?? []) as unknown as RosterRow[];

  const userIds = [...new Set(list.map((r) => r.assigned_user_id).filter((x): x is string => Boolean(x)))];
  const nurseLabel: Record<string, string> = {};
  if (userIds.length > 0) {
    const { data: profs } = await supabaseAdmin
      .from("staff_profiles")
      .select("user_id, email")
      .in("user_id", userIds);
    for (const p of profs ?? []) {
      const uid = p.user_id as string;
      const em = (p.email as string | null)?.trim();
      nurseLabel[uid] = em || `${uid.slice(0, 8)}…`;
    }
  }

  return (
    <div className="space-y-6 p-6">
      <AdminPageHeader
        eyebrow="Team"
        title="Care team roster"
        description={
          <>
            {viewOrgWide
              ? "Active assignments — primary nurse, backup, intake, and clinical lines (newest first)."
              : "Your active patient assignments."}
            {error ? <span className="mt-2 block text-sm text-red-700">{error.message}</span> : null}
          </>
        }
      />

      <div className="overflow-x-auto rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[880px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-xs font-semibold text-slate-600">
              <th className="px-4 py-3">Patient</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Patient status</th>
              <th className="px-4 py-3">Payer</th>
              <th className="px-4 py-3">Referring</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Assigned to</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-slate-500">
                  No active assignments.
                </td>
              </tr>
            ) : (
              list.map((r) => {
                const p = normalizePatient(r.patients);
                const c = normalizeContact(p?.contacts ?? null);
                const phone = (c?.primary_phone ?? "").trim();
                return (
                  <tr key={r.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3 text-slate-800">{contactDisplayName(c)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs tabular-nums text-slate-600">
                      {phone ? formatPhoneForDisplay(phone) : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{p?.patient_status ?? "—"}</td>
                    <td className="max-w-[160px] truncate px-4 py-3 text-slate-600">{p?.payer_name ?? "—"}</td>
                    <td className="max-w-[160px] truncate px-4 py-3 text-slate-600">
                      {(p?.referring_provider_name ?? "").trim() || p?.physician_name || "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-700">
                      {r.role === "clinician" && (r.discipline ?? "").trim()
                        ? `clinician · ${String(r.discipline).trim()}`
                        : r.role}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700">
                      {r.assigned_user_id
                        ? nurseLabel[r.assigned_user_id] ?? r.assigned_user_id.slice(0, 8) + "…"
                        : "—"}
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
