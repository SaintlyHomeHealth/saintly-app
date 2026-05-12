"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { SignaturePadModal } from "@/app/sign/[token]/SignaturePadModal";
import { PDF_SIGN_COMPANY_NAME } from "@/lib/pdf-sign/constants";
import { hasPdfSignCrmLinkage } from "@/lib/pdf-sign/crm-link-display";
import {
  collectSaintlySenderPrefillIssues,
  formatSaintlySendFieldHeading,
  senderAssignableTemplateFields,
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
  page_index: number | null | undefined;
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
  {
    value: "applicant",
    label: "Applicant / employee",
    hint: "Onboarding or recruiting profiles.",
  },
  { value: "lead", label: "Lead", hint: "" },
  { value: "contact", label: "Patient / contact", hint: "" },
  { value: "vendor", label: "Vendor / other", hint: "" },
];

const STEPS = [
  { n: 1, title: "Pick a document", subtitle: "Choose what to send for signature." },
  { n: 2, title: "Who needs to sign?", subtitle: "Add the signer’s contact info." },
  { n: 3, title: "Note & options", subtitle: "Optional message and delivery settings." },
  { n: 4, title: "Review & send", subtitle: "Saintly fields, then confirm and send." },
] as const;

const BTN_GOLD_PRIMARY =
  "inline-flex rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 px-6 py-2.5 text-sm font-semibold text-amber-950 shadow-md shadow-amber-500/20 hover:from-amber-500 hover:to-amber-600 disabled:opacity-50";

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
  pdfSignAllowedFromEmails,
}: {
  initialTemplateId: string | null;
  senderDisplayName: string;
  pdfSignAllowedFromEmails: string[];
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
  const [notifyFromEmail, setNotifyFromEmail] = useState(
    () => (pdfSignAllowedFromEmails[0] ?? "").trim().toLowerCase()
  );

  useEffect(() => {
    const first = (pdfSignAllowedFromEmails[0] ?? "").trim().toLowerCase();
    if (first && !pdfSignAllowedFromEmails.map((x) => x.trim().toLowerCase()).includes(notifyFromEmail)) {
      setNotifyFromEmail(first);
    }
  }, [pdfSignAllowedFromEmails, notifyFromEmail]);

  const [senderValues, setSenderValues] = useState<Record<string, string | boolean>>({});
  const [senderSignatures, setSenderSignatures] = useState<Record<string, string>>({});
  const [activeSenderSigField, setActiveSenderSigField] = useState<TemplateFieldRow | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [previewNonce, setPreviewNonce] = useState(0);
  const [mobilePdfExpanded, setMobilePdfExpanded] = useState(true);
  const [pulseFieldKey, setPulseFieldKey] = useState<string | null>(null);
  const senderFieldAnchorsRef = useRef<Record<string, HTMLDivElement | null>>({});
  const pdfPreviewSectionRef = useRef<HTMLDivElement | null>(null);

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
        page_index: typeof f.page_index === "number" ? f.page_index : null,
      })),
    [templateFields]
  );

  const senderSideFields = useMemo(() => senderAssignableTemplateFields(templateModels), [templateModels]);

  const documentPreviewEmbedUrl = useMemo(() => {
    if (!templateId) return "";
    return `/api/pdf-sign/admin/templates/${encodeURIComponent(templateId)}/document-preview?_=${previewNonce}`;
  }, [templateId, previewNonce]);

  const documentPreviewDownloadUrl = useMemo(() => {
    if (!templateId) return "";
    return `/api/pdf-sign/admin/templates/${encodeURIComponent(templateId)}/document-preview?download=1&_=${previewNonce}`;
  }, [templateId, previewNonce]);

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

  useEffect(() => {
    setPulseFieldKey(null);
  }, [senderValues, senderSignatures]);

  const applyInitial = useCallback(() => {
    const q =
      initialTemplateId ||
      (typeof searchParams.get === "function" ? searchParams.get("templateId") : null);
    if (q) setTemplateId(q);
  }, [initialTemplateId, searchParams]);

  useEffect(() => {
    applyInitial();
  }, [applyInitial]);

  useEffect(() => {
    const id =
      typeof searchParams.get === "function"
        ? (searchParams.get("crmEntityId") ?? searchParams.get("recordId"))?.trim() || ""
        : "";
    const tRaw =
      typeof searchParams.get === "function"
        ? (searchParams.get("crmEntityType") ?? searchParams.get("entityType"))?.trim() || ""
        : "";
    if (!id) return;
    setCrmEntityId(id);
    if (tRaw && CRM_OPTIONS.some((o) => o.value === tRaw)) setCrmEntityType(tRaw);
  }, [searchParams]);

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
      if (selectedTemplate?.document_type === "i9") {
        if (!crmEntityId.trim()) {
          return "Form I-9 must be linked to an applicant. Open Advanced and choose the applicant record.";
        }
        if (crmEntityType !== "applicant") {
          return "Form I-9 uses the applicant profile only. Pick “Applicant / employee” in Advanced.";
        }
      }
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
    const v2 = validateStep(2);
    if (v2 || !templateId) {
      setError(v2 || "Select a template.");
      return;
    }

    const saintlyIssues = collectSaintlySenderPrefillIssues({
      templateFields: templateModels,
      senderValues,
      senderSignatureImages: senderSignatures,
    });
    if (saintlyIssues.length > 0) {
      setError(saintlyIssues[0].message);
      const fk = saintlyIssues[0].field_key;
      setPulseFieldKey(fk);
      requestAnimationFrame(() => {
        const wrap = senderFieldAnchorsRef.current[fk];
        wrap?.scrollIntoView({ behavior: "smooth", block: "center" });
        const focusable = wrap?.querySelector<HTMLElement>(
          "input:not([type=hidden]), textarea, button, select"
        );
        focusable?.focus({ preventScroll: true });
      });
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
          ...(crmEntityId.trim()
            ? { crmEntityType, crmEntityId: crmEntityId.trim() }
            : {}),
          recipients: filledRecipients,
          ttlDays,
          sendEmail,
          marksIcAgreement: marksIc,
          i9ReviewMethod: selectedTemplate?.document_type === "i9" ? i9ReviewMethod || null : null,
          message: message.trim() || undefined,
          smsRequested,
          senderValues,
          senderSignatureImages: senderSignatures,
          notifyFromEmail:
            pdfSignAllowedFromEmails.includes(notifyFromEmail.trim().toLowerCase())
              ? notifyFromEmail.trim().toLowerCase()
              : pdfSignAllowedFromEmails[0] ?? "",
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
  const hasLinkedProfile = hasPdfSignCrmLinkage(crmEntityId);
  const hasSaintlySenderFields = senderSideFields.length > 0;

  return (
    <>
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-8">
        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 shadow-sm">
            {error}
          </div>
        ) : null}

        <nav aria-label="Progress" className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-md shadow-slate-200/30 ring-1 ring-slate-100/80">
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
          <section className="rounded-2xl border border-slate-200/90 bg-white p-6 md:p-8 shadow-md shadow-slate-200/40 ring-1 ring-slate-100/80">
            <h2 className="text-lg font-semibold text-slate-900">Step 1 · Pick a document</h2>
            <p className="mt-1 text-sm text-slate-600">
              Need a different layout? Manage templates from{" "}
              <Link
                className="font-semibold text-sky-800 underline-offset-2 hover:underline"
                href="/admin/signatures/templates"
              >
                Templates
              </Link>
              .
            </p>
            <label className="mt-5 block text-sm font-medium text-slate-800">
              Document template
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
              <p className="mt-3 text-xs text-slate-500">Loading fields for this template…</p>
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
              <button type="button" onClick={goNext} className={BTN_GOLD_PRIMARY}>
                Continue
              </button>
            </div>
          </section>
        ) : null}

        {step === 2 ? (
          <section className="rounded-2xl border border-slate-200/90 bg-white p-6 md:p-8 shadow-md shadow-slate-200/40 ring-1 ring-slate-100/80">
            <h2 className="text-lg font-semibold text-slate-900">Step 2 · Who needs to sign?</h2>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-slate-600">
              Recipient 1 will receive the signing link. Additional recipients are saved on the packet for your
              records.
            </p>

            <div className="mt-6 max-w-3xl space-y-6">
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
                      Name
                      <input
                        value={r.name}
                        onChange={(e) => updateRecipient(r.id, { name: e.target.value })}
                        autoComplete="name"
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm"
                        placeholder="Recipient full name"
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
                        placeholder={
                          idx === 0 ? "signer@email.com" : "additional@email.com"
                        }
                      />
                    </label>
                    <label className="block text-sm font-medium text-slate-800 sm:col-span-2">
                      Phone{" "}
                      <span className="font-normal text-slate-500">(optional)</span>
                      <input
                        value={r.phone}
                        onChange={(e) => updateRecipient(r.id, { phone: e.target.value })}
                        type="tel"
                        autoComplete="tel"
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm"
                        placeholder="For text message if you turn that on later"
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
                + Add another recipient
              </button>
            </div>

            <div className="mt-8 max-w-3xl space-y-4 rounded-2xl border border-slate-100 bg-slate-50/60 p-5 ring-1 ring-slate-100/70">
              <label className="block text-sm font-medium text-slate-800">
                Signing link expires after (days)
                <input
                  type="number"
                  min={1}
                  max={90}
                  value={ttlDays}
                  onChange={(e) => setTtlDays(Number(e.target.value))}
                  className="mt-2 w-full max-w-xs rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm"
                />
              </label>
              <label className="flex items-start gap-3 rounded-xl border border-white/80 bg-white px-4 py-3 text-sm font-medium text-slate-800 shadow-sm">
                <input
                  type="checkbox"
                  checked={sendEmail}
                  onChange={(e) => setSendEmail(e.target.checked)}
                  className="mt-1 rounded border-slate-300 text-amber-600"
                />
                <span>Email signing link now</span>
              </label>
            </div>

            <details
              key={`crm-link-${templateId}`}
              className="group mt-8 rounded-2xl border border-slate-200 bg-white ring-1 ring-slate-100/80 [&_summary::-webkit-details-marker]:hidden open:shadow-md"
              defaultOpen={selectedTemplate?.document_type === "i9"}
            >
              <summary className="cursor-pointer list-none rounded-2xl px-5 py-4 text-sm font-semibold text-slate-900 outline-none">
                Advanced: attach this packet to a CRM record
                <span className="mt-1 block font-normal text-slate-500">
                  Optional. Use this only when sending from a specific applicant, employee, lead, or patient record.
                </span>
              </summary>
              <div className="space-y-5 border-t border-slate-100 px-5 pb-5 pt-4">
                <p className="text-sm text-slate-600">
                  Linking stays internal—your signer doesn&apos;t see this. Form I‑9 packets must stay linked to an
                  applicant.
                </p>
                <div className="grid max-w-3xl gap-5 sm:grid-cols-2">
                  <label className="block text-sm font-medium text-slate-800 sm:col-span-2">
                    Profile type
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
                    {CRM_OPTIONS.find((o) => o.value === crmEntityType)?.hint ? (
                      <span className="mt-1.5 block text-xs font-normal text-slate-500">
                        {CRM_OPTIONS.find((o) => o.value === crmEntityType)?.hint}
                      </span>
                    ) : null}
                  </label>
                  <label className="block text-sm font-medium text-slate-800 sm:col-span-2">
                    Profile record identifier
                    <input
                      value={crmEntityId}
                      onChange={(e) => setCrmEntityId(e.target.value)}
                      className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm shadow-sm"
                      placeholder="From the CRM record URL or detail page"
                    />
                  </label>
                </div>
              </div>
            </details>

            <div className="mt-8 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={goBack}
                className="rounded-2xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
              >
                Back
              </button>
              <button type="button" onClick={goNext} className={BTN_GOLD_PRIMARY}>
                Continue
              </button>
            </div>
          </section>
        ) : null}

        {step === 3 ? (
          <section className="rounded-2xl border border-slate-200/90 bg-white p-6 md:p-8 shadow-md shadow-slate-200/40 ring-1 ring-slate-100/80">
            <h2 className="text-lg font-semibold text-slate-900">Step 3 · Note & options</h2>
            <p className="mt-1 text-sm text-slate-600">Optional—a short note or extra delivery choices.</p>

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

            <label className="mt-5 block text-sm font-medium text-slate-800">
              Reply-to email
              <select
                value={notifyFromEmail}
                onChange={(e) => setNotifyFromEmail(e.target.value.trim().toLowerCase())}
                className="mt-2 w-full max-w-xl rounded-xl border border-slate-200 px-3 py-2.5 text-sm shadow-sm"
              >
                {(pdfSignAllowedFromEmails.length > 0
                  ? pdfSignAllowedFromEmails
                  : ["info@saintlyhomehealth.com"]
                ).map((addr) => (
                  <option key={addr} value={addr}>
                    {addr}
                  </option>
                ))}
              </select>
              <span className="mt-2 block text-xs font-normal leading-relaxed text-slate-500">
                Signing emails are sent from Saintly&apos;s verified email service. Replies will go to
                the selected inbox.
              </span>
            </label>

            <label className="mt-5 flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3 text-sm font-medium text-slate-800">
              <input
                type="checkbox"
                checked={smsRequested}
                onChange={(e) => setSmsRequested(e.target.checked)}
                className="mt-1 rounded border-slate-300 text-amber-600"
              />
              <span>Also send a text with the signing link to the primary recipient&apos;s phone (if SMS is configured)</span>
            </label>

            <label className="mt-4 flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3 text-sm font-medium text-slate-800">
              <input
                type="checkbox"
                checked={marksIc}
                onChange={(e) => setMarksIc(e.target.checked)}
                className="mt-1 rounded border-slate-300 text-amber-600"
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
              <button type="button" onClick={goNext} className={BTN_GOLD_PRIMARY}>
                Review & send
              </button>
            </div>
          </section>
        ) : null}

        {step === 4 ? (
          <section className="rounded-2xl border border-slate-200/90 bg-white p-6 md:p-8 shadow-md shadow-slate-200/40 ring-1 ring-slate-100/80">
            <h2 className="text-lg font-semibold text-slate-900">Step 4 · Review & send</h2>
            <p className="mt-1 text-sm text-slate-600">
              Review the actual document below while you finish any Saintly fields. The preview shows your
              template PDF; prefilled Saintly answers are burned into the final packet when you send it.
            </p>

            {templateId ? (
              <div
                className={
                  hasSaintlySenderFields
                    ? "mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.08fr)_minmax(300px,.42fr)] lg:items-start"
                    : "mt-6"
                }
              >
                <div ref={pdfPreviewSectionRef} className="min-w-0 space-y-3 lg:sticky lg:top-4 lg:self-start">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setMobilePdfExpanded(true);
                        pdfPreviewSectionRef.current?.scrollIntoView({
                          behavior: "smooth",
                          block: "start",
                        });
                      }}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 shadow-sm hover:bg-slate-50"
                    >
                      View document
                    </button>
                    <a
                      href={documentPreviewDownloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 shadow-sm hover:bg-slate-50"
                    >
                      Download document
                    </a>
                    <button
                      type="button"
                      onClick={() => setPreviewNonce((n) => n + 1)}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 shadow-sm hover:bg-slate-50"
                    >
                      Refresh preview
                    </button>
                    <button
                      type="button"
                      className="inline-flex lg:hidden rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-950 hover:bg-amber-100"
                      onClick={() => setMobilePdfExpanded((o) => !o)}
                    >
                      {mobilePdfExpanded ? "Hide document" : "View document"}
                    </button>
                  </div>
                  <p className="text-[11px] leading-relaxed text-slate-500">
                    Opens the stored template PDF (admin-only). Recipient fields remain empty until signing.
                  </p>
                  <iframe
                    key={previewNonce}
                    title="Template PDF preview"
                    src={documentPreviewEmbedUrl}
                    className={`h-[min(70vh,680px)] w-full rounded-xl border border-slate-200 bg-slate-100 shadow-inner ${mobilePdfExpanded ? "" : "hidden"} lg:block`}
                  />
                </div>

                {hasSaintlySenderFields ? (
                  <div className="min-w-0 rounded-2xl border border-amber-200/90 bg-gradient-to-br from-amber-50/90 to-white p-5 shadow-sm ring-1 ring-amber-100/70">
                    <h3 className="text-base font-semibold text-slate-900">Saintly fields</h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-700">
                      Complete Saintly&apos;s boxes before sending so the recipient signs only what&apos;s theirs.
                      Use the lines below to match spots on the PDF (page · label · field type · required status).
                    </p>
                    <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-amber-900/80">
                      Sign Saintly side before sending
                    </p>
                    <div className="mt-4 space-y-4">
                      {senderSideFields.map((f) => {
                        const saintlyHeading = formatSaintlySendFieldHeading({
                          field_key: f.field_key,
                          label: f.label,
                          field_type: f.field_type,
                          signer_role: f.signer_role,
                          options: f.options,
                          required: f.required,
                          page_index: typeof f.page_index === "number" ? f.page_index : null,
                        });
                        const pulse = pulseFieldKey === f.field_key;
                        const rowFrame =
                          "rounded-xl border border-slate-200/95 bg-white/95 p-3 shadow-sm " +
                          (pulse ? "ring-2 ring-amber-500 ring-offset-2 ring-offset-amber-50/80" : "");
                        if (f.field_type === "signature" || f.field_type === "initials") {
                          return (
                            <div
                              key={f.id}
                              ref={(el) => {
                                senderFieldAnchorsRef.current[f.field_key] = el;
                              }}
                              className={rowFrame}
                            >
                              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-700">
                                {saintlyHeading}
                              </p>
                              <div className="flex flex-wrap items-center gap-2">
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
                                  className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-950 hover:bg-amber-50"
                                >
                                  {senderSignatures[f.field_key]
                                    ? "Redraw signature"
                                    : f.field_type === "initials"
                                      ? "Add initials"
                                      : "Add Saintly signature"}
                                </button>
                              </div>
                            </div>
                          );
                        }
                        if (f.field_type === "checkbox") {
                          return (
                            <div
                              key={f.id}
                              ref={(el) => {
                                senderFieldAnchorsRef.current[f.field_key] = el;
                              }}
                              className={rowFrame}
                            >
                              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-700">
                                {saintlyHeading}
                              </p>
                              <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-800">
                                <input
                                  type="checkbox"
                                  className="mt-1 rounded border-slate-300 text-amber-600"
                                  checked={Boolean(senderValues[f.field_key])}
                                  onChange={(e) =>
                                    setSenderValues((v) => ({ ...v, [f.field_key]: e.target.checked }))
                                  }
                                />
                                <span className="font-medium">{f.label || f.field_key}</span>
                              </label>
                            </div>
                          );
                        }
                        if (f.field_type === "textarea") {
                          return (
                            <div
                              key={f.id}
                              ref={(el) => {
                                senderFieldAnchorsRef.current[f.field_key] = el;
                              }}
                              className={rowFrame}
                            >
                              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-700">
                                {saintlyHeading}
                              </p>
                              <label className="block text-sm text-slate-800">
                                <textarea
                                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                                  rows={3}
                                  value={String(senderValues[f.field_key] ?? "")}
                                  onChange={(e) =>
                                    setSenderValues((v) => ({ ...v, [f.field_key]: e.target.value }))
                                  }
                                />
                              </label>
                            </div>
                          );
                        }
                        const inputType = f.field_type === "date" ? "date" : "text";
                        return (
                          <div
                            key={f.id}
                            ref={(el) => {
                              senderFieldAnchorsRef.current[f.field_key] = el;
                            }}
                            className={rowFrame}
                          >
                            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-700">
                              {saintlyHeading}
                            </p>
                            <label className="block text-sm text-slate-800">
                              <input
                                type={inputType}
                                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                                value={String(senderValues[f.field_key] ?? "")}
                                onChange={(e) =>
                                  setSenderValues((v) => ({ ...v, [f.field_key]: e.target.value }))
                                }
                              />
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
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
                <dt className="text-slate-500">Internal profile link</dt>
                <dd className="max-w-md text-right text-slate-900">
                  {hasLinkedProfile ? (
                    <>
                      {recordTypeLabel}
                      <div className="text-xs text-slate-600">{crmEntityId.trim()}</div>
                    </>
                  ) : (
                    <>
                      <span className="font-medium text-slate-900">Manual send</span>
                      <div className="text-sm text-slate-600">Not attached to a CRM record</div>
                    </>
                  )}
                </dd>
              </div>
              <div className="flex flex-wrap justify-between gap-2 border-b border-slate-100 pb-3">
                <dt className="text-slate-500">Signing link</dt>
                <dd className="text-right text-slate-900">
                  Expires in {ttlDays} days · {sendEmail ? "Email now" : "Hold (no email yet)"}
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
                  {smsRequested ? <span className="mr-3">Text message to signer requested</span> : null}
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
                className={`${BTN_GOLD_PRIMARY} px-8 py-3 text-base`}
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
