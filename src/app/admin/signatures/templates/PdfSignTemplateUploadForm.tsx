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
    setStatus(`Saved template ${j.templateId || ""}.`);
    form.reset();
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      <div>
        <label className="text-xs font-semibold uppercase text-slate-600">PDF file</label>
        <input name="file" type="file" accept="application/pdf" className="mt-1 block w-full text-sm" required />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="text-xs font-semibold uppercase text-slate-600">Display name</label>
          <input name="name" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" required />
        </div>
        <div>
          <label className="text-xs font-semibold uppercase text-slate-600">Document type</label>
          <select
            name="documentType"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            required
          >
            <option value="w9">W-9</option>
            <option value="generic_contract">Generic / IC agreement</option>
            <option value="i9">I-9</option>
          </select>
        </div>
      </div>
      <div>
        <label className="text-xs font-semibold uppercase text-slate-600">Field map (JSON)</label>
        <p className="mt-1 text-xs text-slate-500">
          Map AcroForm field names via <code className="rounded bg-slate-100 px-1">pdf_acroform_field_name</code>, or
          omit and use x/y from bottom-left once you measure coordinates.
        </p>
        <textarea
          value={fieldsJson}
          onChange={(e) => setFieldsJson(e.target.value)}
          rows={14}
          className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs"
        />
      </div>
      <button
        type="submit"
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
      >
        Upload template
      </button>
      {status ? <p className="text-sm text-slate-700">{status}</p> : null}
    </form>
  );
}
