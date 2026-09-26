import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { archiveFaxAction, markFaxReadAction } from "@/app/admin/fax/actions";
import { FaxDisplayTitleEditor } from "@/app/admin/fax/_components/FaxDisplayTitleEditor";
import { FaxInboxStatusBadge } from "@/app/admin/fax/_components/FaxInboxStatusBadge";
import { FaxInboxStatusEditor } from "@/app/admin/fax/_components/FaxInboxStatusEditor";
import { FaxNoteEditor } from "@/app/admin/fax/_components/FaxNoteEditor";
import { MarkFaxFiledButton } from "@/app/admin/fax/_components/MarkFaxFiledButton";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { crmActionBtnMuted, crmActionBtnSky, crmPrimaryCtaCls } from "@/components/admin/crm-admin-list-styles";
import { supabaseAdmin } from "@/lib/admin";
import { faxInboxStatus, faxPdfFilename, faxVisibleRecordName } from "@/lib/fax/fax-ehr-filing";
import { formatFaxSenderDisplay } from "@/lib/fax/format-fax-sender";
import { formatFaxDateTimeDetail } from "@/lib/fax/format-fax-time";
import { inboundFaxHasDocumentForForward } from "@/lib/fax/forward-inbound-fax";
import type { FaxPacketMetadata } from "@/lib/fax/fax-cover-template-types";
import { missingFaxSchema, signedFaxPdfUrl, type FaxMessageRow } from "@/lib/fax/fax-service";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";
import { getStaffProfile, isAdminOrHigher, isManagerOrHigher } from "@/lib/staff-profile";

import { DeleteFaxButton } from "../_components/DeleteFaxButton";
import { ForwardInboundFaxButton } from "../_components/ForwardInboundFaxButton";
import { ResendFaxButton } from "../_components/ResendFaxButton";
import { SendAnotherDocButton } from "../_components/SendAnotherDocButton";

/** Only allow returning to Fax Center paths (avoid open redirects). */
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
  if (!faxId) notFound();

  const { data, error } = await supabaseAdmin.from("fax_messages").select("*").eq("id", faxId).maybeSingle();
  if (missingFaxSchema(error)) redirect("/admin/fax");
  if (error || !data?.id) notFound();
  const fax = data as FaxMessageRow;

  const inboxStatus = faxInboxStatus(fax);
  let filedByLabel: string | null = null;
  let statusChangedByLabel: string | null = null;
  const staffIds = [...new Set([fax.filed_by, fax.status_changed_by].filter((id): id is string => Boolean(id)))];
  if (staffIds.length > 0) {
    const { data: people } = await supabaseAdmin
      .from("staff_profiles")
      .select("user_id, full_name, email")
      .in("user_id", staffIds);
    const labelFor = (userId: string | null | undefined) => {
      const person = (people ?? []).find((row) => row.user_id === userId);
      const name = typeof person?.full_name === "string" ? person.full_name.trim() : "";
      const email = typeof person?.email === "string" ? person.email.trim() : "";
      return name || email || null;
    };
    filedByLabel = labelFor(fax.filed_by);
    statusChangedByLabel = labelFor(fax.status_changed_by);
  }

  const pdfUrl = (await signedFaxPdfUrl(fax.storage_path)) ?? fax.pdf_url ?? fax.media_url;
  const returnTo = `/admin/fax/${fax.id}`;
  const senderDisplay = formatFaxSenderDisplay(fax.from_number, fax.sender_name);
  const recipientDisplay = formatFaxSenderDisplay(fax.to_number, fax.recipient_name);
  const originalFromDisplay = [senderDisplay || null, fax.from_number ? formatPhoneForDisplay(fax.from_number) : null]
    .filter(Boolean)
    .join(" · ") || "Unknown";
  const originalReceivedDisplay = formatFaxDateTimeDetail(fax.received_at ?? fax.created_at);
  const packetMeta = (fax.packet_metadata ?? null) as FaxPacketMetadata | null;
  const recordName = faxVisibleRecordName(fax);
  const hasInboundDocument = fax.direction === "inbound" && inboundFaxHasDocumentForForward(fax);
  const downloadName = faxPdfFilename({
    displayTitle: fax.display_title,
    note: fax.note,
    faxId: fax.id,
  });

  return (
    <div className="space-y-6 p-6">
      <AdminPageHeader
        eyebrow="Fax detail"
        title={recordName}
        metaLine={
          <>
            {senderDisplay} → {recipientDisplay} · {formatFaxDateTimeDetail(fax.received_at ?? fax.sent_at ?? fax.created_at)}
            {fax.direction === "inbound" ? (
              <>
                {" "}
                <FaxInboxStatusBadge status={inboxStatus} />
              </>
            ) : null}
          </>
        }
        description={
          fax.direction === "inbound"
            ? "Preview the PDF, set the Alora record name, and keep a separate note for the team."
            : "Preview the PDF and add a short note so the team can recognize this fax in the list."
        }
        actions={
          <div className="flex w-full flex-wrap items-start gap-2">
            <Link href={listReturnPath} className={crmPrimaryCtaCls}>
              ← Back to faxes
            </Link>
            <Link href="/admin/fax" className={crmActionBtnMuted}>
              All faxes
            </Link>
            <form action={markFaxReadAction}>
              <input type="hidden" name="faxId" value={fax.id} />
              <input type="hidden" name="isRead" value={fax.is_read ? "0" : "1"} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <button type="submit" className={crmActionBtnMuted}>
                Mark {fax.is_read ? "unread" : "read"}
              </button>
            </form>
            <form action={archiveFaxAction}>
              <input type="hidden" name="faxId" value={fax.id} />
              <input type="hidden" name="archived" value={fax.is_archived ? "0" : "1"} />
              <input type="hidden" name="returnTo" value={fax.is_archived ? returnTo : "/admin/fax"} />
              <button type="submit" className={crmActionBtnMuted}>
                {fax.is_archived ? "Unarchive" : "Archive"}
              </button>
            </form>
            {hasInboundDocument ? (
              <a href={`/admin/fax/${fax.id}/pdf`} download={downloadName} className={crmActionBtnSky}>
                Download PDF
              </a>
            ) : pdfUrl ? (
              <a href={pdfUrl} target="_blank" rel="noreferrer" className={crmActionBtnSky}>
                Download / print PDF
              </a>
            ) : null}
            {hasInboundDocument && !fax.filed_to_ehr_at ? <MarkFaxFiledButton faxId={fax.id} /> : null}
            {fax.direction === "inbound" ? (
              <FaxInboxStatusEditor
                faxId={fax.id}
                initialStatus={inboxStatus}
                initialNote={fax.status_note ?? null}
              />
            ) : null}
            {fax.direction === "outbound" ? (
              <>
                <ResendFaxButton faxId={fax.id} initialRecipientNumber={fax.to_number} note={fax.note ?? null} compact />
                <SendAnotherDocButton faxId={fax.id} returnPath={listReturnPath} compact />
              </>
            ) : null}
            {fax.direction === "inbound" && inboundFaxHasDocumentForForward(fax) ? (
              <ForwardInboundFaxButton
                faxId={fax.id}
                originalFromDisplay={originalFromDisplay}
                originalReceivedDisplay={originalReceivedDisplay}
                pageCount={fax.page_count}
                variant="detail"
              />
            ) : null}
            <DeleteFaxButton faxId={fax.id} returnTo="/admin/fax" allowHardDelete={allowHardDelete} />
          </div>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-5 py-3">
            <p className="text-sm font-bold text-slate-900">PDF preview</p>
            {pdfUrl ? (
              <a href={pdfUrl} target="_blank" rel="noreferrer" className={crmActionBtnMuted}>
                Open PDF in new tab
              </a>
            ) : null}
          </div>
          <div className="border-b border-slate-100 px-5 py-3 text-xs text-slate-600">
            <span className="font-semibold text-slate-700">Status:</span> {fax.status}
            {" · "}
            <span className="font-semibold text-slate-700">From:</span> {formatPhoneForDisplay(fax.from_number)}
            {" · "}
            <span className="font-semibold text-slate-700">To:</span> {formatPhoneForDisplay(fax.to_number)}
            {fax.page_count != null ? (
              <>
                {" · "}
                <span className="font-semibold text-slate-700">Pages:</span> {fax.page_count}
              </>
            ) : null}
            {fax.failure_reason ? (
              <span className="mt-2 block rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-rose-800">{fax.failure_reason}</span>
            ) : null}
          </div>
          {pdfUrl ? (
            <iframe src={pdfUrl} title="Fax PDF preview" className="h-[760px] w-full bg-slate-100" />
          ) : (
            <div className="flex h-[520px] items-center justify-center p-8 text-center text-sm text-slate-500">
              No PDF available.
            </div>
          )}
        </section>

        <aside className="space-y-4">
          {packetMeta ? (
            <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-bold text-slate-900">Fax packet</p>
              <dl className="mt-3 space-y-2 text-sm text-slate-700">
                {packetMeta.cover_sheet_template_name ? (
                  <div>
                    <dt className="text-[11px] font-semibold uppercase text-slate-500">Template</dt>
                    <dd>{packetMeta.cover_sheet_template_name}</dd>
                  </div>
                ) : null}
                {packetMeta.patient_name ? (
                  <div>
                    <dt className="text-[11px] font-semibold uppercase text-slate-500">Patient</dt>
                    <dd>
                      {packetMeta.patient_name}
                      {packetMeta.patient_dob ? ` · DOB ${packetMeta.patient_dob}` : ""}
                    </dd>
                  </div>
                ) : null}
                {packetMeta.recipient_organization ? (
                  <div>
                    <dt className="text-[11px] font-semibold uppercase text-slate-500">Organization</dt>
                    <dd>{packetMeta.recipient_organization}</dd>
                  </div>
                ) : null}
                {packetMeta.recipient_phone ? (
                  <div>
                    <dt className="text-[11px] font-semibold uppercase text-slate-500">Recipient phone</dt>
                    <dd>{packetMeta.recipient_phone}</dd>
                  </div>
                ) : null}
                {packetMeta.message ? (
                  <div>
                    <dt className="text-[11px] font-semibold uppercase text-slate-500">Message</dt>
                    <dd className="whitespace-pre-wrap">{packetMeta.message}</dd>
                  </div>
                ) : null}
              </dl>
            </section>
          ) : null}
          {fax.direction === "inbound" ? (
            <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
              <FaxDisplayTitleEditor faxId={fax.id} initialTitle={fax.display_title ?? null} variant="detail" />
              <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-700">
                <FaxInboxStatusBadge status={inboxStatus} />
                {fax.status_note ? <span className="text-slate-600">{fax.status_note}</span> : null}
              </p>
              {fax.filed_to_ehr_at ? (
                <p className="mt-2 text-sm text-emerald-800">
                  Filed in Alora {formatFaxDateTimeDetail(fax.filed_to_ehr_at)}
                  {filedByLabel ? ` by ${filedByLabel}` : ""}
                  {fax.ehr_patient_name ? ` · ${fax.ehr_patient_name}` : ""}
                </p>
              ) : (
                <p className="mt-2 text-xs text-slate-500">Not filed in Alora yet.</p>
              )}
              {fax.status_changed_at ? (
                <p className="mt-1 text-xs text-slate-500">
                  Status changed {formatFaxDateTimeDetail(fax.status_changed_at)}
                  {statusChangedByLabel ? ` by ${statusChangedByLabel}` : ""}
                </p>
              ) : null}
            </section>
          ) : null}
          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-bold text-slate-900">Fax note</p>
              {!fax.is_read && fax.direction === "inbound" ? (
                <span className="rounded-full bg-sky-50 px-2 py-1 text-[11px] font-bold text-sky-700">Unread</span>
              ) : null}
            </div>
            <div className="mt-4">
              <FaxNoteEditor
                faxId={fax.id}
                initialNote={fax.note ?? null}
                autoSummarize={
                  fax.direction === "inbound" &&
                  fax.status !== "failed" &&
                  Boolean(fax.storage_path || fax.media_url)
                }
              />
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
