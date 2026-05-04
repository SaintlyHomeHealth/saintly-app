"use client";

import { useCallback, useState } from "react";

type ExportMarketingEmailsButtonProps = {
  /** Path only, e.g. `/admin/crm/leads/export-emails` */
  exportPath: string;
  label?: string;
  /** Query keys removed before export (list UI-only params). */
  omitSearchKeys?: readonly string[];
  className?: string;
};

export function ExportMarketingEmailsButton({
  exportPath,
  label = "Export Emails",
  omitSearchKeys = ["page", "density", "toast"],
  className,
}: ExportMarketingEmailsButtonProps) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const onClick = useCallback(() => {
    setNotice(null);
    void (async () => {
      setBusy(true);
      try {
        const u = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
        for (const k of omitSearchKeys) u.delete(k);
        const qs = u.toString();
        const url = qs ? `${exportPath}?${qs}` : exportPath;

        const res = await fetch(url, { method: "GET", credentials: "same-origin" });
        const ct = res.headers.get("Content-Type") ?? "";

        if (res.status === 404) {
          try {
            const j = (await res.json()) as { message?: string };
            setNotice(typeof j.message === "string" ? j.message : "No emails found for current filters");
          } catch {
            setNotice("No emails found for current filters");
          }
          return;
        }

        if (!res.ok) {
          setNotice("Export failed. Try again.");
          return;
        }

        if (!ct.includes("text/csv")) {
          setNotice("Unexpected response from export.");
          return;
        }

        const blob = await res.blob();
        const cd = res.headers.get("Content-Disposition") ?? "";
        const m = /filename="([^"]+)"/i.exec(cd);
        const fallback =
          exportPath.includes("recruit") ? `recruits_emails_${new Date().toISOString().slice(0, 10)}.csv` : `leads_emails_${new Date().toISOString().slice(0, 10)}.csv`;
        const filename = m?.[1] ?? fallback;

        const objUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = objUrl;
        a.download = filename;
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(objUrl);
      } catch {
        setNotice("Export failed. Try again.");
      } finally {
        setBusy(false);
      }
    })();
  }, [exportPath, omitSearchKeys]);

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className={
          className ??
          "inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        }
      >
        {busy ? "Exporting…" : label}
      </button>
      {notice ? <span className="text-xs text-amber-800">{notice}</span> : null}
    </div>
  );
}
