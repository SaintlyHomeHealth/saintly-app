import Link from "next/link";

import { ADMIN_CRM_LEADS_LIST_PATH_PREFIX } from "@/lib/crm/admin-crm-leads-list-url";

export default function AdminCrmLeadDetailNotFound() {
  return (
    <div className="p-6">
      <div className="max-w-lg rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">Lead not found</h1>
        <p className="mt-2 text-sm text-slate-600">
          This lead may have been deleted, archived, or the link may be incorrect. Double-check the lead ID from the
          leads list.
        </p>
        <Link
          href={ADMIN_CRM_LEADS_LIST_PATH_PREFIX}
          className="mt-4 inline-flex rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-sky-800 shadow-sm hover:bg-slate-50"
        >
          Back to leads
        </Link>
      </div>
    </div>
  );
}
