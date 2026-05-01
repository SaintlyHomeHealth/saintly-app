"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

type Field = {
  fieldKey: string;
  label: string;
  fieldType: string;
  optional: boolean;
  value: string | boolean | null;
  order: number;
};

type LoadPayload = {
  documentLabel: string;
  documentType: string;
  packetStatus: string;
  fields: Field[];
  w9CertificationText: string | null;
  signedAt: string | null;
};

export default function PublicPdfSignPage() {
  const params = useParams();
  const token = decodeURIComponent(String(params?.token || "")).trim();
  const [data, setData] = useState<LoadPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [values, setValues] = useState<Record<string, string | boolean>>({});

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/pdf-sign/recipient/${encodeURIComponent(token)}`);
      const j = (await res.json()) as LoadPayload & { error?: string };
      if (cancelled) return;
      if (!res.ok) {
        setErr(j.error || "Could not load document.");
        return;
      }
      setData(j);
      const init: Record<string, string | boolean> = {};
      for (const f of j.fields) {
        if (f.fieldType === "checkbox") {
          init[f.fieldKey] = Boolean(f.value === true || f.value === "true");
        } else {
          init[f.fieldKey] = typeof f.value === "string" ? f.value : "";
        }
      }
      setValues(init);
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const sortedFields = useMemo(() => {
    if (!data) return [];
    return [...data.fields].sort((a, b) => a.order - b.order);
  }, [data]);

  async function saveDraft() {
    if (!token) return;
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/pdf-sign/recipient/${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ values, finalize: false }),
    });
    const j = (await res.json()) as { error?: string };
    if (!res.ok) setErr(j.error || "Save failed.");
    setBusy(false);
  }

  async function finalize(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/pdf-sign/recipient/${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ values, finalize: true }),
    });
    const j = (await res.json()) as { error?: string };
    if (!res.ok) {
      setErr(j.error || "Could not complete signing.");
      setBusy(false);
      return;
    }
    const reload = await fetch(`/api/pdf-sign/recipient/${encodeURIComponent(token)}`);
    const jj = (await reload.json()) as LoadPayload;
    setData(jj);
    setBusy(false);
  }

  if (!token) return <div className="p-8 text-center text-slate-600">Invalid link.</div>;
  if (err && !data) return <div className="p-8 text-center text-red-700">{err}</div>;
  if (!data) return <div className="p-8 text-center text-slate-600">Loading…</div>;

  if (data.signedAt || data.packetStatus === "completed") {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-xl font-semibold text-slate-900">Thank you</h1>
        <p className="mt-2 text-sm text-slate-600">Your signed document has been submitted.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-xl bg-slate-50 px-4 py-10">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">{data.documentLabel}</h1>
        <p className="mt-1 text-xs text-slate-500">Sign in order. TIN/SSN is encrypted when saved.</p>

        <form onSubmit={finalize} className="mt-6 space-y-4">
          {sortedFields.map((f) => {
            if (f.fieldType === "checkbox") {
              return (
                <label key={f.fieldKey} className="flex items-start gap-2 text-sm text-slate-800">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={Boolean(values[f.fieldKey])}
                    onChange={(e) => setValues((v) => ({ ...v, [f.fieldKey]: e.target.checked }))}
                  />
                  <span>{f.label}</span>
                </label>
              );
            }
            if (f.fieldType === "textarea") {
              return (
                <label key={f.fieldKey} className="block text-sm text-slate-800">
                  <span className="text-xs font-semibold text-slate-600">{f.label}</span>
                  <textarea
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    rows={3}
                    value={String(values[f.fieldKey] ?? "")}
                    autoComplete="off"
                    onChange={(e) => setValues((v) => ({ ...v, [f.fieldKey]: e.target.value }))}
                  />
                </label>
              );
            }
            const type =
              f.fieldType === "date" ? "date" : f.fieldType === "tin" ? "password" : "text";
            return (
              <label key={f.fieldKey} className="block text-sm text-slate-800">
                <span className="text-xs font-semibold text-slate-600">{f.label}</span>
                <input
                  type={type}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={String(values[f.fieldKey] ?? "")}
                  autoComplete={f.fieldType === "tin" ? "off" : undefined}
                  onChange={(e) => setValues((v) => ({ ...v, [f.fieldKey]: e.target.value }))}
                />
              </label>
            );
          })}

          {data.documentType === "w9" && data.w9CertificationText ? (
            <section className="rounded-lg border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-950">
              <div className="font-semibold">Certification (read carefully)</div>
              <p className="mt-2 whitespace-pre-wrap">{data.w9CertificationText}</p>
            </section>
          ) : null}

          {err ? <p className="text-sm text-red-700">{err}</p> : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void saveDraft()}
              disabled={busy}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
            >
              Save progress
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              Sign &amp; submit
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
