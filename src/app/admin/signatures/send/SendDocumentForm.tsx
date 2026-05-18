"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useMemo, useState } from "react";

import { UsPhoneInput } from "@/components/forms/UsPhoneInput";
import {
  PDF_SIGN_COMPANY_NAME,
  assignedToFromSignerRole,
  type PdfSignAssignedTo,
} from "@/lib/pdf-sign/constants";
import { formatUsPhoneInput, normalizeUsPhoneForSend } from "@/lib/phone/us-phone-format";

import { SignaturePadModal } from "@/app/sign/[token]/SignaturePadModal";

type Template = { id: string; name: string; document_type: string; fieldCount: number };
type RecipientType = "employee" | "recruit" | "lead" | "facility_contact" | "manual";

type LookupResult = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  meta?: string | null;
};

/** Field row returned by GET /api/pdf-sign/admin/templates/[templateId] */
type TemplateField = {
  id: string;
  field_key: string;
  label: string;
  field_type: string;
  signer_role: string | null;
  required: boolean | null;
  page_index: number;
  options: { autofill_source?: string; validation_kind?: string } | null;
  prefill_value: string | null;
};

const RECIPIENT_TYPES: Array<{ value: RecipientType; label: string }> = [
  { value: "employee", label: "Employee" },
  { value: "recruit", label: "Recruit" },
  { value: "lead", label: "Lead" },
  { value: "facility_contact", label: "Facility contact" },
  { value: "manual", label: "Manual recipient" },
];

type Step = "document" | "recipient" | "saintly" | "review";

const STEP_ORDER: Step[] = ["document", "recipient", "saintly", "review"];
const STEP_LABELS: Record<Step, string> = {
  document: "Step 1: Document",
  recipient: "Step 2: Recipient",
  saintly: "Step 3: Saintly fields",
  review: "Step 4: Review & send",
};

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function applyAutofillForSender(field: TemplateField, ctx: { senderName: string }): string {
  const opts = field.options || {};
  switch (opts.autofill_source) {
    case "today_date":
      return todayIso();
    case "sender_name":
      return ctx.senderName;
    case "company_name":
      return PDF_SIGN_COMPANY_NAME;
    default:
      return field.prefill_value || "";
  }
}

export function SendDocumentForm({
  templates,
  initialTemplateId,
  senderName,
}: {
  templates: Template[];
  initialTemplateId: string | null;
  senderName: string;
}) {
  const [step, setStep] = useState<Step>("document");
  const [templateId, setTemplateId] = useState(initialTemplateId || templates[0]?.id || "");
  const [recipientType, setRecipientType] = useState<RecipientType>("employee");
  const [recordId, setRecordId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<LookupResult[]>([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [ttlDays, setTtlDays] = useState(14);
  const [sendEmail, setSendEmail] = useState(true);
  const [sendSms, setSendSms] = useState(false);
  const [busy, setBusy] = useState(false);

  // Template field metadata for the selected template (loaded client-side).
  const [templateFields, setTemplateFields] = useState<TemplateField[]>([]);
  const [fieldsBusy, setFieldsBusy] = useState(false);

  // Saintly-side prefill for sender + internal fields.
  const [senderValues, setSenderValues] = useState<Record<string, string | boolean>>({});
  const [senderSignatureImages, setSenderSignatureImages] = useState<Record<string, string>>({});
  const [activeSenderSignatureField, setActiveSenderSignatureField] = useState<TemplateField | null>(
    null
  );

  const [result, setResult] = useState<
    | null
    | {
        packetId?: string;
        signUrl?: string;
        emailSent?: boolean;
        emailError?: string | null;
        smsSent?: boolean;
        smsError?: string | null;
        expiresAt?: string;
        documentTitle?: string;
      }
  >(null);
  const [err, setErr] = useState<string | null>(null);

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === templateId) || null,
    [templates, templateId]
  );
  const templateHasFields = (selectedTemplate?.fieldCount ?? 0) > 0;

  useEffect(() => {
    setTitle(selectedTemplate?.name || "");
  }, [selectedTemplate?.name]);

  // Load template fields whenever the selection changes — needed for the
  // Saintly-fields step + final review.
  useEffect(() => {
    if (!templateId) {
      setTemplateFields([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setFieldsBusy(true);
      try {
        const res = await fetch(
          `/api/pdf-sign/admin/templates/${encodeURIComponent(templateId)}`,
          { cache: "no-store" }
        );
        if (!res.ok) {
          if (!cancelled) setTemplateFields([]);
          return;
        }
        const j = (await res.json()) as { fields: TemplateField[] };
        if (cancelled) return;
        setTemplateFields(j.fields || []);
      } finally {
        if (!cancelled) setFieldsBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [templateId]);

  // Recipient search (debounced)
  useEffect(() => {
    if (recipientType === "manual") {
      setResults([]);
      return;
    }
    const q = search.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      setSearchBusy(true);
      try {
        const res = await fetch(
          `/api/pdf-sign/admin/recipient-lookup?type=${encodeURIComponent(recipientType)}&q=${encodeURIComponent(q)}`
        );
        if (res.ok) {
          const j = (await res.json()) as { results: LookupResult[] };
          setResults(j.results || []);
        } else {
          setResults([]);
        }
      } finally {
        setSearchBusy(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [search, recipientType]);

  function applyChosenRecipient(r: LookupResult) {
    setRecordId(r.id);
    setName(r.name);
    setEmail(r.email || "");
    setPhone(r.phone ? formatUsPhoneInput(r.phone) : "");
    setSearch(r.name);
    setResults([]);
  }

  function assignedTo(field: TemplateField): PdfSignAssignedTo {
    return assignedToFromSignerRole(field.signer_role || "");
  }

  // Sender + internal fields the admin pre-fills in Step 3.
  const senderSideFields = useMemo(
    () => templateFields.filter((f) => assignedTo(f) !== "recipient"),
    [templateFields]
  );

  // Pre-populate sender field defaults whenever the template changes.
  useEffect(() => {
    if (senderSideFields.length === 0) return;
    setSenderValues((prev) => {
      const next: Record<string, string | boolean> = { ...prev };
      for (const f of senderSideFields) {
        if (f.field_type === "checkbox") {
          if (typeof next[f.field_key] !== "boolean") next[f.field_key] = false;
          continue;
        }
        if (f.field_type === "signature" || f.field_type === "initials") continue;
        if (next[f.field_key] === undefined || next[f.field_key] === "") {
          next[f.field_key] = applyAutofillForSender(f, { senderName });
        }
      }
      return next;
    });
  }, [senderSideFields, senderName]);

  // ---- Step gating helpers -------------------------------------------------
  function canAdvanceFromDocument(): string | null {
    if (!templateId) return "Choose a template.";
    if (!templateHasFields) {
      return "This template has no saved fields yet. Edit fields before sending.";
    }
    return null;
  }

  function canAdvanceFromRecipient(): string | null {
    if (recipientType !== "manual" && !recordId) {
      return "Pick an existing record or switch to Manual recipient.";
    }
    if (!email.includes("@")) return "Recipient email is required.";
    if (sendSms && !phone.trim()) return "Phone number is required when SMS is enabled.";
    if (!name.trim()) return "Recipient name is required.";
    return null;
  }

  function canAdvanceFromSaintly(): string | null {
    for (const f of senderSideFields) {
      if (f.required === false) continue;
      if (f.field_type === "signature" || f.field_type === "initials") {
        if (!senderSignatureImages[f.field_key] && !senderValues[f.field_key]) {
          return `Saintly field "${f.label}" is required.`;
        }
        continue;
      }
      if (f.field_type === "checkbox") {
        if (senderValues[f.field_key] !== true) {
          return `Saintly field "${f.label}" must be checked.`;
        }
        continue;
      }
      const v = senderValues[f.field_key];
      if (v == null || String(v).trim() === "") {
        return `Saintly field "${f.label}" is required.`;
      }
    }
    return null;
  }

  function goNext() {
    setErr(null);
    if (step === "document") {
      const e = canAdvanceFromDocument();
      if (e) {
        setErr(e);
        return;
      }
      setStep("recipient");
      return;
    }
    if (step === "recipient") {
      const e = canAdvanceFromRecipient();
      if (e) {
        setErr(e);
        return;
      }
      // Skip Saintly step if no sender/internal fields exist.
      setStep(senderSideFields.length === 0 ? "review" : "saintly");
      return;
    }
    if (step === "saintly") {
      const e = canAdvanceFromSaintly();
      if (e) {
        setErr(e);
        return;
      }
      setStep("review");
      return;
    }
  }

  function goBack() {
    setErr(null);
    if (step === "recipient") setStep("document");
    else if (step === "saintly") setStep("recipient");
    else if (step === "review") setStep(senderSideFields.length === 0 ? "recipient" : "saintly");
  }

  // ---- Final submit --------------------------------------------------------
  async function send(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setResult(null);
    if (!templateId) return setErr("Choose a template.");
    if (!templateHasFields)
      return setErr("This template has no saved fields yet. Edit fields before sending.");
    if (!email.includes("@")) return setErr("Recipient email is required.");
    if (sendSms && !phone.trim())
      return setErr("Phone number is required when SMS is enabled.");
    if (recipientType !== "manual" && !recordId) {
      return setErr("Pick an existing record or switch to Manual recipient.");
    }
    const saintlyError = canAdvanceFromSaintly();
    if (saintlyError) return setErr(saintlyError);

    setBusy(true);
    try {
      const res = await fetch("/api/pdf-sign/admin/packets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId,
          title: title.trim() || selectedTemplate?.name,
          message: message.trim() || null,
          ttlDays,
          recipient: {
            type: recipientType,
            recordId: recipientType === "manual" ? null : recordId,
            name: name.trim() || null,
            email: email.trim().toLowerCase(),
            phone: normalizeUsPhoneForSend(phone) || null,
          },
          delivery: {
            email: sendEmail,
            sms: sendSms,
          },
          senderValues,
          senderSignatureImages,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        packetId?: string;
        signUrl?: string;
        emailSent?: boolean;
        emailError?: string | null;
        smsSent?: boolean;
        smsError?: string | null;
        deliveryStatusMessage?: string | null;
        error?: string;
        expiresAt?: string;
        documentTitle?: string;
      };
      if (!res.ok || !j.ok) {
        setErr(j.error || "Could not send document.");
        return;
      }
      setResult(j);
    } finally {
      setBusy(false);
    }
  }

  // ---- Render --------------------------------------------------------------
  if (result) {
    const packetId = result.packetId;
    const signUrl = result.signUrl || "";
    const docTitle = result.documentTitle || title || selectedTemplate?.name || "Document";
    const emailFail = Boolean(result.emailError);
    const smsFail = Boolean(result.smsError);
    const showPhoneRow = Boolean(phone.trim());
    let expLabel = "—";
    if (result.expiresAt) {
      try {
        expLabel = new Date(result.expiresAt).toLocaleString(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        });
      } catch {
        expLabel = result.expiresAt;
      }
    }

    return (
      <div className="space-y-4">
        <Stepper step="review" />

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-6 text-sm text-emerald-950 shadow-sm">
          <div className="text-lg font-semibold">Status: Sent</div>
          <p className="mt-1 text-xs text-emerald-900/90">
            The signing packet was created. The recipient can use the secure link to sign.
          </p>

          {emailFail && (
            <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950">
              Packet created, but email failed to send
              {result.emailError ? `: ${result.emailError}` : "."} Use{" "}
              <strong>Copy signing link</strong> below.
            </div>
          )}
          {!emailFail && result.deliveryStatusMessage ? (
            <p className="mt-2 text-xs font-medium text-emerald-900">{result.deliveryStatusMessage}</p>
          ) : null}
          {!emailFail && sendEmail && result.emailSent && !result.deliveryStatusMessage && (
            <p className="mt-2 text-xs text-emerald-800">Signing email sent to the recipient.</p>
          )}
          {!sendEmail && !emailFail && (
            <p className="mt-2 text-xs text-emerald-800">Email delivery was skipped; share the link manually.</p>
          )}

          {!result.deliveryStatusMessage && showPhoneRow && result.smsSent && (
            <p className="mt-2 text-xs text-emerald-800">SMS with the link was sent.</p>
          )}
          {!result.deliveryStatusMessage && showPhoneRow && smsFail && !emailFail && (
            <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950">
              Packet sent and email sent, but text message failed
              {result.smsError ? `: ${result.smsError}` : "."}
            </div>
          )}

          <dl className="mt-4 space-y-1.5 border-t border-emerald-200/80 pt-4 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-emerald-800/80">Recipient</dt>
              <dd className="text-right font-medium">{name || "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-emerald-800/80">Email</dt>
              <dd className="text-right font-medium break-all">{email || "—"}</dd>
            </div>
            {showPhoneRow ? (
              <div className="flex justify-between gap-4">
                <dt className="text-emerald-800/80">Phone (SMS)</dt>
                <dd className="text-right font-medium">{phone || "—"}</dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-4">
              <dt className="text-emerald-800/80">Document title</dt>
              <dd className="text-right font-medium">{docTitle}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-emerald-800/80">Link expires</dt>
              <dd className="text-right font-medium">{expLabel}</dd>
            </div>
          </dl>

          {signUrl ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(signUrl).catch(() => {
                    prompt("Copy this link:", signUrl);
                  });
                }}
                className="rounded-full bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800"
              >
                Copy signing link
              </button>
              {packetId ? (
                <Link
                  href={`/admin/signatures/packets/${encodeURIComponent(packetId)}`}
                  className="rounded-full border border-emerald-300 bg-white px-4 py-2 text-xs font-semibold text-emerald-900 hover:bg-emerald-100/80"
                >
                  Open packet
                </Link>
              ) : null}
              <Link
                href="/admin/signatures/send"
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
              >
                Send another document
              </Link>
              <Link
                href="/admin/signatures"
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
              >
                Back to Saintly Sign
              </Link>
            </div>
          ) : (
            <p className="mt-3 text-xs text-amber-900">Signing link missing — open the packet from Packets to copy a link.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={send} className="space-y-6">
      <Stepper step={step} hasSaintly={senderSideFields.length > 0} />

      {selectedTemplate && !templateHasFields && step === "document" ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="font-semibold">This template has no saved fields yet.</div>
          <p className="mt-1 text-xs">
            You won&apos;t be able to send it until at least one field has been placed and saved
            in the visual editor.
          </p>
          <div className="mt-3">
            <Link
              href={`/admin/signatures/templates/${encodeURIComponent(selectedTemplate.id)}`}
              className="inline-flex items-center rounded-full bg-amber-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
            >
              Edit template fields
            </Link>
          </div>
        </div>
      ) : null}

      {step === "document" ? (
        <DocumentStep
          templates={templates}
          templateId={templateId}
          setTemplateId={setTemplateId}
          selectedTemplate={selectedTemplate}
          title={title}
          setTitle={setTitle}
        />
      ) : null}

      {step === "recipient" ? (
        <RecipientStep
          recipientType={recipientType}
          setRecipientType={(t) => {
            setRecipientType(t);
            setRecordId(null);
            setSearch("");
            setResults([]);
          }}
          search={search}
          setSearch={setSearch}
          searchBusy={searchBusy}
          results={results}
          applyChosenRecipient={applyChosenRecipient}
          name={name}
          setName={setName}
          email={email}
          setEmail={setEmail}
          phone={phone}
          setPhone={setPhone}
        />
      ) : null}

      {step === "saintly" ? (
        <SaintlyStep
          fieldsBusy={fieldsBusy}
          fields={senderSideFields}
          values={senderValues}
          setValue={(key, v) =>
            setSenderValues((prev) => ({ ...prev, [key]: v }))
          }
          signatureImages={senderSignatureImages}
          onPickSignature={(f) => setActiveSenderSignatureField(f)}
          onClearSignature={(f) => {
            setSenderSignatureImages((prev) => {
              const next = { ...prev };
              delete next[f.field_key];
              return next;
            });
            setSenderValues((prev) => ({ ...prev, [f.field_key]: "" }));
          }}
        />
      ) : null}

      {step === "review" ? (
        <ReviewStep
          selectedTemplate={selectedTemplate}
          title={title}
          name={name}
          email={email}
          phone={phone}
          recipientTypeLabel={
            RECIPIENT_TYPES.find((r) => r.value === recipientType)?.label || recipientType
          }
          ttlDays={ttlDays}
          setTtlDays={setTtlDays}
          sendEmail={sendEmail}
          setSendEmail={setSendEmail}
          sendSms={sendSms}
          setSendSms={setSendSms}
          message={message}
          setMessage={setMessage}
          senderSideFields={senderSideFields}
          senderValues={senderValues}
          senderSignatureImages={senderSignatureImages}
        />
      ) : null}

      {err ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-3 text-sm text-rose-900">
          {err}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-2">
          <Link
            href="/admin/signatures"
            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            Cancel
          </Link>
          {step !== "document" ? (
            <button
              type="button"
              onClick={goBack}
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              Back
            </button>
          ) : null}
        </div>
        {step !== "review" ? (
          <button
            type="button"
            onClick={goNext}
            disabled={fieldsBusy || (step === "document" && !templateHasFields)}
            className="rounded-full bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {step === "saintly" ? "Review & send" : "Next"}
          </button>
        ) : (
          <button
            type="submit"
            disabled={busy || !templateHasFields}
            title={!templateHasFields ? "This template has no saved fields yet." : undefined}
            className="rounded-full bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Sending…" : "Send document"}
          </button>
        )}
      </div>

      {activeSenderSignatureField ? (
        <SignaturePadModal
          field={{
            fieldKey: activeSenderSignatureField.field_key,
            label: activeSenderSignatureField.label,
            fieldType: activeSenderSignatureField.field_type,
          }}
          recipientName={senderName}
          onCancel={() => setActiveSenderSignatureField(null)}
          onApply={(payload) => {
            const f = activeSenderSignatureField;
            setActiveSenderSignatureField(null);
            if (!f) return;
            if (payload.imageDataUrl) {
              setSenderSignatureImages((prev) => ({
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
    </form>
  );
}

// ---------------------------------------------------------------------------
// Stepper
// ---------------------------------------------------------------------------
function Stepper({ step, hasSaintly = true }: { step: Step; hasSaintly?: boolean }) {
  const visible = STEP_ORDER.filter((s) => (s === "saintly" ? hasSaintly : true));
  const idx = visible.indexOf(step);
  return (
    <ol className="flex items-center gap-2 text-xs font-medium">
      {visible.map((s, i) => {
        const active = s === step;
        const done = i < idx;
        return (
          <li key={s} className="flex items-center gap-2">
            <span
              className={
                "flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-semibold " +
                (active
                  ? "border-indigo-600 bg-indigo-600 text-white"
                  : done
                    ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                    : "border-slate-300 bg-white text-slate-500")
              }
            >
              {done ? "✓" : i + 1}
            </span>
            <span className={active ? "text-slate-900" : "text-slate-500"}>{STEP_LABELS[s]}</span>
            {i < visible.length - 1 ? (
              <span className="text-slate-300">·</span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — Document
// ---------------------------------------------------------------------------
function DocumentStep({
  templates,
  templateId,
  setTemplateId,
  selectedTemplate,
  title,
  setTitle,
}: {
  templates: Template[];
  templateId: string;
  setTemplateId: (v: string) => void;
  selectedTemplate: Template | null;
  title: string;
  setTitle: (v: string) => void;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">Document</h2>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label className="block text-xs text-slate-600">
          Template
          <select
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.fieldCount === 0 ? " (no fields yet)" : ""}
              </option>
            ))}
          </select>
          {selectedTemplate ? (
            <span className="mt-1 block text-[11px] text-slate-500">
              {selectedTemplate.fieldCount} field
              {selectedTemplate.fieldCount === 1 ? "" : "s"} mapped on this template.
            </span>
          ) : null}
        </label>
        <label className="block text-xs text-slate-600">
          Document title (shown to recipient)
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
          />
        </label>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — Recipient
// ---------------------------------------------------------------------------
function RecipientStep({
  recipientType,
  setRecipientType,
  search,
  setSearch,
  searchBusy,
  results,
  applyChosenRecipient,
  name,
  setName,
  email,
  setEmail,
  phone,
  setPhone,
}: {
  recipientType: RecipientType;
  setRecipientType: (v: RecipientType) => void;
  search: string;
  setSearch: (v: string) => void;
  searchBusy: boolean;
  results: LookupResult[];
  applyChosenRecipient: (r: LookupResult) => void;
  name: string;
  setName: (v: string) => void;
  email: string;
  setEmail: (v: string) => void;
  phone: string;
  setPhone: (v: string) => void;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">Recipient</h2>
      <p className="mt-1 text-xs text-slate-500">
        Pick where the recipient comes from in the CRM, or enter a manual recipient. The chosen
        person becomes the &quot;Recipient&quot; for any field assigned to Recipient on this
        template.
      </p>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <label className="block text-xs text-slate-600">
          Recipient source
          <select
            value={recipientType}
            onChange={(e) => setRecipientType(e.target.value as RecipientType)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
          >
            {RECIPIENT_TYPES.map((rt) => (
              <option key={rt.value} value={rt.value}>
                {rt.label}
              </option>
            ))}
          </select>
        </label>
        <div className="md:col-span-2">
          {recipientType !== "manual" ? (
            <label className="block text-xs text-slate-600">
              Search by name or email
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Start typing…"
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
              />
              {searchBusy ? (
                <p className="mt-1 text-[11px] text-slate-500">Searching…</p>
              ) : null}
              {results.length > 0 ? (
                <ul className="mt-1 max-h-48 overflow-auto rounded-lg border border-slate-200 bg-white shadow-sm">
                  {results.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => applyChosenRecipient(r)}
                        className="flex w-full flex-col items-start gap-0.5 px-2 py-1.5 text-left text-xs hover:bg-slate-50"
                      >
                        <span className="font-semibold text-slate-900">{r.name}</span>
                        <span className="text-slate-500">
                          {r.email || "no email"}
                          {r.phone ? ` · ${r.phone}` : ""}
                          {r.meta ? ` · ${r.meta}` : ""}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </label>
          ) : (
            <p className="mt-6 text-xs text-slate-500">
              Manual recipient: enter the name, email, and phone below. Manual signers stay in
              Saintly Sign only — they aren&apos;t attached to any CRM record.
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <label className="block text-xs text-slate-600">
          Recipient name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
          />
        </label>
        <label className="block text-xs text-slate-600">
          Email <span className="text-rose-600">*</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
            required
          />
        </label>
        <label className="block text-xs text-slate-600">
          Phone <span className="font-normal text-slate-400">(optional)</span>
          <UsPhoneInput
            className="block"
            value={phone}
            onChange={setPhone}
            inputClassName="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
            helperText="Text signing link will be sent automatically when a phone number is entered."
          />
        </label>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Saintly fields (sender prefill + sign)
// ---------------------------------------------------------------------------
function SaintlyStep({
  fieldsBusy,
  fields,
  values,
  setValue,
  signatureImages,
  onPickSignature,
  onClearSignature,
}: {
  fieldsBusy: boolean;
  fields: TemplateField[];
  values: Record<string, string | boolean>;
  setValue: (key: string, value: string | boolean) => void;
  signatureImages: Record<string, string>;
  onPickSignature: (f: TemplateField) => void;
  onClearSignature: (f: TemplateField) => void;
}) {
  if (fieldsBusy) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
        Loading template fields…
      </section>
    );
  }
  if (fields.length === 0) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
        This template has no Saintly-side fields. Continue to review and send.
      </section>
    );
  }
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">Saintly fields</h2>
      <p className="mt-1 text-xs text-slate-500">
        Fill in the Saintly side of the document before sending. The recipient won&apos;t see or
        be able to change these — they&apos;ll be flattened onto the final PDF.
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {fields.map((f) => (
          <div key={f.field_key} className="rounded-xl border border-slate-200 p-3">
            <div className="text-xs font-semibold text-slate-700">
              {f.label}
              {f.required !== false ? <span className="text-rose-600"> *</span> : null}
              <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-600">
                {f.field_type}
              </span>
            </div>
            <div className="mt-2">
              {f.field_type === "checkbox" ? (
                <label className="flex items-center gap-2 text-sm text-slate-800">
                  <input
                    type="checkbox"
                    checked={values[f.field_key] === true}
                    onChange={(e) => setValue(f.field_key, e.target.checked)}
                  />
                  <span>{f.label}</span>
                </label>
              ) : f.field_type === "signature" || f.field_type === "initials" ? (
                <div className="flex items-center gap-2">
                  {signatureImages[f.field_key] ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={signatureImages[f.field_key]}
                        alt="Signature"
                        className="h-12 rounded border border-slate-200 bg-white object-contain"
                      />
                      <button
                        type="button"
                        onClick={() => onClearSignature(f)}
                        className="text-xs font-semibold text-rose-600 hover:underline"
                      >
                        Clear
                      </button>
                    </>
                  ) : values[f.field_key] && typeof values[f.field_key] === "string" ? (
                    <span
                      className="rounded border border-slate-200 bg-white px-2 py-1 text-base"
                      style={{ fontFamily: '"Brush Script MT", "Snell Roundhand", cursive' }}
                    >
                      {String(values[f.field_key])}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onPickSignature(f)}
                    className="rounded-full bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-700"
                  >
                    {signatureImages[f.field_key] || values[f.field_key] ? "Change" : "Sign"}
                  </button>
                </div>
              ) : (
                (() => {
                  const isNumberOnly =
                    f.field_type === "tin" ||
                    (f.field_type === "text" && f.options?.validation_kind === "number_only");
                  return (
                    <input
                      type={f.field_type === "date" ? "date" : "text"}
                      inputMode={isNumberOnly ? "numeric" : undefined}
                      pattern={isNumberOnly ? "[0-9]*" : undefined}
                      value={String(values[f.field_key] ?? "")}
                      onChange={(e) =>
                        setValue(
                          f.field_key,
                          isNumberOnly ? e.target.value.replace(/\D+/g, "") : e.target.value
                        )
                      }
                      className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                    />
                  );
                })()
              )}
            </div>
            {f.options?.autofill_source ? (
              <p className="mt-2 text-[11px] text-slate-500">
                Auto-fill: {f.options.autofill_source.replace(/_/g, " ")}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Step 4 — Review & send
// ---------------------------------------------------------------------------
function ReviewStep({
  selectedTemplate,
  title,
  name,
  email,
  phone,
  recipientTypeLabel,
  ttlDays,
  setTtlDays,
  sendEmail,
  setSendEmail,
  sendSms,
  setSendSms,
  message,
  setMessage,
  senderSideFields,
  senderValues,
  senderSignatureImages,
}: {
  selectedTemplate: Template | null;
  title: string;
  name: string;
  email: string;
  phone: string;
  recipientTypeLabel: string;
  ttlDays: number;
  setTtlDays: (v: number) => void;
  sendEmail: boolean;
  setSendEmail: (v: boolean) => void;
  sendSms: boolean;
  setSendSms: (v: boolean) => void;
  message: string;
  setMessage: (v: string) => void;
  senderSideFields: TemplateField[];
  senderValues: Record<string, string | boolean>;
  senderSignatureImages: Record<string, string>;
}) {
  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Review</h2>
        <dl className="mt-3 grid gap-2 text-sm md:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Template</dt>
            <dd className="font-medium text-slate-900">{selectedTemplate?.name || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Document title</dt>
            <dd className="font-medium text-slate-900">{title || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Recipient</dt>
            <dd className="font-medium text-slate-900">
              {name || "—"} · {recipientTypeLabel}
            </dd>
            <dd className="text-xs text-slate-500">
              {email}
              {phone ? ` · ${phone}` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Saintly fields</dt>
            <dd className="text-xs text-slate-700">
              {senderSideFields.length === 0
                ? "None on this template."
                : `${senderSideFields.length} field(s) prefilled.`}
            </dd>
          </div>
        </dl>
        {senderSideFields.length > 0 ? (
          <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200 text-xs">
            {senderSideFields.map((f) => {
              const isSig = f.field_type === "signature" || f.field_type === "initials";
              return (
                <li key={f.field_key} className="flex items-center justify-between px-3 py-1.5">
                  <span className="font-medium text-slate-700">{f.label}</span>
                  <span className="text-slate-500">
                    {isSig
                      ? senderSignatureImages[f.field_key]
                        ? "✓ signed"
                        : senderValues[f.field_key]
                          ? `“${String(senderValues[f.field_key])}”`
                          : "—"
                      : senderValues[f.field_key] === true
                        ? "✓"
                        : senderValues[f.field_key] === false
                          ? "—"
                          : String(senderValues[f.field_key] || "—")}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Delivery</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={sendEmail}
              onChange={(e) => setSendEmail(e.target.checked)}
            />
            Email signing link
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={sendSms}
              onChange={(e) => setSendSms(e.target.checked)}
            />
            Also text the link
          </label>
          <label className="block text-xs text-slate-600">
            Expires in (days)
            <input
              type="number"
              min={1}
              max={90}
              value={ttlDays}
              onChange={(e) => setTtlDays(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
            />
          </label>
        </div>
        <label className="mt-3 block text-xs text-slate-600">
          Note (internal only — not included in email)
          <textarea
            rows={2}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
          />
        </label>
      </div>
    </section>
  );
}
