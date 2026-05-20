"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type TemplateRow = {
  id: string;
  name: string;
  document_type: string;
  version: number;
  is_active: boolean;
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

const DEFAULT_SENDER_STATE = `{\n  "values": {},\n  "signaturePaths": {}\n}`;

export function SendPacketForm({ initialTemplateId }: { initialTemplateId: string | null }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState(1);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [templateId, setTemplateId] = useState("");
  const [crmEntityType, setCrmEntityType] = useState("applicant");
  const [crmEntityId, setCrmEntityId] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [ttlDays, setTtlDays] = useState(14);
  const [sendEmail, setSendEmail] = useState(true);
  const [message, setMessage] = useState("");
  const [smsRequested, setSmsRequested] = useState(false);
  const [senderStateJson, setSenderStateJson] = useState(DEFAULT_SENDER_STATE);
  const [i9ReviewMethod, setI9ReviewMethod] = useState<string>("");
  const [marksIc, setMarksIc] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === templateId) ?? null,
    [templates, templateId]
  );

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

  const applyInitial = useCallback(() => {
    const q =
      initialTemplateId ||
      (typeof searchParams.get === "function" ? searchParams.get("templateId") : null);
    if (q) setTemplateId(q);
  }, [initialTemplateId, searchParams]);

  useEffect(() => {
    applyInitial();
  }, [applyInitial]);

  function validateStep(cur: number): string | null {
    if (cur === 1) {
      if (!templateId) return "Select a template.";
      return null;
    }
    if (cur === 2) {
      if (!crmEntityId.trim()) return "Record ID is required.";
      if (!recipientEmail.trim()) return "Recipient email is required.";
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (step !== 4) return;
    setError(null);
    const v = validateStep(2);
    if (v || !templateId) {
      setError(v || "Select a template.");
      return;
    }
    let senderState: Record<string, unknown> | null = null;
    const raw = senderStateJson.trim();
    if (raw && raw !== "{}") {
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          senderState = parsed as Record<string, unknown>;
        } else {
          setError("Advanced Saintly fields must be a JSON object.");
          return;
        }
      } catch {
        setError("Advanced Saintly fields must be valid JSON.");
        return;
      }
    }

    setBusy(true);
    try {
      const res = await fetch("/api/pdf-sign/admin/create-packet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId,
          crmEntityType,
          crmEntityId: crmEntityId.trim(),
          recipientEmail: recipientEmail.trim(),
          recipientName: recipientName.trim() || undefined,
          recipientPhone: recipientPhone.trim() || undefined,
          ttlDays,
          sendEmail,
          marksIcAgreement: marksIc,
          i9ReviewMethod: selectedTemplate?.document_type === "i9" ? i9ReviewMethod || null : null,
          message: message.trim() || undefined,
          smsRequested,
          senderState,
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
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-8">
      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 shadow-sm">
          {error}
        </div>
      ) : null}

      {/* Step indicator */}
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

      {/* Step 1 */}
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

      {/* Step 2 */}
      {step === 2 ? (
        <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-md shadow-slate-200/40">
          <h2 className="text-lg font-semibold text-slate-900">Step 2 · Recipient information</h2>
          <p className="mt-1 text-sm text-slate-600">
            We’ll email (and optionally text) this person the secure signing link.
          </p>
          <div className="mt-6 grid max-w-3xl gap-5">
            <label className="block text-sm font-medium text-slate-800">
              Recipient name
              <input
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                autoComplete="name"
                placeholder="Full name"
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm shadow-sm"
              />
            </label>
            <label className="block text-sm font-medium text-slate-800">
              Recipient email
              <input
                type="email"
                required
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                autoComplete="email"
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm shadow-sm"
              />
            </label>
            <label className="block text-sm font-medium text-slate-800">
              Recipient phone
              <input
                value={recipientPhone}
                onChange={(e) => setRecipientPhone(e.target.value)}
                type="tel"
                autoComplete="tel"
                placeholder="Mobile for SMS when delivery is enabled"
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm shadow-sm"
              />
            </label>
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
                <span>Email the signing link to the recipient now</span>
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

      {/* Step 3 */}
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
            <span>Also send the link by text message when SMS is enabled for this workflow</span>
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

          <details className="mt-8 group rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-slate-800">
              Advanced Saintly fields JSON
              <span className="ml-2 font-normal text-slate-500">(staff only)</span>
            </summary>
            <p className="mt-2 text-xs text-slate-600">
              Pre-filled internal fields for the final PDF. Leave empty unless instructed by your admin team.
            </p>
            <textarea
              value={senderStateJson}
              onChange={(e) => setSenderStateJson(e.target.value)}
              rows={8}
              className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs"
              spellCheck={false}
            />
          </details>

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

      {/* Step 4 */}
      {step === 4 ? (
        <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-md shadow-slate-200/40">
          <h2 className="text-lg font-semibold text-slate-900">Step 4 · Review & send</h2>
          <p className="mt-1 text-sm text-slate-600">Confirm everything looks correct before sending.</p>

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
              <dt className="text-slate-500">Recipient</dt>
              <dd className="text-right text-slate-900">
                <div className="font-medium">{recipientName || "—"}</div>
                <div className="text-slate-600">{recipientEmail || "—"}</div>
                {recipientPhone ? <div className="text-slate-600">{recipientPhone}</div> : null}
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
                Expires in {ttlDays} days · {sendEmail ? "Email to recipient" : "Do not email yet"}
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
                {smsRequested ? <span className="mr-3">SMS requested</span> : null}
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
  );
}
