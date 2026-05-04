import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { supabaseAdmin } from "@/lib/admin";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

import { AppTimezoneDebugPanel } from "./AppTimezoneDebugPanel";

export const dynamic = "force-dynamic";

export default async function AdminAppTimezoneDebugPage() {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    redirect("/admin");
  }

  const { data: leadSample } = await supabaseAdmin.from("leads").select("updated_at").limit(1).maybeSingle();

  return (
    <div className="space-y-6 p-6">
      <AdminPageHeader
        eyebrow="Debug"
        title="Agency time (America/Phoenix)"
        description={
          <p className="text-sm text-slate-600">
            Compare browser local time, Phoenix business time, UTC, and one sample UTC timestamp loaded from Postgres (
            <code className="rounded bg-slate-100 px-1">leads.updated_at</code>).
          </p>
        }
      />
      <p className="text-xs text-slate-500">
        <Link href="/admin" className="font-semibold text-sky-700 hover:underline">
          Back to admin
        </Link>
      </p>
      <AppTimezoneDebugPanel dbSampleUpdatedAt={(leadSample?.updated_at as string | null | undefined) ?? null} />
    </div>
  );
}
