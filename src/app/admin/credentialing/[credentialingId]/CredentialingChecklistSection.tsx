import Link from "next/link";

import {
  PAYER_CREDENTIALING_DOC_LABELS,
  PAYER_CREDENTIALING_DOC_TYPES,
  type PayerCredentialingDocType,
} from "@/lib/crm/credentialing-documents";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const CARD_SHELL =
  "rounded-[28px] border border-slate-200/90 bg-gradient-to-b from-white to-slate-50/90 shadow-[0_1px_3px_rgba(15,23,42,0.06)] ring-1 ring-slate-200/60";

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

function isDocDone(status: string): boolean {
  return status === "uploaded" || status === "not_applicable";
}

export async function CredentialingChecklistSection({ credentialingId }: { credentialingId: string }) {
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
        Document checklist will appear after{" "}
        <span className="font-mono text-xs">payer_credentialing_documents</span> is available for this record.
      </div>
    );
  }

  return (
    <section className={`${CARD_SHELL} bg-white p-5 sm:p-6`}>
      <h2 className="text-sm font-semibold text-slate-900">Document check</h2>
      <p className="mt-1 text-xs text-slate-500">
        Required items only.{" "}
        <Link
          href={`/admin/credentialing/${encodeURIComponent(id)}/edit#documents`}
          className="font-semibold text-sky-800 underline-offset-2 hover:underline"
        >
          Edit statuses
        </Link>{" "}
        on the edit page if something should be N/A or uploaded without a file here.
      </p>

      <ul className="mt-4 space-y-2">
        {documents.map((d) => {
          const label =
            PAYER_CREDENTIALING_DOC_LABELS[d.doc_type as PayerCredentialingDocType] ?? d.doc_type;
          const done = isDocDone(d.status);
          return (
            <li
              key={d.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/50 px-3 py-2.5"
            >
              <span className="min-w-0 text-sm font-medium text-slate-900">{label}</span>
              <span className="shrink-0 text-lg" aria-label={done ? "Complete" : "Incomplete"}>
                {done ? "✅" : "❌"}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 flex flex-wrap gap-2">
        <a
          href="#credentialing-uploaded-attachments"
          className="inline-flex items-center rounded-xl border border-slate-800 bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
        >
          Upload attachments
        </a>
      </div>
    </section>
  );
}

export function CredentialingChecklistSectionFallback() {
  return <div className={`${CARD_SHELL} h-48 animate-pulse bg-slate-100/90 p-5`} />;
}
