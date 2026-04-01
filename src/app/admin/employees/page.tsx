import Link from "next/link";
import { redirect } from "next/navigation";

import { supabase } from "@/lib/supabase";
import { getStaffProfile } from "@/lib/staff-profile";

type ApplicantRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  position: string | null;
  position_applied: string | null;
  status: string | null;
  created_at: string | null;
};

function employeeName(row: ApplicantRow): string {
  const full = `${row.first_name || ""} ${row.last_name || ""}`.trim();
  return full || "Unnamed";
}

function roleLabel(row: ApplicantRow): string {
  return row.position || row.position_applied || "—";
}

export default async function AdminEmployeesListPage() {
  const staff = await getStaffProfile();
  if (!staff) {
    redirect("/admin");
  }

  const { data: rows, error } = await supabase
    .from("applicants")
    .select("id, first_name, last_name, email, position, position_applied, status, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("[admin/employees] applicants query:", error.message);
  }

  const applicants = (rows || []) as ApplicantRow[];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">Admin</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Employees</h1>
            <p className="mt-2 max-w-xl text-sm text-slate-600">
              Open an employee record for compliance, forms, and file management. This list is a starting point; full
              dashboard filters remain on the main admin home.
            </p>
          </div>
          <Link
            href="/admin"
            className="inline-flex shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50"
          >
            Back to dashboard
          </Link>
        </div>

        <div className="overflow-hidden rounded-[24px] border border-indigo-100/80 bg-white shadow-sm">
          {applicants.length === 0 ? (
            <p className="p-8 text-sm text-slate-500">No employee records found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/90 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3 text-right">Open</th>
                  </tr>
                </thead>
                <tbody>
                  {applicants.map((row) => (
                    <tr key={row.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-3 font-medium text-slate-900">{employeeName(row)}</td>
                      <td className="px-4 py-3 text-slate-600">{roleLabel(row)}</td>
                      <td className="px-4 py-3 text-slate-600">{(row.status || "—").replace(/_/g, " ")}</td>
                      <td className="max-w-[200px] truncate px-4 py-3 text-slate-600">{row.email || "—"}</td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/admin/employees/${row.id}`}
                          className="inline-flex rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-900 transition hover:bg-indigo-100"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
