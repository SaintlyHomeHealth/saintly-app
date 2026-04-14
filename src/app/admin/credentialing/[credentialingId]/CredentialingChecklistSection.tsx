import { updatePayerCredentialingDocuments } from "../actions";
import {
  PAYER_CREDENTIALING_DOC_LABELS,
  PAYER_CREDENTIALING_DOC_STATUS_LABELS,
  PAYER_CREDENTIALING_DOC_STATUS_VALUES,
  PAYER_CREDENTIALING_DOC_TYPES,
  type PayerCredentialingDocType,
} from "@/lib/crm/credentialing-documents";
import { formatCredentialingDateTime } from "@/lib/crm/credentialing-datetime";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const CARD_SHELL =
  "rounded-[28px] border border-slate-200/90 bg-gradient-to-b from-white to-slate-50/90 shadow-[0_1px_3px_rgba(15,23,42,0.06)] ring-1 ring-slate-200/60";

type DocRow = {
  id: string;
  doc_type: string;
  status: string;
  uploaded_at: string | null;
  notes: string | null;
};

function sortDocsByCatalog(docs: DocRow[]): DocRow[] {
  const order = new Map(PAYER_CREDENTIALING_DOC_TYPES.map((t, i) => [t, i]));
  return [...docs].sort((a, b) => {
    const ia = order.get(a.doc_type as PayerCredentialingDocType) ?? 99;
    const ib = order.get(b.doc_type as PayerCredentialingDocType) ?? 99;
    return ia - ib;
  });
}

export async function CredentialingChecklistSection({ credentialingId }: { credentialingId: string }) {
  const supabase = await createServerSupabaseClient();
  const id = credentialingId.trim();

  const { data: rawDocs } = await supabase
    .from("payer_credentialing_documents")
    .select("id, doc_type, status, uploaded_at, notes")
    .eq("credentialing_record_id", id);

  const documents = sortDocsByCatalog((rawDocs ?? []) as DocRow[]);

  if (documents.length === 0) {
    return (
      <div className={`${CARD_SHELL} p-5 text-sm text-slate-600`}>
        Document checklist will appear after migrations add{" "}
        <span className="font-mono text-xs">payer_credentialing_documents</span>.
      </div>
    );
  }

  let missing = 0;
  for (const d of documents) {
    if (d.status === "missing") missing += 1;
  }

  return (
    <details
      id="credentialing-checklist"
      className={`group scroll-mt-28 ${CARD_SHELL} bg-white`}
      open={missing > 0}
    >
      <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
        Document checklist
        <span className="ml-2 font-normal text-slate-500">
          ({documents.length} items{missing ? ` · ${missing} missing` : ""})
        </span>
      </summary>
      <div className="border-t border-slate-100 px-5 pb-6 pt-2">
        <form id="credentialing-checklist-form" action={updatePayerCredentialingDocuments} className="space-y-4">
          <input type="hidden" name="credentialing_id" value={credentialingId} />
          <p className="text-xs text-slate-600">
            Structured enrollment checklist. Files live in{" "}
            <span className="font-semibold text-slate-800">Additional documents</span> below — use View / Replace to jump
            there.
          </p>
          <div className="overflow-x-auto rounded-2xl border border-slate-100">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="px-3 py-2">Document</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Uploaded</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((d) => {
                  const label =
                    PAYER_CREDENTIALING_DOC_LABELS[d.doc_type as PayerCredentialingDocType] ?? d.doc_type;
                  const docMissing = d.status === "missing";
                  const rowTone = docMissing ? "bg-red-50/90" : d.status === "uploaded" ? "bg-emerald-50/35" : "";
                  return (
                    <tr key={d.id} className={`border-b border-slate-50 last:border-0 ${rowTone}`}>
                      <td className="px-3 py-2">
                        <span className="font-medium text-slate-900">{label}</span>
                        {docMissing ? (
                          <span className="ml-2 inline-flex rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-900">
                            Needed
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        <select
                          name={`doc_status_${d.id}`}
                          className="w-full max-w-[220px] rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                          defaultValue={d.status}
                        >
                          {PAYER_CREDENTIALING_DOC_STATUS_VALUES.map((v) => (
                            <option key={v} value={v}>
                              {PAYER_CREDENTIALING_DOC_STATUS_LABELS[v]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-600">
                        {d.uploaded_at ? formatCredentialingDateTime(d.uploaded_at) : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <a
                            href="#credentialing-additional-docs"
                            className="inline-flex rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-800 hover:bg-slate-50"
                          >
                            View
                          </a>
                          <a
                            href="#credentialing-additional-docs"
                            className="inline-flex rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] font-semibold text-sky-900 hover:bg-sky-100"
                          >
                            Replace
                          </a>
                          <label className="inline-flex items-center gap-1 text-[11px] text-slate-600">
                            <input type="checkbox" name={`doc_uploaded_now_${d.id}`} value="1" className="rounded border-slate-300" />
                            Stamp now
                          </label>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button
            type="submit"
            className="rounded-xl border border-violet-600 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-950 hover:bg-violet-100"
          >
            Save document statuses
          </button>
        </form>
      </div>
    </details>
  );
}

export function CredentialingChecklistSectionFallback() {
  return <div className={`${CARD_SHELL} h-48 animate-pulse bg-slate-100/90 p-5`} />;
}
