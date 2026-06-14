"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Building2, ClipboardList, FileUp, HeartHandshake, ShieldCheck } from "lucide-react";

import { MarketingSiteFooter } from "@/components/marketing/MarketingSiteFooter";
import { MarketingSiteHeader } from "@/components/marketing/MarketingSiteHeader";
import { PHONE_DISPLAY, TEL } from "@/components/marketing/marketing-constants";
import {
  BG_CREAM_GOLD,
  BTN_GOLD_SM,
  CREAM,
  GoldIconTile,
  NAVY,
  SectionEyebrow,
} from "@/components/marketing/marketing-design";
import { MARKETING_NAV_DEFAULT } from "@/components/marketing/marketing-nav";
import { formatUsPhoneInput } from "@/lib/phone/us-phone-format";
import {
  PUBLIC_REFERRAL_SERVICE_OPTIONS,
  publicReferralErrorMessage,
} from "@/lib/crm/public-referral-types";
import {
  LEAD_REFERRAL_DOCUMENT_MAX_BYTES,
  LEAD_REFERRAL_DOCUMENT_MAX_FILES,
  LEAD_REFERRAL_DOCUMENT_TYPE_LABELS,
  LEAD_REFERRAL_DOCUMENT_TYPES,
} from "@/lib/crm/lead-referral-documents-constants";
import "@/components/marketing/marketing-home.css";

type PublicReferralFormProps = {
  source?: string;
  token?: string | null;
};

type PendingReferralDocument = {
  id: string;
  file: File;
  documentType: string;
};

export function PublicReferralForm({ source = "printed_materials", token = null }: PublicReferralFormProps) {
  const [referringFacilityName, setReferringFacilityName] = useState("");
  const [referringContactName, setReferringContactName] = useState("");
  const [referringContactPhone, setReferringContactPhone] = useState("");
  const [referringContactEmail, setReferringContactEmail] = useState("");
  const [referringOfficeCity, setReferringOfficeCity] = useState("");
  const [referringOfficePhone, setReferringOfficePhone] = useState("");
  const [patientFirstName, setPatientFirstName] = useState("");
  const [patientLastName, setPatientLastName] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [patientDob, setPatientDob] = useState("");
  const [payer, setPayer] = useState("");
  const [serviceNeeded, setServiceNeeded] = useState<string>(PUBLIC_REFERRAL_SERVICE_OPTIONS[0].value);
  const [notes, setNotes] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [documentWarning, setDocumentWarning] = useState<string | null>(null);
  const [documents, setDocuments] = useState<PendingReferralDocument[]>([]);
  const [submitted, setSubmitted] = useState(false);

  const maxMb = Math.round(LEAD_REFERRAL_DOCUMENT_MAX_BYTES / (1024 * 1024));

  const fieldCls =
    "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[15px] text-slate-900 shadow-sm outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-200/80";

  const sectionTitle = useMemo(
    () => "text-sm font-bold uppercase tracking-wide text-[#0c1929]/70",
    []
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDocumentWarning(null);
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("source", source);
      if (token) fd.set("token", token);
      fd.set("referring_facility_name", referringFacilityName);
      fd.set("referring_contact_name", referringContactName);
      fd.set("referring_contact_phone", referringContactPhone);
      fd.set("referring_contact_email", referringContactEmail);
      fd.set("referring_office_city", referringOfficeCity);
      fd.set("referring_office_phone", referringOfficePhone);
      fd.set("patient_first_name", patientFirstName);
      fd.set("patient_last_name", patientLastName);
      fd.set("patient_phone", patientPhone);
      if (patientDob) fd.set("patient_dob", patientDob);
      fd.set("payer", payer);
      fd.set("service_needed", serviceNeeded);
      fd.set("notes", notes);
      fd.set("acknowledged", acknowledged ? "true" : "false");

      for (const doc of documents) {
        fd.append("documents", doc.file);
      }
      fd.set(
        "document_types",
        JSON.stringify(documents.map((d) => (d.documentType === "other" ? null : d.documentType)))
      );

      const res = await fetch("/api/public/referrals", {
        method: "POST",
        body: fd,
      });
      const data = (await res.json()) as {
        ok?: boolean;
        message?: string;
        error?: string;
        document_warning?: string;
      };

      if (!res.ok || !data.ok) {
        setError(data.message ?? publicReferralErrorMessage(data.error ?? "server_error"));
        return;
      }

      if (data.document_warning) {
        setDocumentWarning(data.document_warning);
      }

      setSubmitted(true);
    } catch {
      setError("We could not reach the server. Please try again or call Saintly directly.");
    } finally {
      setPending(false);
    }
  }

  function addDocuments(fileList: FileList | null) {
    if (!fileList?.length) return;
    setError(null);
    const next = [...documents];
    for (const file of Array.from(fileList)) {
      if (next.length >= LEAD_REFERRAL_DOCUMENT_MAX_FILES) {
        setError(`You can upload up to ${LEAD_REFERRAL_DOCUMENT_MAX_FILES} files.`);
        break;
      }
      if (file.size > LEAD_REFERRAL_DOCUMENT_MAX_BYTES) {
        setError(`Each file must be ${maxMb} MB or smaller.`);
        continue;
      }
      next.push({
        id: crypto.randomUUID(),
        file,
        documentType: "other",
      });
    }
    setDocuments(next);
  }

  function removeDocument(id: string) {
    setDocuments((prev) => prev.filter((d) => d.id !== id));
  }

  function updateDocumentType(id: string, documentType: string) {
    setDocuments((prev) => prev.map((d) => (d.id === id ? { ...d, documentType } : d)));
  }

  if (submitted) {
    return (
      <div className="rounded-[1.75rem] border border-emerald-200/80 bg-white/95 p-8 text-center shadow-[0_28px_70px_-28px_rgba(15,23,42,0.18)] ring-1 ring-emerald-100/60 sm:p-10">
        <GoldIconTile size="lg" className="mx-auto">
          <HeartHandshake className="h-7 w-7 text-[#0c1929]" aria-hidden />
        </GoldIconTile>
        <h2 className="mt-5 text-2xl font-semibold tracking-tight text-[#0c1929]">Thank you</h2>
        <p className="mx-auto mt-3 max-w-md text-[1.05rem] leading-relaxed text-slate-700">
          Saintly Home Health received the referral and will follow up with the patient or representative.
        </p>
        {documentWarning ? (
          <p className="mx-auto mt-4 max-w-md rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            {documentWarning}
          </p>
        ) : null}
        <p className="mt-6 text-sm text-slate-600">
          Questions? Call{" "}
          <a href={TEL} className="font-semibold text-[#0c1929] underline-offset-2 hover:underline">
            {PHONE_DISPLAY}
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <form
      className="rounded-[1.75rem] border border-amber-100/70 bg-white/95 p-6 shadow-[0_28px_70px_-28px_rgba(15,23,42,0.18)] ring-1 ring-amber-100/40 sm:p-8"
      onSubmit={handleSubmit}
      noValidate
    >
      {error ? (
        <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {error}
        </p>
      ) : null}

      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <GoldIconTile size="sm">
            <Building2 className="h-4 w-4 text-[#0c1929]" aria-hidden />
          </GoldIconTile>
          <h2 className={sectionTitle}>Referring office</h2>
        </div>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-800">Referring office / facility name *</span>
          <input
            type="text"
            required
            value={referringFacilityName}
            onChange={(e) => setReferringFacilityName(e.target.value)}
            className={fieldCls}
            autoComplete="organization"
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-800">Referring contact name</span>
            <input
              type="text"
              value={referringContactName}
              onChange={(e) => setReferringContactName(e.target.value)}
              className={fieldCls}
              autoComplete="name"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-800">Referring contact phone</span>
            <input
              type="tel"
              value={referringContactPhone}
              onChange={(e) => setReferringContactPhone(formatUsPhoneInput(e.target.value))}
              className={fieldCls}
              autoComplete="tel"
            />
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-800">Referring contact email</span>
            <input
              type="email"
              value={referringContactEmail}
              onChange={(e) => setReferringContactEmail(e.target.value)}
              className={fieldCls}
              autoComplete="email"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-800">Office city</span>
            <input
              type="text"
              value={referringOfficeCity}
              onChange={(e) => setReferringOfficeCity(e.target.value)}
              className={fieldCls}
            />
          </label>
        </div>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-800">Office phone</span>
          <input
            type="tel"
            value={referringOfficePhone}
            onChange={(e) => setReferringOfficePhone(formatUsPhoneInput(e.target.value))}
            className={fieldCls}
            autoComplete="tel"
          />
        </label>
      </section>

      <section className="mt-8 space-y-4 border-t border-slate-100 pt-8">
        <div className="flex items-center gap-3">
          <GoldIconTile size="sm">
            <ClipboardList className="h-4 w-4 text-[#0c1929]" aria-hidden />
          </GoldIconTile>
          <h2 className={sectionTitle}>Patient / prospect</h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-800">Patient first name *</span>
            <input
              type="text"
              required
              value={patientFirstName}
              onChange={(e) => setPatientFirstName(e.target.value)}
              className={fieldCls}
              autoComplete="given-name"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-800">Patient last name *</span>
            <input
              type="text"
              required
              value={patientLastName}
              onChange={(e) => setPatientLastName(e.target.value)}
              className={fieldCls}
              autoComplete="family-name"
            />
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-800">Patient phone *</span>
            <input
              type="tel"
              required
              value={patientPhone}
              onChange={(e) => setPatientPhone(formatUsPhoneInput(e.target.value))}
              className={fieldCls}
              autoComplete="tel"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-800">Patient date of birth</span>
            <input
              type="date"
              value={patientDob}
              onChange={(e) => setPatientDob(e.target.value)}
              className={fieldCls}
            />
          </label>
        </div>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-800">Insurance / payer</span>
          <input
            type="text"
            value={payer}
            onChange={(e) => setPayer(e.target.value)}
            className={fieldCls}
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-800">Service needed *</span>
          <select
            required
            value={serviceNeeded}
            onChange={(e) => setServiceNeeded(e.target.value)}
            className={fieldCls}
          >
            {PUBLIC_REFERRAL_SERVICE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-800">Referral notes</span>
          <textarea
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={`${fieldCls} resize-y`}
          />
        </label>
      </section>

      <section className="mt-8 space-y-4 border-t border-slate-100 pt-8">
        <div className="flex items-center gap-3">
          <GoldIconTile size="sm">
            <FileUp className="h-4 w-4 text-[#0c1929]" aria-hidden />
          </GoldIconTile>
          <div>
            <h2 className={sectionTitle}>Referral documents</h2>
            <p className="mt-1 text-sm text-slate-600">
              Upload referral documents such as a face sheet, order, insurance card, or clinical notes.
            </p>
          </div>
        </div>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-800">Files (optional)</span>
          <input
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.webp,.docx,application/pdf,image/jpeg,image/png,image/webp,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className={fieldCls}
            disabled={pending || documents.length >= LEAD_REFERRAL_DOCUMENT_MAX_FILES}
            onChange={(e) => {
              addDocuments(e.target.files);
              e.target.value = "";
            }}
          />
          <span className="text-xs text-slate-500">
            Accepted: PDF, JPG, PNG, DOCX. Max {maxMb} MB each, up to {LEAD_REFERRAL_DOCUMENT_MAX_FILES} files.
          </span>
        </label>

        {documents.length > 0 ? (
          <ul className="space-y-2">
            {documents.map((doc) => (
              <li
                key={doc.id}
                className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">{doc.file.name}</p>
                  <p className="text-xs text-slate-500">{(doc.file.size / (1024 * 1024)).toFixed(1)} MB</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={doc.documentType}
                    onChange={(e) => updateDocumentType(doc.id, e.target.value)}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800"
                    disabled={pending}
                  >
                    {LEAD_REFERRAL_DOCUMENT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {LEAD_REFERRAL_DOCUMENT_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => removeDocument(doc.id)}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                    disabled={pending}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="mt-8 space-y-4 border-t border-slate-100 pt-8">
        <label className="flex items-start gap-3 text-sm leading-relaxed text-slate-700">
          <input
            type="checkbox"
            required
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-slate-300 text-amber-500 focus:ring-amber-400"
          />
          <span>
            I understand Saintly Home Health will contact the patient or representative to follow up.
          </span>
        </label>

        <button type="submit" disabled={pending} className={`${BTN_GOLD_SM} w-full sm:w-auto`}>
          {pending ? "Submitting…" : "Submit Referral"}
        </button>

        <p className="flex items-start gap-2 text-xs leading-relaxed text-slate-600">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden />
          <span>
            Secure referral intake for partner offices. For urgent needs, call{" "}
            <a href={TEL} className="font-medium text-[#0c1929] underline-offset-2 hover:underline">
              {PHONE_DISPLAY}
            </a>
            .
          </span>
        </p>
      </section>
    </form>
  );
}

type PublicReferralPageShellProps = {
  source?: string;
  token?: string | null;
  headingNote?: string;
};

export function PublicReferralPageShell({ source, token, headingNote }: PublicReferralPageShellProps) {
  return (
    <div className="min-h-screen" style={{ background: CREAM }}>
      <MarketingSiteHeader navLinks={MARKETING_NAV_DEFAULT} />

      <main>
        <section
          className="relative overflow-hidden px-4 pb-12 pt-10 sm:px-6 sm:pb-16 sm:pt-14"
          style={{ background: BG_CREAM_GOLD }}
        >
          <div className="mx-auto max-w-3xl">
            <SectionEyebrow>Partner referral</SectionEyebrow>
            <h1
              className="mt-3 text-[2rem] font-semibold leading-tight tracking-tight sm:text-[2.35rem]"
              style={{ color: NAVY }}
            >
              Send a Referral to Saintly Home Health
            </h1>
            <p className="mt-4 max-w-2xl text-[1.05rem] leading-relaxed text-slate-700">
              Use this secure form to send a patient referral from your office. Saintly&apos;s intake team will follow
              up directly with the patient or their representative.
            </p>
            {headingNote ? (
              <p className="mt-2 text-sm font-medium text-slate-600">{headingNote}</p>
            ) : null}
            <p className="mt-3 text-sm text-slate-600">
              Prefer phone or fax? Visit our{" "}
              <Link href="/referrals" className="font-medium text-[#0c1929] underline-offset-2 hover:underline">
                referrals page
              </Link>
              .
            </p>

            <div className="mt-8">
              <PublicReferralForm source={source} token={token} />
            </div>
          </div>
        </section>
      </main>

      <MarketingSiteFooter />
    </div>
  );
}
