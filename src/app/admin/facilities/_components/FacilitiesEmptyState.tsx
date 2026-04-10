import Link from "next/link";

import { crmPrimaryCtaCls } from "@/components/admin/crm-admin-list-styles";

/**
 * Friendly empty state when there are no facilities yet — keeps the CRM from feeling "dead."
 */
export function FacilitiesEmptyState() {
  return (
    <div className="rounded-[28px] border border-dashed border-sky-200/90 bg-gradient-to-br from-sky-50/50 via-white to-cyan-50/30 p-8 shadow-sm sm:p-10">
      <div className="mx-auto max-w-lg text-center">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sky-700">Referral sources</p>
        <h2 className="mt-3 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">Build your facilities pipeline</h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          Track hospitals, clinics, SNFs, and physician offices your reps visit. Add your first facility to capture
          contacts, visit notes, referral instructions, and follow-ups — all in one place for the field team.
        </p>
        <ul className="mt-6 space-y-2.5 text-left text-sm text-slate-700">
          <li className="flex gap-2">
            <span className="mt-0.5 font-semibold text-emerald-600">✓</span>
            <span>Log in-person visits, calls, and drops with outcomes in seconds on mobile.</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-0.5 font-semibold text-emerald-600">✓</span>
            <span>Keep decision-maker contacts and referral process notes next to the building record.</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-0.5 font-semibold text-emerald-600">✓</span>
            <span>Surface next follow-ups so outside sales never loses momentum.</span>
          </li>
        </ul>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/admin/facilities/new" className={crmPrimaryCtaCls}>
            + Add your first facility
          </Link>
          <Link
            href="/admin"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-sky-200 hover:bg-sky-50/50"
          >
            Back to Command Center
          </Link>
        </div>
      </div>
    </div>
  );
}
