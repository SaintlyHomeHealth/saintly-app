"use client";

import { type FormEvent, useState } from "react";

const DEFAULT_W9_FIELDS = `[
  {"field_key":"w9_name","label":"Name (as shown on your income tax return)","field_type":"text","required_order":10,"page_index":0},
  {"field_key":"w9_business_name","label":"Business name / disregarded entity name","field_type":"text","required_order":20,"page_index":0,"options":{"optional":true}},
  {"field_key":"w9_federal_tax_classification","label":"Federal tax classification","field_type":"text","required_order":30,"page_index":0},
  {"field_key":"w9_address","label":"Address (number, street, and apt. or suite no.)","field_type":"text","required_order":40,"page_index":0},
  {"field_key":"w9_city_state_zip","label":"City, state, and ZIP","field_type":"text","required_order":50,"page_index":0},
  {"field_key":"w9_tin","label":"Taxpayer identification number (SSN or EIN)","field_type":"tin","required_order":60,"page_index":0},
  {"field_key":"w9_certification_ack","label":"I certify under penalties of perjury that the information is correct","field_type":"checkbox","required_order":70,"page_index":0},
  {"field_key":"w9_signature_name","label":"Signature of U.S. person","field_type":"signature","required_order":80,"page_index":0},
  {"field_key":"w9_signed_date","label":"Date","field_type":"date","required_order":90,"page_index":0}
]`;

export function PdfSignTemplateUploadForm() {
  const [status, setStatus] = useState<string | null>(null);
  const [fieldsJson, setFieldsJson] = useState(DEFAULT_W9_FIELDS);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus(null);
    const form = e.currentTarget;
    const formData = new FormData(form);
    const file = formData.get("file") as File | null;
    if (!file || file.size === 0) {
      setStatus("Choose a PDF file.");
      return;
    }
    formData.set("fieldsJson", fieldsJson);
    const res = await fetch("/api/pdf-sign/admin/upload-template", {
      method: "POST",
      body: formData,
    });
    const j = (await res.json()) as { ok?: boolean; error?: string; templateId?: string };
    if (!res.ok) {
      setStatus(j.error || "Upload failed.");
      return;
    }
    setStatus(`Saved. You can open “Edit fields” from the list above.`);
    form.reset();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="text-sm font-medium text-slate-800">PDF file</label>
        <input
          name="file"
          type="file"
          accept="application/pdf"
          className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-sky-50 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-sky-900"
          required
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-sm font-medium text-slate-800">Template name</label>
          <input
            name="name"
            className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm shadow-sm"
            placeholder="e.g. W-9 2024"
            required
          />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-800">Document type</label>
          <select
            name="documentType"
            className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm shadow-sm"
            required
          >
            <option value="w9">W-9</option>
            <option value="generic_contract">Contract / agreement</option>
            <option value="i9">I-9</option>
          </select>
        </div>
      </div>

      <details className="group rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 shadow-inner">
        <summary className="cursor-pointer list-none text-sm font-semibold text-slate-800 [&::-webkit-details-marker]:hidden">
          <span className="flex items-center justify-between gap-2">
            Advanced upload options
            <span className="text-xs font-normal text-slate-500">Field map JSON — optional</span>
          </span>
        </summary>
        <p className="mt-3 text-xs leading-relaxed text-slate-600">
          Most teams skip this and place fields visually after upload. Use only if you are mapping IRS AcroForm names
          or importing coordinates.
        </p>
        <textarea
          value={fieldsJson}
          onChange={(e) => setFieldsJson(e.target.value)}
          rows={10}
          className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-[11px] leading-relaxed text-slate-800 shadow-sm"
          spellCheck={false}
        />
      </details>

      <button
        type="submit"
        className="w-full rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 px-4 py-3 text-sm font-semibold text-amber-950 shadow-md shadow-amber-500/25 transition hover:from-amber-500 hover:to-amber-600 sm:w-auto sm:px-10"
      >
        Upload template
      </button>
      {status ? <p className="text-sm text-slate-700">{status}</p> : null}
    </form>
  );
}
