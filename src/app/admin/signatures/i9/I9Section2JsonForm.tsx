"use client";

import { type FormEvent, useState } from "react";

export function I9Section2JsonForm({ i9CaseId }: { i9CaseId: string }) {
  const [json, setJson] = useState(
    '{\n  "employer_business_name": "Saintly Home Health",\n  "employer_attestation": "true"\n}'
  );
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    let values: Record<string, string>;
    try {
      values = JSON.parse(json) as Record<string, string>;
    } catch {
      setMsg("Invalid JSON.");
      return;
    }
    const res = await fetch("/api/pdf-sign/admin/i9/section2", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ i9CaseId, values }),
    });
    const j = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok) {
      setMsg(j.error || "Failed.");
      return;
    }
    setMsg("Section 2 saved and final PDF generated.");
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
      <div className="text-xs font-semibold text-amber-900">Complete Section 2 (JSON field map)</div>
      <p className="text-xs text-amber-900/80">
        Keys must match <code className="rounded bg-white/80 px-1">field_key</code> values on your I-9 template for
        employer fields.
      </p>
      <textarea
        className="w-full rounded border border-amber-200 bg-white px-2 py-1 font-mono text-xs"
        rows={6}
        value={json}
        onChange={(e) => setJson(e.target.value)}
      />
      <button
        type="submit"
        className="rounded bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
      >
        Save Section 2 &amp; render final PDF
      </button>
      {msg ? <p className="text-xs text-slate-800">{msg}</p> : null}
    </form>
  );
}
