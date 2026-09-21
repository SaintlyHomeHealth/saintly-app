import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { updateFaxStructuredFieldsAction } from "@/app/admin/fax/actions";
import { DeleteFaxButton } from "../_components/DeleteFaxButton";
import { FaxActivityTrail } from "../_components/FaxActivityTrail";
import { FaxNoteEditor } from "../_components/FaxNoteEditor";
import { FaxPdfViewer } from "../_components/FaxPdfViewer";
import { FaxStructuredPanel } from "../_components/FaxStructuredPanel";
import { ForwardInboundFaxButton } from "../_components/ForwardInboundFaxButton";
import { ResendFaxButton } from "../_components/ResendFaxButton";
import { SendAnotherDocButton } from "../_components/SendAnotherDocButton";
import { fx } from "../_components/fax-tokens";
import { supabaseAdmin } from "@/lib/admin";
import { formatFaxSenderDisplay } from "@/lib/fax/format-fax-sender";
import { formatFaxDateTimeDetail } from "@/lib/fax/format-fax-time";
import { inboundFaxHasDocumentForForward } from "@/lib/fax/inbound-fax-has-document";
import { missingFaxSchema, signedFaxPdfUrl, type FaxMessageRow } from "@/lib/fax/fax-service";
import { matchFaxPatient } from "@/lib/fax/match-fax-patient";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";
import { getStaffProfile, isAdminOrHigher, isManagerOrHigher } from "@/lib/staff-profile";

function safeFaxListReturnPath(raw: string | string[] | undefined): string {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (typeof v !== "string") return "/admin/fax";
  const t = v.trim();
  if (!t.startsWith("/admin/fax")) return "/admin/fax";
  if (t.includes("..") || t.includes("//")) return "/admin/fax";
  return t;
}

export default async function AdminFaxDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ faxId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) redirect("/admin");
  const allowHardDelete = isAdminOrHigher(staff);

  const { faxId } = await params;
  const sp = searchParams ? await searchParams : {};
  const listReturnPath = safeFaxListReturnPath(sp.returnTo);
  const pageRaw = Array.isArray(sp.page) ? sp.page[0] : sp.page;
  const initialPage = Math.max(1, Number.parseInt(String(pageRaw ?? "1"), 10) || 1);
  if (!faxId) notFound();

  const { data, error } = await supabaseAdmin.from("fax_messages").select("*").eq("id", faxId).maybeSingle();
  if (missingFaxSchema(error)) redirect("/admin/fax");
  if (error || !data?.id) notFound();
  const fax = data as FaxMessageRow;

  const pdfUrl = (await signedFaxPdfUrl(fax.storage_path)) ?? fax.pdf_url ?? fax.media_url;
  const senderDisplay = formatFaxSenderDisplay(fax.from_number, fax.sender_name);
  const originalFromDisplay = [senderDisplay || null, fax.from_number ? formatPhoneForDisplay(fax.from_number) : null]
    .filter(Boolean)
    .join(" · ") || "Unknown";
  const originalReceivedDisplay = formatFaxDateTimeDetail(fax.received_at ?? fax.created_at);

  const { data: events } = await supabaseAdmin
    .from("fax_events")
    .select("id, event_type, created_at, payload")
    .eq("fax_message_id", fax.id)
    .order("created_at", { ascending: true })
    .limit(80);

  const { data: staffRows } = await supabaseAdmin
    .from("staff_profiles")
    .select("user_id, full_name, email")
    .eq("is_active", true)
    .in("role", ["manager", "don", "admin", "super_admin"])
    .limit(80);
  const staffOptions = ((staffRows ?? []) as { user_id: string; full_name: string | null; email: string | null }[]).map(
    (s) => ({ userId: s.user_id, name: s.full_name || s.email || s.user_id })
  );

  let nearMatch: { patientId: string; displayName: string } | null = null;
  if (!fax.patient_id && fax.patient_name && fax.patient_match_status === "near") {
    const match = await matchFaxPatient({ name: fax.patient_name, dob: fax.patient_dob });
    if (match.patientId && match.displayName) {
      nearMatch = { patientId: match.patientId, displayName: match.displayName };
    } else if (match.candidates?.[0]) {
      nearMatch = { patientId: match.candidates[0].patientId, displayName: match.candidates[0].displayName };
    }
  }

  async function markReviewed() {
    "use server";
    await updateFaxStructuredFieldsAction({ faxId, triageState: "reviewed" });
  }

  return (
    <div className={`${fx.page} flex h-[calc(100dvh-var(--admin-header-height))] min-h-0 flex-col`}>
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2 [border-color:var(--fx-border)]">
        <Link href={listReturnPath} className={fx.btnGhost}>
          ← Back
        </Link>
        <h1 className="text-[16px] font-bold">
          {fax.patient_name || fax.subject || (fax.direction === "inbound" ? "Inbound fax" : "Outbound fax")}
        </h1>
        <span className={`${fx.muted} tabular-nums`}>
          {formatFaxDateTimeDetail(fax.received_at ?? fax.sent_at ?? fax.created_at)}
        </span>
        <span className="flex-1" />
        <form action={markReviewed}>
          <button type="submit" className={fx.btnPrimary}>
            Mark reviewed
          </button>
        </form>
        {fax.direction === "inbound" && inboundFaxHasDocumentForForward(fax) ? (
          <ForwardInboundFaxButton
            faxId={fax.id}
            originalFromDisplay={originalFromDisplay}
            originalReceivedDisplay={originalReceivedDisplay}
            pageCount={fax.page_count}
            variant="detail"
          />
        ) : null}
        {fax.direction === "outbound" ? (
          <>
            <ResendFaxButton faxId={fax.id} initialRecipientNumber={fax.to_number} note={fax.note ?? null} compact />
            <SendAnotherDocButton faxId={fax.id} returnPath={listReturnPath} compact />
          </>
        ) : null}
        {pdfUrl ? (
          <a href={pdfUrl} className={fx.btnSecondary} target="_blank" rel="noreferrer">
            Download
          </a>
        ) : null}
        <details className="relative">
          <summary className={`${fx.btnGhost} cursor-pointer list-none`}>⋯</summary>
          <div className="absolute right-0 z-20 mt-1 w-48 rounded-[8px] border bg-[var(--fx-surface)] p-2 shadow-lg [border-color:var(--fx-border)]">
            <form
              action={async () => {
                "use server";
                await updateFaxStructuredFieldsAction({ faxId, triageState: "filed" });
              }}
            >
              <button type="submit" className={`${fx.btnGhost} w-full justify-start`}>
                Archive
              </button>
            </form>
            <DeleteFaxButton faxId={fax.id} returnTo="/admin/fax" allowHardDelete={allowHardDelete} />
          </div>
        </details>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[minmax(0,0.6fr)_minmax(20rem,0.4fr)]">
        <section className="min-h-0 overflow-hidden border-r [border-color:var(--fx-border)]">
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center text-[13px] text-[color:var(--fx-text-muted)]">
                Loading PDF…
              </div>
            }
          >
            <FaxPdfViewer pdfUrl={pdfUrl} initialPage={initialPage} />
          </Suspense>
        </section>
        <aside className="min-h-0 space-y-4 overflow-y-auto p-4">
          <Suspense fallback={<div className={`${fx.card} h-64 animate-pulse`} />}>
            <FaxStructuredPanel
              faxId={fax.id}
              patientName={fax.patient_name ?? null}
              patientDob={fax.patient_dob ?? null}
              documentType={fax.document_type ?? null}
              serviceDate={fax.service_date ?? null}
              payer={fax.payer ?? null}
              senderOrg={fax.sender_org ?? null}
              referringProvider={fax.referring_provider ?? null}
              clinician={fax.clinician ?? null}
              assignedToUserId={fax.assigned_to_user_id}
              triageState={fax.triage_state ?? "new"}
              sourcePage={fax.extraction_source_page ?? null}
              patientId={fax.patient_id}
              patientMatchStatus={fax.patient_match_status ?? null}
              extractionStatus={fax.extraction_status ?? null}
              staffOptions={staffOptions}
              nearMatch={nearMatch}
            />
          </Suspense>
          <section className={`${fx.card} p-4`}>
            <h2 className="mb-2 text-[14px] font-bold">Note</h2>
            <FaxNoteEditor faxId={fax.id} initialNote={fax.note ?? null} />
          </section>
          <section className={`${fx.card} p-4`}>
            <h2 className="mb-2 text-[14px] font-bold">Activity</h2>
            <FaxActivityTrail
              items={((events ?? []) as { id: string; event_type: string; created_at: string; payload: Record<string, unknown> | null }[])}
            />
          </section>
        </aside>
      </div>
    </div>
  );
}
