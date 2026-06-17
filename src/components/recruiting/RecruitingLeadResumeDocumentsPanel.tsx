"use client";

import { formatAppDateTime } from "@/lib/datetime/app-timezone";

export type RecruitingLeadResumeDocumentClientRow = {
  id: string;
  file_name: string;
  uploaded_at: string;
  source: string;
  recruiting_candidate_id: string | null;
};

const rowActionBtnCls =
  "inline-flex h-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-sky-900 shadow-sm transition hover:border-sky-300 hover:bg-sky-50 hover:shadow-md whitespace-nowrap";

function formatWhen(iso: string): string {
  return formatAppDateTime(iso, "—", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function RecruitingLeadResumeDocumentsPanel({
  documents,
}: {
  documents: RecruitingLeadResumeDocumentClientRow[];
}) {
  if (documents.length === 0) {
    return (
      <div className="rounded-[28px] border border-dashed border-slate-200 bg-white/80 px-6 py-8 text-center text-sm text-slate-600 shadow-sm">
        No uploaded resumes linked to this recruiting lead yet.
      </div>
    );
  }

  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">Uploaded resumes</h3>
      <ul className="mt-4 space-y-3">
        {documents.map((doc) => {
          const viewHref = doc.recruiting_candidate_id
            ? `/api/recruiting/resume/${encodeURIComponent(doc.recruiting_candidate_id)}?mode=view`
            : null;
          const downloadHref = doc.recruiting_candidate_id
            ? `/api/recruiting/resume/${encodeURIComponent(doc.recruiting_candidate_id)}?mode=download`
            : null;
          return (
            <li
              key={doc.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/90 bg-slate-50/50 px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium text-slate-900">{doc.file_name}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {formatWhen(doc.uploaded_at)} · {doc.source.replace(/_/g, " ")}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {viewHref ? (
                  <a href={viewHref} target="_blank" rel="noopener noreferrer" className={rowActionBtnCls}>
                    View
                  </a>
                ) : null}
                {downloadHref ? (
                  <a href={downloadHref} className={rowActionBtnCls}>
                    Download
                  </a>
                ) : null}
                {doc.recruiting_candidate_id ? (
                  <a href={`/admin/recruiting/${doc.recruiting_candidate_id}`} className={rowActionBtnCls}>
                    Candidate record
                  </a>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
