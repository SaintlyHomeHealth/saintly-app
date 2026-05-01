"use client";

import { type FormEvent, useEffect, useState } from "react";

type Template = { id: string; name: string; document_type: string };

export function EmployeePdfSignActions({
  applicantId,
  defaultEmail,
  isAdmin,
}: {
  applicantId: string;
  defaultEmail: string;
  isAdmin: boolean;
}) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [email, setEmail] = useState(defaultEmail || "");
  const [name, setName] = useState("");
  const [ttl, setTtl] = useState(14);
  const [sendMail, setSendMail] = useState(false);
  const [icAgreement, setIcAgreement] = useState(false);
  const [review, setReview] = useState("in_person_physical_review");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/pdf-sign/admin/templates");
      const j = (await res.json()) as { templates?: Template[] };
      if (!cancelled && res.ok && j.templates) {
        setTemplates(j.templates);
        if (j.templates[0]) setTemplateId(j.templates[0].id);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function createPacket(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    const selected = templates.find((t) => t.id === templateId);
    const res = await fetch("/api/pdf-sign/admin/create-packet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateId,
        crmEntityType: "applicant",
        crmEntityId: applicantId,
        recipientEmail: email,
        recipientName: name || null,
        ttlDays: ttl,
        sendEmail: sendMail,
        marksIcAgreement: icAgreement && selected?.document_type !== "i9",
        i9ReviewMethod: selected?.document_type === "i9" ? review : null,
      }),
    });
    const j = (await res.json()) as { ok?: boolean; error?: string; signUrl?: string; emailError?: string | null };
    if (!res.ok) {
      setMsg(j.error || "Could not create packet.");
      return;
    }
    const lines = [`Packet created.`];
    if (j.signUrl) lines.push(`Link: ${j.signUrl}`);
    if (j.emailError) lines.push(`Email: ${j.emailError}`);
    setMsg(lines.join(" "));
  }

  const selected = templates.find((t) => t.id === templateId);

  if (loading) return <p className="text-sm text-slate-600">Loading templates…</p>;

  return (
    <form onSubmit={createPacket} className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-sm font-semibold text-slate-900">Send document</div>
      <div className="grid gap-2 md:grid-cols-2">
        <label className="text-xs text-slate-600">
          Template
          <select
            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.document_type})
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-600">
          Expires in (days)
          <input
            type="number"
            min={1}
            max={90}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            value={ttl}
            onChange={(e) => setTtl(Number(e.target.value))}
          />
        </label>
        <label className="text-xs text-slate-600">
          Signer email
          <input
            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label className="text-xs text-slate-600">
          Signer name (optional)
          <input
            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
      </div>
      {selected?.document_type === "i9" && isAdmin ? (
        <label className="block text-xs text-slate-600">
          I-9 review method
          <select
            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            value={review}
            onChange={(e) => setReview(e.target.value)}
          >
            <option value="in_person_physical_review">In-person physical document review</option>
            <option value="remote_alternative_procedure_everify">
              Remote — alternative procedure / E-Verify
            </option>
          </select>
        </label>
      ) : null}
      {selected?.document_type !== "i9" ? (
        <label className="flex items-center gap-2 text-xs text-slate-700">
          <input type="checkbox" checked={icAgreement} onChange={(e) => setIcAgreement(e.target.checked)} />
          Treat as IC agreement (marks audit + applicant file naming when complete)
        </label>
      ) : null}
      <label className="flex items-center gap-2 text-xs text-slate-700">
        <input type="checkbox" checked={sendMail} onChange={(e) => setSendMail(e.target.checked)} />
        Email secure link (never attaches completed PDFs)
      </label>
      <button
        type="submit"
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
      >
        Create packet &amp; link
      </button>
      {msg ? <p className="text-xs text-slate-800">{msg}</p> : null}
    </form>
  );
}
