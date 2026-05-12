"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { SignaturePadModal } from "@/app/sign/[token]/SignaturePadModal";
import { PDF_SIGN_COMPANY_NAME } from "@/lib/pdf-sign/constants";
import {
  senderAssignableTemplateFields,
  validateSenderPrefillAgainstTemplate,
} from "@/lib/pdf-sign/validate-sender-prefill";

type TemplateRow = {
  id: string;
  name: string;
  document_type: string;
  version: number;
  is_active: boolean;
};

type TemplateFieldRow = {
  id: string;
  field_key: string;
  label: string;
  field_type: string;
  signer_role: string | null;
  required: boolean | null;
  options: Record<string, unknown> | null;
  prefill_value: string | null;
};

type RecipientRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
};

const DOC_LABEL: Record<string, string> = {
  generic_contract: "Contract / agreement",
  w9: "W-9",
  i9: "I-9",
};

const CRM_OPTIONS: { value: string; label: string; hint: string }[] = [
  { value: "applicant", label: "Applicant / new hire", hint: "Use the UUID from hiring / onboarding." },
  { value: "lead", label: "Lead", hint: "Lead record in CRM." },
  { value: "contact", label: "Patient / contact", hint: "Contact record UUID." },
  { value: "vendor", label: "Vendor", hint: "Vendor record when applicable." },
];

const STEPS = [
  { n: 1, title: "Choose template", subtitle: "Pick the PDF to send." },
  { n: 2, title: "Recipient information", subtitle: "Who will sign and which record to attach." },
  { n: 3, title: "Message & options", subtitle: "Optional note and internal settings." },
  { n: 4, title: "Review & send", subtitle: "Confirm and issue the signing link." },
] as const;

function genRowId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `r-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function applyAutofillForSenderField(field: TemplateFieldRow, ctx: { senderName: string }): string {
  const opts = field.options || {};
  switch ((opts as { autofill_source?: string }).autofill_source) {
    case "today_date":
      return todayIso();
    case "sender_name":
      return ctx.senderName;
    case "company_name":
      return PDF_SIGN_COMPANY_NAME;
    default:
      return field.prefill_value?.trim() || "";
  }
}

export function SendPacketForm({
  initialTemplateId,
  senderDisplayName,
}: {
  initialTemplateId: string | null;
  senderDisplayName: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState(1);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [templateId, setTemplateId] = useState("");
  const [templateFields, setTemplateFields] = useState<TemplateFieldRow[]>([]);
  const [fieldsBusy, setFieldsBusy] = useState(false);

  const [crmEntityType, setCrmEntityType] = useState("applicant");
  const [crmEntityId, setCrmEntityId] = useState("");
  const [recipients, setRecipients] = useState<RecipientRow[]>(() => [
    { id: genRowId(), name: "", email: "", phone: "" },
  ]);

  const [ttlDays, setTtlDays] = useState(14);
  const [sendEmail, setSendEmail] = useState(true);
  const [message, setMessage] = useState("");
  const [smsRequested, setSmsRequested] = useState(false);
  const [i9ReviewMethod, setI9ReviewMethod] = useState<string>("");
  const [marksIc, setMarksIc] = useState(false);

  const [senderValues, setSenderValues] = useState<Record<string, string | boolean>>({});
  const [senderSignatures, setSenderSignatures] = useState<Record<string, string>>({});
  const [activeSenderSigField, setActiveSenderSigField] = useState<TemplateFieldRow | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === templateId) ?? null,
    [templates, templateId]
  );

  const templateModels = useMemo(
    () =>
      templateFields.map((f) => ({
        field_key: f.field_key,
        label: f.label,
        field_type: f.field_type,
        signer_role: f.signer_role,
        options: f.options,
        required: f.required,
      })),
    [templateFields]
  );

  const senderSideFields = useMemo(() => senderAssignableTemplateFields(templateModels), [templateModels]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingTemplates(true);
      try {
        const res = await fetch("/api/pdf-sign/admin/templates", { cache: "no-store" });
        const j = (await res.json()) as { templates?: TemplateRow[]; error?: string };
        if (!res.ok) {
          if (!cancelled) setError(j.error || "Could not load templates.");
          return;
        }
        if (!cancelled) setTemplates(j.templates ?? []);
      } finally {
        if (!cancelled) setLoadingTemplates(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!templateId) {
      setTemplateFields([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setFieldsBusy(true);
      try {
        const res = await fetch(`/api/pdf-sign/admin/templates/${encodeURIComponent(templateId)}`, {
          cache: "no-store",
        });
        const j = (await res.json()) as { fields?: TemplateFieldRow[] };
        if (!cancelled) setTemplateFields(res.ok ? j.fields ?? [] : []);
      } finally {
        if (!cancelled) setFieldsBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [templateId]);

  useEffect(() => {
    if (senderSideFields.length === 0) return;
    setSenderValues((prev) => {
      const next = { ...prev };
      const ctx = { senderName: senderDisplayName.trim() || "Saintly representative" };
      for (const f of senderSideFields) {
        if (f.field_type === "checkbox") {
          if (typeof next[f.field_key] !== "boolean") next[f.field_key] = false;
          continue;
        }
        if (f.field_type === "signature" || f.field_type === "initials") continue;
        if (next[f.field_key] === undefined || next[f.field_key] === "") {
          next[f.field_key] = applyAutofillForSenderField(f, ctx);
        }
      }
      return next;
    });
  }, [senderSideFields, senderDisplayName]);

  const applyInitial = useCallback(() => {
    const q =
      initialTemplateId ||
      (typeof searchParams.get === "function" ? searchParams.get("templateId") : null);
    if (q) setTemplateId(q);
  }, [initialTemplateId, searchParams]);

  useEffect(() => {
    applyInitial();
  }, [applyInitial]);

  const primarySigningRecipients = useMemo(
    () => recipients.filter((r) => r.email.trim().includes("@")),
    [recipients]
  );

  function validateStep(cur: number): string | null {
    if (cur === 1) {
      if (!templateId) return "Select a template.";
      return null;
    }
    if (cur === 2) {
      if (!crmEntityId.trim()) return "Record ID is required.";
      const filled = recipients.filter((r) => r.email.trim());
      if (filled.length === 0) return "At least one recipient email is required.";
      for (const r of filled) {
        if (!r.email.trim().includes("@")) return `Invalid email for ${r.name || r.email || "recipient"}.`;
      }
      if (smsRequested && !filled[0]?.phone.trim()) {
        return "Primary recipient phone is required when SMS delivery is requested.";
      }
      return null;
    }
    return null;
  }

  function goNext() {
    const msg = validateStep(step);
    if (msg) {
      setError(msg);
      return;
    }
    setError(null);
    setStep((s) => Math.min(4, s + 1));
  }

  function goBack() {
    setError(null);
    setStep((s) => Math.max(1, s - 1));
  }

  function updateRecipient(id: string, patch: Partial<RecipientRow>) {
    setRecipients((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function addRecipient() {
    setRecipients((prev) => [...prev, { id: genRowId(), name: "", email: "", phone: "" }]);
  }

  function removeRecipient(id: string) {
    setRecipients((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.id !== id)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (step !== 4) return;
    setError(null);
    const v = validateStep(2);
    if (v || !templateId) {
      setError(v || "Select a template.");
      return;
    }

    const precheck = validateSenderPrefillAgainstTemplate({
      templateFields: templateModels,
      senderValues,
      senderSignatureImages: senderSignatures,
    });
    if (precheck) {
      setError(precheck);
      return;
    }

    const filledRecipients = recipients
      .map((r) => ({
        name: r.name.trim() || undefined,
        email: r.email.trim().toLowerCase(),
        phone: r.phone.trim() || undefined,
      }))
      .filter((r) => r.email.includes("@"));

    setBusy(true);
    try {
      const res = await fetch("/api/pdf-sign/admin/create-packet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId,
          crmEntityType,
          crmEntityId: crmEntityId.trim(),
          recipients: filledRecipients,
          ttlDays,
          sendEmail,
          marksIcAgreement: marksIc,
          i9ReviewMethod: selectedTemplate?.document_type === "i9" ? i9ReviewMethod || null : null,
          message: message.trim() || undefined,
          smsRequested,
          senderValues,
          senderSignatureImages: senderSignatures,
        }),
      });
      const j = (await res.json()) as {
        ok?: boolean;
        error?: string;
        signUrl?: string;
        packetId?: string;
      };
      if (!res.ok) {
        setError(j.error || "Could not create packet.");
        return;
      }
      if (j.packetId) {
        router.push(`/admin/signatures/packets/${encodeURIComponent(j.packetId)}`);
      }
    } finally {
      setBusy(false);
    }
  }

  const recordTypeLabel = CRM_OPTIONS.find((o) => o.value === crmEntityType)?.label ?? crmEntityType;

  return (
    <>
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-8">
        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 shadow-sm">
            {error}
          </div>
        ) : null}

        <nav aria-label="Progress" className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
          <ol className="grid gap-3 sm:grid-cols-4">
            {STEPS.map((s) => {
              const active = step === s.n;
              const done = step > s.n;
              return (
                <li key={s.n} className="flex gap-3">
                  <span
                    className={
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold " +
                      (active
                        ? "bg-amber-400 text-amber-950 ring-2 ring-amber-300/80"
                        : done
                          ? "bg-sky-600 text-white"
                          : "bg-slate-100 text-slate-500")
                    }
                  >
                    {s.n}
                  </span>
                  <div className="min-w-0">
                    <p
                      className={
                        "text-sm font-semibold " + (active ? "text-slate-900" : "text-slate-600")
                      }
                    >
                      {s.title}
                    </p>
                    <p className="hidden text-xs text-slate-500 sm:block">{s.subtitle}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </nav>

        {step === 1 ? (
          <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-md shadow-slate-200/40">
            <h2 className="text-lg font-semibold text-slate-900">Step 1 · Choose template</h2>
            <p className="mt-1 text-sm text-slate-600">
              Templates are managed in{" "}
              <Link
                className="font-semibold text-sky-800 underline-offset-2 hover:underline"
                href="/admin/signatures/templates"
              >
                Templates
              </Link>
              .
            </p>
            <label className="mt-5 block text-sm font-medium text-slate-800">
              Template
              <select
                required
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                className="mt-2 w-full max-w-xl rounded-xl border border-slate-200 px-3 py-2.5 text-sm shadow-sm"
                disabled={loadingTemplates}
              >
                <option value="">{loadingTemplates ? "Loading…" : "Select a template"}</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} · {DOC_LABEL[t.document_type] || t.document_type} · v{t.version}
                  </option>
                ))}
              </select>
            </label>
            {fieldsBusy ? (
              <p className="mt-3 text-xs text-slate-500">Loading template field metadata…</p>
            ) : null}

            {selectedTemplate?.document_type === "i9" ? (
              <label className="mt-5 block text-sm font-medium text-slate-800">
                I-9 Section 1 review method
                <select
                  value={i9ReviewMethod}
                  onChange={(e) => setI9ReviewMethod(e.target.value)}
                  className="mt-2 w-full max-w-xl rounded-xl border border-slate-200 px-3 py-2.5 text-sm shadow-sm"
                >
                  <option value="">Not specified</option>
                  <option value="in_person_physical_review">In-person physical document review</option>
                  <option value="remote_alternative_procedure_everify">
                    Remote (E-Verify / alternative procedure)
                  </option>
                </select>
              </label>
            ) : null}

            <div className="mt-8 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={goNext}
                className="inline-flex rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 px-6 py-2.5 text-sm font-semibold text-amber-950 shadow-md shadow-amber-500/20 hover:from-amber-500 hover:to-amber-600"
              >
                Continue
              </button>
            </div>
          </section>
        ) : null}

        {step === 2 ? (
          <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-md shadow-slate-200/40">
            <h2 className="text-lg font-semibold text-slate-900">Step 2 · Recipient information</h2>
            <p className="mt-1 text-sm text-slate-600">
              The signing email goes to Recipient 1. Additional recipients are stored on the packet for your records
              (they do not receive a separate signing link yet).
            </p>

            <div className="mt-6 space-y-6 max-w-3xl">
              {recipients.map((r, idx) => (
                <div
                  key={r.id}
                  className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4 shadow-sm ring-1 ring-slate-100/70"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Recipient {idx + 1}
                      {idx === 0 ? " · Signs the packet" : ""}
                    </p>
                    {recipients.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => removeRecipient(r.id)}
                        className="text-xs font-semibold text-rose-700 hover:underline"
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <label className="block text-sm font-medium text-slate-800 sm:col-span-2">
                      Full name
                      <input
                        value={r.name}
                        onChange={(e) => updateRecipient(r.id, { name: e.target.value })}
                        autoComplete="name"
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm"
                        placeholder={idx === 0 ? "Primary signer" : ""}
                      />
                    </label>
                    <label className="block text-sm font-medium text-slate-800 sm:col-span-2">
                      Email
                      <input
                        type="email"
                        value={r.email}
                        required={idx === 0}
                        onChange={(e) => updateRecipient(r.id, { email: e.target.value })}
                        autoComplete="email"
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm"
                      />
                    </label>
                    <label className="block text-sm font-medium text-slate-800 sm:col-span-2">
                      Phone{" "}
                      <span className="font-normal text-slate-500">
                        ({idx === 0 ? "used for SMS when enabled" : "optional"})
                      </span>
                      <input
                        value={r.phone}
                        onChange={(e) => updateRecipient(r.id, { phone: e.target.value })}
                        type="tel"
                        autoComplete="tel"
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm"
                        placeholder="+1 ..."
                      />
                    </label>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={addRecipient}
                className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
              >
                + Add recipient
              </button>
            </div>

            <div className="mt-8 border-t border-slate-100 pt-6">
              <p className="text-sm font-medium text-slate-900">Link to your record</p>
              <p className="mt-1 text-sm text-slate-600">
                Paste the UUID from the correct record so this packet stays tied to the right profile.
              </p>
              <div className="mt-4 grid max-w-3xl gap-5 sm:grid-cols-2">
                <label className="block text-sm font-medium text-slate-800 sm:col-span-2">
                  Record type
                  <select
                    value={crmEntityType}
                    onChange={(e) => setCrmEntityType(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm shadow-sm"
                  >
                    {CRM_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <span className="mt-1.5 block text-xs font-normal text-slate-500">
                    {CRM_OPTIONS.find((o) => o.value === crmEntityType)?.hint}
                  </span>
                </label>
                <label className="block text-sm font-medium text-slate-800 sm:col-span-2">
                  Record ID (UUID)
                  <input
                    required
                    value={crmEntityId}
                    onChange={(e) => setCrmEntityId(e.target.value)}
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-mono text-sm shadow-sm"
                  />
                </label>
                <label className="block text-sm font-medium text-slate-800">
                  Signing link expires after (days)
                  <input
                    type="number"
                    min={1}
                    max={90}
                    value={ttlDays}
                    onChange={(e) => setTtlDays(Number(e.target.value))}
                    className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm shadow-sm"
                  />
                </label>
                <label className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3 text-sm font-medium text-slate-800 sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={sendEmail}
                    onChange={(e) => setSendEmail(e.target.checked)}
                    className="mt-1 rounded border-slate-300 text-sky-700"
                  />
                  <span>Email the signing link to Recipient 1 now</span>
                </label>
              </div>
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={goBack}
                className="rounded-2xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
              >
                Back
              </button>
              <button
                type="button"
                onClick={goNext}
                className="inline-flex rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 px-6 py-2.5 text-sm font-semibold text-amber-950 shadow-md shadow-amber-500/20 hover:from-amber-500 hover:to-amber-600"
              >
                Continue
              </button>
            </div>
          </section>
        ) : null}

        {step === 3 ? (
          <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-md shadow-slate-200/40">
            <h2 className="text-lg font-semibold text-slate-900">Step 3 · Message & options</h2>
            <p className="mt-1 text-sm text-slate-600">Optional — add context for your team or the signer.</p>

            <label className="mt-6 block text-sm font-medium text-slate-800">
              Message to signer
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm shadow-sm"
                placeholder="Short note included with the request (optional)."
              />
            </label>

            <label className="mt-5 flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3 text-sm font-medium text-slate-800">
              <input
                type="checkbox"
                checked={smsRequested}
                onChange={(e) => setSmsRequested(e.target.checked)}
                className="mt-1 rounded border-slate-300 text-sky-700"
              />
              <span>
                Also text the signing link to <strong>Recipient 1&apos;s phone</strong> when SMS delivery is enabled
              </span>
            </label>

            <label className="mt-4 flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3 text-sm font-medium text-slate-800">
              <input
                type="checkbox"
                checked={marksIc}
                onChange={(e) => setMarksIc(e.target.checked)}
                className="mt-1 rounded border-slate-300 text-sky-700"
              />
              <span>This packet is for an independent contractor agreement</span>
            </label>

            <div className="mt-8 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={goBack}
                className="rounded-2xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
              >
                Back
              </button>
              <button
                type="button"
                onClick={goNext}
                className="inline-flex rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 px-6 py-2.5 text-sm font-semibold text-amber-950 shadow-md shadow-amber-500/20 hover:from-amber-500 hover:to-amber-600"
              >
                Review
              </button>
            </div>
          </section>
        ) : null}

        {step === 4 ? (
          <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-md shadow-slate-200/40">
            <h2 className="text-lg font-semibold text-slate-900">Step 4 · Review & send</h2>
            <p className="mt-1 text-sm text-slate-600">Confirm everything looks correct before sending.</p>

            {senderSideFields.length > 0 ? (
              <div className="mt-6 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4">
                <h3 className="text-sm font-semibold text-indigo-950">Sender fields</h3>
                <p className="mt-1 text-xs text-indigo-900/90">
                  Complete Saintly-side fields before sending. These values are flattened into the PDF so the signer
                  only finishes their sections.
                </p>
                <div className="mt-4 space-y-4">
                  {senderSideFields.map((f) => {
                    const label = f.label || f.field_key;
                    if (f.field_type === "signature" || f.field_type === "initials") {
                      return (
                        <div key={f.id}>
                          <p className="text-xs font-semibold text-slate-700">{label}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            {senderSignatures[f.field_key] ? (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img
                                src={senderSignatures[f.field_key]}
                                alt=""
                                className="h-12 max-w-full rounded-md border border-slate-200 bg-white"
                              />
                            ) : null}
                            <button
                              type="button"
                              onClick={() => setActiveSenderSigField(f)}
                              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-slate-50"
                            >
                              {senderSignatures[f.field_key] ? "Redraw signature" : "Sign"}
                            </button>
                          </div>
                        </div>
                      );
                    }
                    if (f.field_type === "checkbox") {
                      return (
                        <label key={f.id} className="flex items-start gap-2 text-sm text-slate-800">
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={Boolean(senderValues[f.field_key])}
                            onChange={(e) =>
                              setSenderValues((v) => ({ ...v, [f.field_key]: e.target.checked }))
                            }
                          />
                          <span>{label}</span>
                        </label>
                      );
                    }
                    if (f.field_type === "textarea") {
                      return (
                        <label key={f.id} className="block text-sm text-slate-800">
                          <span className="text-xs font-semibold text-slate-700">{label}</span>
                          <textarea
                            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                            rows={3}
                            value={String(senderValues[f.field_key] ?? "")}
                            onChange={(e) =>
                              setSenderValues((v) => ({ ...v, [f.field_key]: e.target.value }))
                            }
                          />
                        </label>
                      );
                    }
                    const inputType = f.field_type === "date" ? "date" : "text";
                    return (
                      <label key={f.id} className="block text-sm text-slate-800">
                        <span className="text-xs font-semibold text-slate-700">{label}</span>
                        <input
                          type={inputType}
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                          value={String(senderValues[f.field_key] ?? "")}
                          onChange={(e) =>
                            setSenderValues((v) => ({ ...v, [f.field_key]: e.target.value }))
                          }
                        />
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <dl className="mt-6 space-y-4 rounded-2xl border border-slate-100 bg-slate-50/80 p-5 text-sm">
              <div className="flex flex-wrap justify-between gap-2 border-b border-slate-100 pb-3">
                <dt className="text-slate-500">Template</dt>
                <dd className="text-right font-medium text-slate-900">
                  {selectedTemplate
                    ? `${selectedTemplate.name} · ${DOC_LABEL[selectedTemplate.document_type] || selectedTemplate.document_type}`
                    : "—"}
                </dd>
              </div>
              <div className="flex flex-wrap justify-between gap-2 border-b border-slate-100 pb-3">
                <dt className="text-slate-500">Recipients</dt>
                <dd className="max-w-lg text-right text-slate-900">
                  <ol className="list-decimal space-y-2 pl-4 text-right">
                    {primarySigningRecipients.map((r, i) => (
                      <li key={r.id || i} className="leading-snug">
                        <span className="font-medium">{r.name || "—"}</span>
                        <div className="text-slate-600">{r.email}</div>
                        {r.phone ? <div className="text-xs text-slate-500">{r.phone}</div> : null}
                      </li>
                    ))}
                  </ol>
                </dd>
              </div>
              <div className="flex flex-wrap justify-between gap-2 border-b border-slate-100 pb-3">
                <dt className="text-slate-500">Linked record</dt>
                <dd className="max-w-md text-right text-slate-900">
                  {recordTypeLabel}
                  <div className="font-mono text-xs text-slate-600">{crmEntityId || "—"}</div>
                </dd>
              </div>
              <div className="flex flex-wrap justify-between gap-2 border-b border-slate-100 pb-3">
                <dt className="text-slate-500">Signing link</dt>
                <dd className="text-right text-slate-900">
                  Expires in {ttlDays} days · {sendEmail ? "Email Recipient 1" : "Do not email yet"}
                </dd>
              </div>
              {message.trim() ? (
                <div>
                  <dt className="text-slate-500">Message to signer</dt>
                  <dd className="mt-1 whitespace-pre-wrap text-slate-800">{message}</dd>
                </div>
              ) : null}
              {(smsRequested || marksIc) && (
                <div className="text-xs text-slate-600">
                  {smsRequested ? <span className="mr-3">SMS requested (Recipient 1)</span> : null}
                  {marksIc ? <span>Independent contractor packet</span> : null}
                </div>
              )}
            </dl>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={goBack}
                className="rounded-2xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={busy || !templateId}
                className="inline-flex rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 px-7 py-2.5 text-sm font-semibold text-amber-950 shadow-md shadow-amber-500/20 hover:from-amber-500 hover:to-amber-600 disabled:opacity-50"
              >
                {busy ? "Sending…" : "Send packet"}
              </button>
              <Link
                href="/admin/signatures/packets"
                className="text-sm font-semibold text-slate-600 underline-offset-2 hover:underline"
              >
                Cancel
              </Link>
            </div>
          </section>
        ) : null}
      </form>

      {activeSenderSigField ? (
        <SignaturePadModal
          field={{
            fieldKey: activeSenderSigField.field_key,
            label: activeSenderSigField.label,
            fieldType: activeSenderSigField.field_type,
          }}
          recipientName={senderDisplayName}
          onCancel={() => setActiveSenderSigField(null)}
          onApply={(payload) => {
            const f = activeSenderSigField;
            setActiveSenderSigField(null);
            if (!f) return;
            if (payload.imageDataUrl) {
              setSenderSignatures((prev) => ({
                ...prev,
                [f.field_key]: payload.imageDataUrl as string,
              }));
            }
            if (payload.typed) {
              setSenderValues((prev) => ({
                ...prev,
                [f.field_key]: payload.typed as string,
              }));
            }
          }}
        />
      ) : null}
    </>
  );
}
