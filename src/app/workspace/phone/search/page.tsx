import { redirect } from "next/navigation";

import { GlobalSearchBar, GlobalSearchResultsSection } from "@/components/admin/GlobalSearchBar";
import { WorkspacePhonePageHeader } from "@/app/workspace/phone/_components/WorkspacePhonePageHeader";
import { canAccessGlobalSearch } from "@/lib/admin/global-search/access";
import { runGlobalSearch } from "@/lib/admin/global-search/run";
import { supabaseAdmin } from "@/lib/admin";
import { getStaffProfile } from "@/lib/staff-profile";

export const dynamic = "force-dynamic";

export default async function WorkspacePhoneSearchPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessGlobalSearch(staff)) {
    redirect("/workspace/phone");
  }

  const sp = searchParams ? await searchParams : {};
  const q =
    typeof sp.q === "string" ? sp.q : Array.isArray(sp.q) ? sp.q[0] ?? "" : "";

  const payload = q.trim() ? await runGlobalSearch(supabaseAdmin, q.trim(), 50) : null;

  return (
    <div className="ws-phone-page-shell flex flex-1 flex-col px-4 pb-6 pt-5 sm:px-5">
      <WorkspacePhonePageHeader
        title="Search caller"
        subtitle="Find leads, patients, prior calls, and source trails by name or phone number."
      />

      <div className="mt-4">
        <GlobalSearchBar initialQuery={q} variant="page" autoFocus />
      </div>

      {!q.trim() ? (
        <p className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-white/70 px-4 py-8 text-center text-sm text-slate-500">
          Enter a caller name or phone number to search across Saintly.
        </p>
      ) : payload && payload.results.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-600">
          No results for <span className="font-semibold text-slate-900">&ldquo;{payload.query}&rdquo;</span>.
        </p>
      ) : payload ? (
        <div className="mt-6 space-y-8">
          <GlobalSearchResultsSection title="Best matches" results={payload.groups.bestMatches} />
          <GlobalSearchResultsSection title="Leads" results={payload.groups.leads} />
          <GlobalSearchResultsSection title="Patients" results={payload.groups.patients} />
          <GlobalSearchResultsSection title="Calls & SMS" results={payload.groups.calls} />
          <GlobalSearchResultsSection title="Private pay" results={payload.groups.privatePay} />
          <GlobalSearchResultsSection title="Faxes, packets & other" results={payload.groups.other} />
        </div>
      ) : null}
    </div>
  );
}
