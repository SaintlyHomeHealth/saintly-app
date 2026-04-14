import { deletePayerCredentialingAttachment } from "../actions";
import { CredentialingAttachmentUploadForm } from "./CredentialingAttachmentUploadForm";
import { formatCredentialingDateTime } from "@/lib/crm/credentialing-datetime";
import { PAYER_CREDENTIALING_MAX_ATTACHMENT_BYTES } from "@/lib/crm/payer-credentialing-storage";
import { loadCredentialingStaffLabelMap } from "@/lib/crm/credentialing-staff-directory";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const CARD_SHELL =
  "rounded-[28px] border border-slate-200/90 bg-gradient-to-b from-white to-slate-50/90 shadow-[0_1px_3px_rgba(15,23,42,0.06)] ring-1 ring-slate-200/60";

type AttachmentRow = {
  id: string;
  file_name: string;
  file_type: string | null;
  file_size: number | null;
  category: string | null;
  description: string | null;
  uploaded_at: string;
  uploaded_by_user_id: string | null;
};

function formatAttachmentBytes(n: number | null): string {
  if (n == null || Number.isNaN(n)) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export async function CredentialingAttachmentsSection({ credentialingId }: { credentialingId: string }) {
  const supabase = await createServerSupabaseClient();
  const id = credentialingId.trim();

  const { data: rawAttachments, error: attachFetchErr } = await supabase
    .from("payer_credentialing_attachments")
    .select("id, file_name, file_type, file_size, category, description, uploaded_at, uploaded_by_user_id")
    .eq("credentialing_record_id", id)
    .order("uploaded_at", { ascending: false });

  if (attachFetchErr) {
    return (
      <p className="text-sm text-amber-900">
        Additional documents are unavailable until the{" "}
        <span className="font-mono text-xs">payer_credentialing_attachments</span> migration and Storage bucket are
        applied.
      </p>
    );
  }

  const attachments = (rawAttachments ?? []) as AttachmentRow[];
  const uploaderIds = attachments.map((a) => a.uploaded_by_user_id).filter((x): x is string => Boolean(x));
  const actorLabels = await loadCredentialingStaffLabelMap(uploaderIds);

  const count = attachments.length;

  return (
    <details id="credentialing-additional-docs" className={`scroll-mt-28 ${CARD_SHELL} bg-white`} open={count === 0}>
      <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
        Additional documents
        <span className="ml-2 font-normal text-slate-500">
          ({count} file{count === 1 ? "" : "s"})
        </span>
      </summary>
      <div className="space-y-4 border-t border-slate-100 px-5 pb-6 pt-4">
        <p className="text-xs text-slate-600">
          Upload contracts, welcome letters, screenshots, or payer-specific forms. Files are stored in Supabase Storage
          (bucket <span className="font-mono text-[10px]">payer-credentialing</span>). Max{" "}
          {Math.round(PAYER_CREDENTIALING_MAX_ATTACHMENT_BYTES / (1024 * 1024))} MB; PDF, images, Word, Excel, CSV, TXT,
          or ZIP.
        </p>

        <CredentialingAttachmentUploadForm credentialingId={credentialingId} />

        <div className="overflow-x-auto rounded-2xl border border-slate-100">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="px-3 py-2">File</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2">Uploaded</th>
                <th className="px-3 py-2">By</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {attachments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-sm text-slate-500">
                    No attachments yet.
                  </td>
                </tr>
              ) : (
                attachments.map((a) => {
                  const by = a.uploaded_by_user_id
                    ? actorLabels.get(a.uploaded_by_user_id) ?? "Staff"
                    : "—";
                  const when = formatCredentialingDateTime(a.uploaded_at);
                  return (
                    <tr key={a.id} className="border-b border-slate-50 last:border-0">
                      <td className="px-3 py-2">
                        <p className="font-medium text-slate-900">{a.file_name}</p>
                        <p className="text-[10px] text-slate-500">
                          {(a.file_type ?? "").trim() || "—"} · {formatAttachmentBytes(a.file_size)}
                        </p>
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-700">{(a.category ?? "").trim() || "—"}</td>
                      <td className="max-w-[220px] px-3 py-2 text-xs text-slate-600">
                        <span className="line-clamp-3 whitespace-pre-wrap break-words">
                          {(a.description ?? "").trim() || "—"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-600">{when}</td>
                      <td className="px-3 py-2 text-xs text-slate-700">{by}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-2">
                          <a
                            href={`/api/payer-credentialing-attachments/${a.id}/download`}
                            className="inline-flex rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] font-bold text-sky-900 hover:bg-sky-100"
                          >
                            Download
                          </a>
                          <form action={deletePayerCredentialingAttachment}>
                            <input type="hidden" name="credentialing_id" value={credentialingId} />
                            <input type="hidden" name="attachment_id" value={a.id} />
                            <button
                              type="submit"
                              className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-bold text-red-900 hover:bg-red-100"
                            >
                              Remove
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </details>
  );
}

export function CredentialingAttachmentsSectionFallback() {
  return <div className={`${CARD_SHELL} h-64 animate-pulse bg-slate-100/90`} />;
}
