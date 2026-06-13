import { redirect } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { GlobalSearchBar, GlobalSearchResultsSection } from "@/components/admin/GlobalSearchBar";
import { canAccessGlobalSearch } from "@/lib/admin/global-search/access";
import { runGlobalSearch } from "@/lib/admin/global-search/run";
import { supabaseAdmin } from "@/lib/admin";
import { getStaffProfile } from "@/lib/staff-profile";

export const dynamic = "force-dynamic";

export default async function AdminGlobalSearchPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessGlobalSearch(staff)) {
    redirect("/admin");
  }

  const sp = searchParams ? await searchParams : {};
  const q =
    typeof sp.q === "string" ? sp.q : Array.isArray(sp.q) ? sp.q[0] ?? "" : "";

  const payload = q.trim() ? await runGlobalSearch(supabaseAdmin, q.trim(), 50) : null;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <AdminPageHeader
        eyebrow="Admin"
        title="Global Search"
        description="Search leads, patients, calls, private pay, faxes, packets, and more — including referral source and campaign trails."
      />

      <GlobalSearchBar initialQuery={q} variant="page" autoFocus />

      {!q.trim() ? (
        <p className="rounded-2xl border border-dashed border-slate-200 bg-white/70 px-4 py-8 text-center text-sm text-slate-500">
          Enter a name, phone number, email, Medicare number, referral source, or campaign to search across Saintly.
        </p>
      ) : payload && payload.results.length === 0 ? (
        <p className="rounded-2xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-600">
          No results for <span className="font-semibold text-slate-900">&ldquo;{payload.query}&rdquo;</span>.
        </p>
      ) : payload ? (
        <div className="space-y-8">
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
