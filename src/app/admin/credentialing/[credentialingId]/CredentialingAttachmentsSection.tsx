import { CredentialingAttachmentDeleteButton } from "./CredentialingAttachmentDeleteButton";
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

function fileTypeLabel(fileType: string | null): string {
  const t = (fileType ?? "").trim();
  if (!t) return "—";
  if (t === "application/pdf") return "PDF";
  if (t.startsWith("image/")) return t.replace("image/", "Image · ");
  return t;
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
        Uploaded attachments are unavailable until the{" "}
        <span className="font-mono text-xs">payer_credentialing_attachments</span> migration and Storage bucket are
        applied.
      </p>
    );
  }

  const attachments = (rawAttachments ?? []) as AttachmentRow[];
  const uploaderIds = attachments.map((a) => a.uploaded_by_user_id).filter((x): x is string => Boolean(x));
  const actorLabels = await loadCredentialingStaffLabelMap(uploaderIds);

  return (
    <section
      id="credentialing-uploaded-attachments"
      className={`scroll-mt-28 ${CARD_SHELL} bg-white p-5 sm:p-6`}
      aria-labelledby="credentialing-uploaded-attachments-heading"
    >
      <h2 id="credentialing-uploaded-attachments-heading" className="text-sm font-semibold text-slate-900">
        Uploaded attachments
      </h2>
      <p className="mt-1 text-xs text-slate-500">
        Files are scoped to this payer/carrier record only (Supabase bucket{" "}
        <span className="font-mono text-[10px]">payer-credentialing</span>). Max{" "}
        {Math.round(PAYER_CREDENTIALING_MAX_ATTACHMENT_BYTES / (1024 * 1024))} MB per file; PDF, images, Word, Excel,
        CSV, TXT, or ZIP.
      </p>

      <div className="mt-4">
        <CredentialingAttachmentUploadForm credentialingId={credentialingId} />
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Files on this carrier</h3>

        {attachments.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">No attachments uploaded for this carrier yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-xl border border-slate-100">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="px-3 py-2">File</th>
                  <th className="px-3 py-2">Category / type</th>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2">Uploaded</th>
                  <th className="px-3 py-2">By</th>
                  <th className="px-3 py-2">Size</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {attachments.map((a) => {
                  const by = a.uploaded_by_user_id
                    ? actorLabels.get(a.uploaded_by_user_id) ?? "Staff"
                    : "—";
                  const when = formatCredentialingDateTime(a.uploaded_at);
                  const cat = (a.category ?? "").trim();
                  const typ = fileTypeLabel(a.file_type);
                  const typePieces: string[] = [];
                  if (cat) typePieces.push(cat);
                  if (typ && typ !== "—") typePieces.push(typ);
                  const categoryTypeDisplay = typePieces.length > 0 ? typePieces.join(" · ") : "—";
                  const viewHref = `/api/payer-credentialing-attachments/${encodeURIComponent(a.id)}/download`;
                  const downloadHref = `/api/payer-credentialing-attachments/${encodeURIComponent(a.id)}/download?download=1`;

                  return (
                    <tr key={a.id} className="border-b border-slate-50 last:border-0">
                      <td className="px-3 py-2">
                        <p className="font-medium text-slate-900">{a.file_name}</p>
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-700">{categoryTypeDisplay}</td>
                      <td className="max-w-[220px] px-3 py-2 text-xs text-slate-600">
                        <span className="line-clamp-3 whitespace-pre-wrap break-words">
                          {(a.description ?? "").trim() || "—"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-600">{when}</td>
                      <td className="px-3 py-2 text-xs text-slate-700">{by}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-600">
                        {formatAttachmentBytes(a.file_size)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-2">
                          <a
                            href={viewHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-800 hover:bg-slate-50"
                          >
                            View
                          </a>
                          <a
                            href={downloadHref}
                            className="inline-flex rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] font-bold text-sky-900 hover:bg-sky-100"
                          >
                            Download
                          </a>
                          <CredentialingAttachmentDeleteButton credentialingId={credentialingId} attachmentId={a.id} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

export function CredentialingAttachmentsSectionFallback() {
  return <div className={`${CARD_SHELL} h-64 animate-pulse bg-slate-100/90`} />;
}
