import { updatePayerCredentialingDocuments } from "../actions";
import {
  PAYER_CREDENTIALING_DOC_LABELS,
  PAYER_CREDENTIALING_DOC_STATUS_LABELS,
  PAYER_CREDENTIALING_DOC_STATUS_VALUES,
  PAYER_CREDENTIALING_DOC_TYPES,
  type PayerCredentialingDocType,
} from "@/lib/crm/credentialing-documents";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const CARD_SHELL =
  "rounded-[28px] border border-slate-200/90 bg-gradient-to-b from-white to-slate-50/90 shadow-[0_1px_3px_rgba(15,23,42,0.06)] ring-1 ring-slate-200/60";

const inp =
  "mt-0.5 w-full max-w-xs rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-800";

type DocRow = {
  id: string;
  doc_type: string;
  status: string;
};

function sortDocsByCatalog(docs: DocRow[]): DocRow[] {
  const order = new Map(PAYER_CREDENTIALING_DOC_TYPES.map((t, i) => [t, i]));
  return [...docs].sort((a, b) => {
    const ia = order.get(a.doc_type as PayerCredentialingDocType) ?? 99;
    const ib = order.get(b.doc_type as PayerCredentialingDocType) ?? 99;
    return ia - ib;
  });
}

export async function CredentialingDocumentsStatusForm({ credentialingId }: { credentialingId: string }) {
  const supabase = await createServerSupabaseClient();
  const id = credentialingId.trim();

  const { data: rawDocs } = await supabase
    .from("payer_credentialing_documents")
    .select("id, doc_type, status")
    .eq("credentialing_record_id", id);

  const documents = sortDocsByCatalog((rawDocs ?? []) as DocRow[]);

  if (documents.length === 0) {
    return (
      <div className={`${CARD_SHELL} p-5 text-sm text-slate-600`}>
        Required document rows appear after{" "}
        <span className="font-mono text-xs">payer_credentialing_documents</span> is available for this record.
      </div>
    );
  }

  return (
    <section id="documents" className={`scroll-mt-28 ${CARD_SHELL} bg-white p-5 sm:p-6`}>
      <h2 className="text-sm font-semibold text-slate-900">Required documents (status)</h2>
      <p className="mt-1 text-xs text-slate-500">
        Set each item to Missing, Uploaded, or N/A. Upload files from the attachments section below.
      </p>
      <form action={updatePayerCredentialingDocuments} className="mt-4 space-y-4">
        <input type="hidden" name="credentialing_id" value={credentialingId} />
        <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-100">
          {documents.map((d) => {
            const label =
              PAYER_CREDENTIALING_DOC_LABELS[d.doc_type as PayerCredentialingDocType] ?? d.doc_type;
            return (
              <li key={d.id} className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-sm font-medium text-slate-900">{label}</span>
                <select
                  name={`doc_status_${d.id}`}
                  className={inp}
                  defaultValue={d.status}
                  aria-label={`Status for ${label}`}
                >
                  {PAYER_CREDENTIALING_DOC_STATUS_VALUES.map((v) => (
                    <option key={v} value={v}>
                      {PAYER_CREDENTIALING_DOC_STATUS_LABELS[v]}
                    </option>
                  ))}
                </select>
              </li>
            );
          })}
        </ul>
        <button
          type="submit"
          className="rounded-xl border border-violet-600 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-950 hover:bg-violet-100"
        >
          Save document statuses
        </button>
      </form>
    </section>
  );
}
