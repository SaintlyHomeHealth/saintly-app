import Link from "next/link";
import { Suspense } from "react";

import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";
import { pdfSignAllowedFromEmailList } from "@/lib/pdf-sign/pdf-sign-from-email";
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
  const initialTemplateId = sp.templateId?.trim() ?? null;

  const pdfSignAllowedFromEmails = pdfSignAllowedFromEmailList();

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-slate-50 via-white to-sky-50/40">
      <main className="flex w-full flex-1 flex-col px-4 py-6 sm:px-5 lg:px-6">
        <div className="mx-auto mb-8 max-w-6xl rounded-2xl border border-slate-200/90 bg-white p-6 shadow-md shadow-slate-200/30 md:p-8">
          <Link
            href="/admin/signatures"
            className="text-xs font-semibold uppercase tracking-wide text-sky-800/90 hover:underline"
          >
            ← Saintly PDF Sign
          </Link>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">Send a packet</h1>
          <p className="mt-2 text-base leading-relaxed text-slate-600">
            Send a document for secure signature.
          </p>
        </div>

        <Suspense
          fallback={
            <div className="mx-auto max-w-6xl rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500 shadow-sm">
              Loading…
            </div>
          }
        >
        <SendPacketForm
          initialTemplateId={initialTemplateId}
          senderDisplayName={staff.full_name?.trim() || staff.email?.trim() || "Saintly representative"}
          pdfSignAllowedFromEmails={pdfSignAllowedFromEmails}
        />
        </Suspense>
      </main>
    </div>
  );
}
