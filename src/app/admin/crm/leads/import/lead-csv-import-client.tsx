"use client";

import Link from "next/link";
import { useState } from "react";

import { facebookCsvRowToFieldMap, mapHeaderToCanonical } from "@/lib/crm/facebook-csv-column-map";
import { parseSpreadsheet } from "@/lib/crm/parse-csv";

import { importCrmLeadsFromCsv, type CsvImportResult } from "./actions";

export function LeadCsvImportClient() {
  const [previewRows, setPreviewRows] = useState<string[][] | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [result, setResult] = useState<CsvImportResult | null>(null);
  const [pending, setPending] = useState(false);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) {
      setPreviewRows(null);
      setHeaders([]);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const buf = reader.result;
      if (!(buf instanceof ArrayBuffer)) {
        setHeaders([]);
        setPreviewRows(null);
        return;
      }
      const { headers: h, rows } = parseSpreadsheet(buf);
      setHeaders(h);
      setPreviewRows(rows.slice(0, 10));
    };
    reader.readAsArrayBuffer(f);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setResult(null);
    const fd = new FormData(e.currentTarget);
    const r = await importCrmLeadsFromCsv(fd);
    setPending(false);
    setResult(r);
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600">
        Upload a Facebook Lead Ads export (CSV). Rows use the same pipeline as Zapier/Facebook automation:{" "}
        <code className="rounded bg-slate-100 px-1">source=facebook</code>,{" "}
        <code className="rounded bg-slate-100 px-1">external_source_metadata</code> with intake + disciplines.
      </p>

      <form onSubmit={onSubmit} className="space-y-4">
        <label className="block text-sm font-medium text-slate-700">
          CSV file
          <input
            type="file"
            name="csvFile"
            accept=".csv,text/csv"
            required
            onChange={onFileChange}
            className="mt-1 block w-full max-w-md text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-sky-600 bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
        >
          {pending ? "Importing…" : "Import leads"}
        </button>
      </form>

      {headers.length > 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Preview (first 10 data rows)</p>
          <p className="mt-1 text-xs text-slate-500">
            Headers normalized to canonical keys where known (e.g. &quot;Full Name&quot; → full_name).
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200">
                  {headers.map((h, hi) => (
                    <th key={`h-${hi}-${h}`} className="max-w-[10rem] whitespace-normal px-2 py-1 font-semibold text-slate-700">
                      <span className="block">{h}</span>
                      <span className="font-normal text-slate-500">→ {mapHeaderToCanonical(h)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(previewRows ?? []).map((row, ri) => (
                  <tr key={`r-${ri}`} className="border-b border-slate-100">
                    {headers.map((_, ci) => (
                      <td key={`c-${ri}-${ci}`} className="max-w-[10rem] truncate px-2 py-1 text-slate-800" title={row[ci] ?? ""}>
                        {row[ci] ?? ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {previewRows && previewRows.length > 0 ? (
            <p className="mt-2 text-xs text-slate-500">
              Sample mapped fields (row 1):{" "}
              {Array.from(facebookCsvRowToFieldMap(headers, previewRows[0] ?? []).entries())
                .map(([k, v]) => `${k}=${v}`)
                .join(" · ") || "—"}
            </p>
          ) : null}
        </div>
      ) : null}

      {result ? (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            result.ok ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-rose-200 bg-rose-50 text-rose-900"
          }`}
        >
          {result.ok ? (
            <p>
              Created <strong>{result.created}</strong>, skipped <strong>{result.skipped}</strong> (empty:{" "}
              {result.skippedEmpty}, duplicates: {result.skippedDuplicate}, errors: {result.skippedError}).
            </p>
          ) : (
            <p>Import failed: {result.error ?? "unknown"}</p>
          )}
        </div>
      ) : null}

      <p className="text-sm">
        <Link href="/admin/crm/leads" className="font-semibold text-sky-800 hover:underline">
          ← Back to leads
        </Link>
      </p>
    </div>
  );
}
