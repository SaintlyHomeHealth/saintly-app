import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { archiveFaxAction, markFaxReadAction } from "@/app/admin/fax/actions";
import { FaxNoteEditor } from "@/app/admin/fax/_components/FaxNoteEditor";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { crmActionBtnMuted, crmActionBtnSky, crmPrimaryCtaCls } from "@/components/admin/crm-admin-list-styles";
import { supabaseAdmin } from "@/lib/admin";
import { formatFaxSenderDisplay } from "@/lib/fax/format-fax-sender";
import { formatFaxDateTimeDetail } from "@/lib/fax/format-fax-time";
import { missingFaxSchema, signedFaxPdfUrl, type FaxMessageRow } from "@/lib/fax/fax-service";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";
import { getStaffProfile, isAdminOrHigher, isManagerOrHigher } from "@/lib/staff-profile";

import { DeleteFaxButton } from "../_components/DeleteFaxButton";

export default async function AdminFaxDetailPage({ params }: { params: Promise<{ faxId: string }> }) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) redirect("/admin");
  const allowHardDelete = isAdminOrHigher(staff);

  const { faxId } = await params;
  if (!faxId) notFound();

  const { data, error } = await supabaseAdmin.from("fax_messages").select("*").eq("id", faxId).maybeSingle();
  if (missingFaxSchema(error)) redirect("/admin/fax");
  if (error || !data?.id) notFound();
  const fax = data as FaxMessageRow;

  const pdfUrl = (await signedFaxPdfUrl(fax.storage_path)) ?? fax.pdf_url ?? fax.media_url;
  const returnTo = `/admin/fax/${fax.id}`;
  const senderDisplay = formatFaxSenderDisplay(fax.from_number, fax.sender_name);
  const recipientDisplay = formatFaxSenderDisplay(fax.to_number, fax.recipient_name);

  return (
    <div className="space-y-6 p-6">
      <AdminPageHeader
        eyebrow="Fax detail"
        title={fax.subject || `${fax.direction === "inbound" ? "Inbound" : "Outbound"} fax`}
        metaLine={`${senderDisplay} → ${recipientDisplay} · ${formatFaxDateTimeDetail(fax.received_at ?? fax.sent_at ?? fax.created_at)}`}
        description="Preview the PDF and add a short note so the team can recognize this fax in the list."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/fax" className={crmPrimaryCtaCls}>
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
            {pdfUrl ? (
              <a href={pdfUrl} target="_blank" rel="noreferrer" className={crmActionBtnSky}>
                Download / print PDF
              </a>
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

        <aside>
          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-bold text-slate-900">Fax note</p>
              {!fax.is_read && fax.direction === "inbound" ? (
                <span className="rounded-full bg-sky-50 px-2 py-1 text-[11px] font-bold text-sky-700">Unread</span>
              ) : null}
            </div>
            <div className="mt-4">
              <FaxNoteEditor faxId={fax.id} initialNote={fax.note ?? null} />
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
