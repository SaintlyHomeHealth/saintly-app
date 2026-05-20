import Link from "next/link";
import { Suspense } from "react";

import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";
import { redirect } from "next/navigation";

import { SendPacketForm } from "./SendPacketForm";

export default async function AdminSendPacketPage({
  searchParams,
}: {
  searchParams: Promise<{ templateId?: string }>;
}) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    redirect("/unauthorized?reason=forbidden");
  }
  const sp = await searchParams;
  const initialTemplateId = sp.templateId?.trim() || null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-sky-50/40">
      <main className="mx-auto w-full max-w-4xl px-4 py-10">
        <div className="mb-10">
          <Link
            href="/admin/signatures"
            className="text-xs font-semibold uppercase tracking-wide text-sky-800/90 hover:underline"
          >
            ← Saintly PDF Sign
          </Link>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">Send a packet</h1>
          <p className="mt-2 max-w-2xl text-base text-slate-600">
            Walk through four quick steps: pick the document, add the signer, set options, and send the secure link.
          </p>
        </div>

        <Suspense
          fallback={
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500 shadow-sm">
              Loading…
            </div>
          }
        >
          <SendPacketForm initialTemplateId={initialTemplateId} />
        </Suspense>
      </main>
    </div>
  );
}
