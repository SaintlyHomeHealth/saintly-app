"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function TemplateRowActions({
  templateId,
  archived,
}: {
  templateId: string;
  archived: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function archive() {
    if (!confirm("Archive this template? It will be hidden from the templates list.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/pdf-sign/admin/templates/${encodeURIComponent(templateId)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        alert(j.error || "Could not archive template.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    setBusy(true);
    try {
      const res = await fetch(`/api/pdf-sign/admin/templates/${encodeURIComponent(templateId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: true }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        alert(j.error || "Could not restore template.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
      <Link
        href={`/admin/signatures/templates/${encodeURIComponent(templateId)}`}
        className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
      >
        Edit fields
      </Link>
      <Link
        href={`/api/pdf-sign/admin/templates/${encodeURIComponent(templateId)}/pdf`}
        target="_blank"
        rel="noreferrer"
        className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
      >
        Preview PDF
      </Link>
      {!archived ? (
        <Link
          href={`/admin/signatures/send?templateId=${encodeURIComponent(templateId)}`}
          className="rounded-full bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
        >
          Use template
        </Link>
      ) : null}
      {archived ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void restore()}
          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
        >
          Restore
        </button>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => void archive()}
          className="rounded-full border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
        >
          Archive
        </button>
      )}
    </div>
  );
}
