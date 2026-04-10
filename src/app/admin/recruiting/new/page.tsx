import Link from "next/link";
import { redirect } from "next/navigation";

import { crmFilterInputCls, crmPrimaryCtaCls } from "@/components/admin/crm-admin-list-styles";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  RECRUITING_DISCIPLINE_OPTIONS,
  RECRUITING_SOURCE_OPTIONS,
} from "@/lib/recruiting/recruiting-options";
import { supabaseAdmin } from "@/lib/admin";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";
import { staffPrimaryLabel } from "@/lib/crm/crm-leads-table-helpers";

import { createRecruitingCandidate } from "../actions";

export default async function NewRecruitingCandidatePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    redirect("/admin");
  }

  const sp = await searchParams;
  const errRaw = typeof sp.error === "string" ? sp.error : Array.isArray(sp.error) ? sp.error[0] : "";
  const error =
    errRaw === "missing_name"
      ? "Full name is required."
      : errRaw === "save_failed"
        ? "Could not save. Try again."
        : null;

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

  return (
    <div className="space-y-6 p-6">
      <AdminPageHeader
        eyebrow="Talent pipeline"
        title="New candidate"
        description="Create a profile for an Indeed applicant or inbound referral. You can log calls and texts from the candidate record."
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link
              href="/admin/recruiting/new-from-resume"
              className="inline-flex items-center justify-center rounded-[20px] border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-900 shadow-sm hover:bg-sky-100"
            >
              From resume
            </Link>
            <Link href="/admin/recruiting" className={crmPrimaryCtaCls}>
              Back to list
            </Link>
          </div>
        }
      />

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-900">
          {error}
        </div>
      ) : null}

      <form
        action={createRecruitingCandidate}
        className="space-y-6 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            Full name *
            <input name="full_name" required className={crmFilterInputCls} placeholder="Jane Doe" />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            Assigned to
            <select name="assigned_to" className={crmFilterInputCls} defaultValue="">
              <option value="">Unassigned</option>
              {staffOptions.map((s) => (
                <option key={s.user_id} value={s.user_id}>
                  {staffPrimaryLabel(s)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            First name
            <input name="first_name" className={crmFilterInputCls} />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            Last name
            <input name="last_name" className={crmFilterInputCls} />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            Phone
            <input name="phone" type="tel" className={crmFilterInputCls} placeholder="602…" />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            Email
            <input name="email" type="email" className={crmFilterInputCls} />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            City
            <input name="city" className={crmFilterInputCls} />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            State
            <input name="state" className={crmFilterInputCls} placeholder="AZ" />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            ZIP
            <input name="zip" className={crmFilterInputCls} />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            Coverage area
            <input name="coverage_area" className={crmFilterInputCls} placeholder="West Valley, Scottsdale…" />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            Discipline
            <select name="discipline" className={crmFilterInputCls} defaultValue="">
              <option value="">—</option>
              {RECRUITING_DISCIPLINE_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            Source
            <select name="source" className={crmFilterInputCls} defaultValue="Indeed">
              {RECRUITING_SOURCE_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="sm:col-span-2 flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            Indeed URL
            <input name="indeed_url" type="url" className={crmFilterInputCls} placeholder="https://…" />
          </label>
          <label className="sm:col-span-2 flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            Notes
            <textarea name="notes" rows={3} className={`${crmFilterInputCls} min-h-[5rem]`} />
          </label>
        </div>

        <div className="flex flex-wrap gap-3">
          <button type="submit" className={crmPrimaryCtaCls}>
            Create candidate
          </button>
          <Link
            href="/admin/recruiting"
            className="inline-flex items-center justify-center rounded-[20px] border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
