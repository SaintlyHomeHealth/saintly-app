"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  attachSalesAgentLeadDocument,
  checkSalesAgentLeadDuplicates,
  createSalesAgentLead,
} from "@/app/sales-agent/actions";
import { ServiceDisciplineCheckboxes } from "@/components/crm/ServiceDisciplineCheckboxes";
import { FormattedPhoneInput } from "@/components/phone/FormattedPhoneInput";
import { MapboxUsAddressInput } from "@/components/address/MapboxUsAddressInput";
import { FormattedDobInput } from "@/components/sales-agent/FormattedDobInput";
import { FormattedSsnInput } from "@/components/sales-agent/FormattedSsnInput";
import { SalesAgentDuplicateWarningModal } from "@/components/sales-agent/SalesAgentDuplicateWarningModal";
import type { SalesAgentDuplicateHit } from "@/lib/sales-agent/sales-agent-lead-duplicate-check";
import {
  salesAgentCreateLeadValidationMessage,
  validateSalesAgentCreateLeadFormData,
} from "@/lib/sales-agent/sales-agent-create-lead-validation";
import { prepareOrderPhoto } from "@/lib/sales-agent/prepare-order-photo";
import {
  formDataWithoutFiles,
  SALES_AGENT_ORDER_PHOTO_FIELDS,
  SALES_AGENT_ORDER_PHOTO_LABELS,
  type SalesAgentOrderPhotoField,
} from "@/lib/sales-agent/sales-agent-order-photos";
import {
  DEFAULT_SALES_AGENT_PATHS,
  type SalesAgentPaths,
} from "@/lib/sales-agent/sales-agent-workspace-paths";

const inp =
  "mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100";

const INSURANCE_TYPES = [
  "Medicare",
  "Medicare Advantage",
  "AHCCCS",
  "Commercial",
  "Other",
] as const;

function CardPhotoInput({
  label,
  selectedName,
  onFile,
}: {
  label: string;
  selectedName: string | null;
  onFile: (file: File | null) => void;
}) {
  return (
    <label className="flex flex-col text-xs font-medium text-slate-600">
      {label}
      <input
        type="file"
        accept="image/*,application/pdf,.heic,.heif"
        className="mt-1 text-sm file:mr-2 file:rounded-full file:border-0 file:bg-sky-50 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-sky-800"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
      {selectedName ? (
        <span className="mt-1 text-[11px] font-normal text-slate-500">{selectedName}</span>
      ) : null}
    </label>
  );
}

type SubmitPhase = "idle" | "preparing" | "checking" | "submitting" | "uploading";

function rethrowNextNavigationError(error: unknown): void {
  if (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string"
  ) {
    const digest = (error as { digest: string }).digest;
    if (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR_FALLBACK")) {
      throw error;
    }
  }
}

type Props = {
  paths?: SalesAgentPaths;
};

export function SalesAgentCreateLeadForm({ paths = DEFAULT_SALES_AGENT_PATHS }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const legacyUrlError = salesAgentCreateLeadValidationMessage(searchParams.get("error"));
  const formRef = useRef<HTMLFormElement>(null);

  const [formError, setFormError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<SalesAgentDuplicateHit[]>([]);
  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false);
  const [phase, setPhase] = useState<SubmitPhase>("idle");
  const [savedLeadId, setSavedLeadId] = useState<string | null>(null);
  const [cardFiles, setCardFiles] = useState<Partial<Record<SalesAgentOrderPhotoField, File | null>>>({});
  const busyRef = useRef(false);
  const submitErrorRef = useRef<HTMLDivElement>(null);
  const pending = phase !== "idle";

  const [patientName, setPatientName] = useState("");
  const [address, setAddress] = useState("");
  const [phoneDisplay, setPhoneDisplay] = useState("");
  const [email, setEmail] = useState("");
  const [dobDisplay, setDobDisplay] = useState("");
  const [ssnDisplay, setSsnDisplay] = useState("");
  const [caregiverName, setCaregiverName] = useState("");
  const [caregiverPhoneDisplay, setCaregiverPhoneDisplay] = useState("");
  const [caregiverRelationship, setCaregiverRelationship] = useState("");
  const [medicareNumber, setMedicareNumber] = useState("");
  const [insuranceType, setInsuranceType] = useState("");
  const [insuranceName, setInsuranceName] = useState("");
  const [insuranceMemberId, setInsuranceMemberId] = useState("");
  const [servicesRequested, setServicesRequested] = useState<string[]>([]);
  const [reasonForReferral, setReasonForReferral] = useState("");
  const [doctorName, setDoctorName] = useState("");
  const [doctorPhoneDisplay, setDoctorPhoneDisplay] = useState("");
  const [facilityName, setFacilityName] = useState("");
  const [notes, setNotes] = useState("");
  const [consent, setConsent] = useState(false);

  const scrollToField = useCallback((field: string | null | undefined) => {
    if (!field || !formRef.current) return;
    const el = formRef.current.querySelector<HTMLElement>(
      `[name="${field}"]:not([type="hidden"]), #${field}`
    );
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (el && "focus" in el && typeof el.focus === "function") {
      el.focus();
    }
  }, []);

  const showValidationError = useCallback(
    (code: string, field?: string | null) => {
      setFormError(salesAgentCreateLeadValidationMessage(code));
      setErrorField(field ?? null);
      scrollToField(field);
    },
    [scrollToField]
  );

  const prepareSelectedPhotos = useCallback(async () => {
    const photos: { field: SalesAgentOrderPhotoField; file: File; label: string }[] = [];
    for (const field of SALES_AGENT_ORDER_PHOTO_FIELDS) {
      const file = cardFiles[field];
      if (!file || file.size < 1) continue;
      const label = SALES_AGENT_ORDER_PHOTO_LABELS[field];
      const prepared = await prepareOrderPhoto(file, label);
      if (!prepared.ok) return prepared;
      photos.push({ field, file: prepared.file, label });
    }
    return { ok: true as const, photos };
  }, [cardFiles]);

  const uploadPhotos = useCallback(
    async (leadId: string, photos: { field: SalesAgentOrderPhotoField; file: File; label: string }[]) => {
      const failed: string[] = [];
      for (const photo of photos) {
        const uploadData = new FormData();
        uploadData.set("leadId", leadId);
        uploadData.set("documentType", photo.field);
        uploadData.set("file", photo.file);
        try {
          const uploaded = await attachSalesAgentLeadDocument(uploadData);
          if (!uploaded.ok) failed.push(photo.label);
        } catch (error) {
          rethrowNextNavigationError(error);
          failed.push(photo.label);
        }
      }
      return failed;
    },
    []
  );

  const runSubmit = useCallback(
    async (form: HTMLFormElement, confirmDuplicate: boolean) => {
      if (busyRef.current || savedLeadId) return;
      busyRef.current = true;
      setFormError(null);
      setErrorField(null);
      setPhase("checking");

      try {
        const fd = formDataWithoutFiles(new FormData(form));
        const validation = validateSalesAgentCreateLeadFormData(fd);
        if (!validation.ok) {
          showValidationError(validation.code, validation.field);
          return;
        }

        setPhase("preparing");
        const prepared = await prepareSelectedPhotos();
        if (!prepared.ok) {
          setFormError(prepared.message);
          return;
        }

        if (!confirmDuplicate) {
          setPhase("checking");
          const hits = await checkSalesAgentLeadDuplicates(fd);
          setDuplicates(hits);
          if (hits.length > 0) {
            setDuplicateModalOpen(true);
            return;
          }
        }

        setPhase("submitting");
        if (confirmDuplicate) fd.set("confirm_duplicate", "1");
        const result = await createSalesAgentLead(fd);
        if (!result.success) {
          if (result.code === "duplicate_found" && result.duplicates?.length) {
            setDuplicates(result.duplicates);
            setDuplicateModalOpen(true);
            return;
          }
          showValidationError(result.code, result.field);
          return;
        }

        if (prepared.photos.length > 0) {
          setPhase("uploading");
          const failed = await uploadPhotos(result.leadId, prepared.photos);
          if (failed.length > 0) {
            setSavedLeadId(result.leadId);
            setFormError(
              `Order saved, but these photos did not upload: ${failed.join(", ")}. Retry the photos or open the order and send them in chat.`
            );
            return;
          }
        }

        router.push(`${paths.leadDetail(result.leadId)}?created=1`);
      } catch (error) {
        rethrowNextNavigationError(error);
        setFormError("Couldn't submit the order. Check your connection and try again.");
      } finally {
        busyRef.current = false;
        setPhase("idle");
      }
    },
    [paths, prepareSelectedPhotos, router, savedLeadId, showValidationError, uploadPhotos]
  );

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await runSubmit(e.currentTarget, false);
  }

  function handleKeepEditing() {
    setDuplicateModalOpen(false);
  }

  function handleSubmitAnyway() {
    const form = formRef.current;
    if (!form) return;
    setDuplicateModalOpen(false);
    void runSubmit(form, true);
  }

  async function retryPhotoUpload() {
    if (!savedLeadId || busyRef.current) return;
    busyRef.current = true;
    setFormError(null);
    setPhase("preparing");
    try {
      const prepared = await prepareSelectedPhotos();
      if (!prepared.ok) {
        setFormError(prepared.message);
        return;
      }
      setPhase("uploading");
      const failed = await uploadPhotos(savedLeadId, prepared.photos);
      if (failed.length > 0) {
        setFormError(
          `These photos still did not upload: ${failed.join(", ")}. Try again, or open the order and send them in chat.`
        );
        return;
      }
      router.push(`${paths.leadDetail(savedLeadId)}?created=1`);
    } catch (error) {
      rethrowNextNavigationError(error);
      setFormError("Couldn't upload the photos. Check your connection and try again.");
    } finally {
      busyRef.current = false;
      setPhase("idle");
    }
  }

  const displayError = formError ?? legacyUrlError;

  useEffect(() => {
    if (!displayError || phase !== "idle") return;
    submitErrorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [displayError, phase]);

  const buttonLabel =
    phase === "preparing"
      ? "Preparing photos…"
      : phase === "checking"
        ? "Checking…"
        : phase === "submitting"
          ? "Submitting…"
          : phase === "uploading"
            ? "Uploading cards…"
            : "Submit order / lead";

  return (
    <div className="space-y-6">
      <SalesAgentDuplicateWarningModal
        open={duplicateModalOpen}
        duplicates={duplicates}
        pending={pending}
        onKeepEditing={handleKeepEditing}
        onSubmitAnyway={handleSubmitAnyway}
      />

      <div>
        <Link href={paths.leads} className="text-sm font-medium text-sky-700 hover:underline">
          ← Back to dashboard
        </Link>
        <h2 className="mt-2 text-xl font-semibold text-slate-900">Create Order / Lead</h2>
        <p className="mt-1 text-sm text-slate-600">
          Submit a new patient referral. Our intake team will follow up and convert eligible leads to patients.
        </p>
      </div>

      {displayError ? (
        <div
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"
          role="alert"
        >
          {displayError}
        </div>
      ) : null}

      <form ref={formRef} onSubmit={handleSubmit} className="space-y-6" noValidate>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">Patient info</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2 flex flex-col text-xs font-medium text-slate-600">
              Patient name *
              <input
                name="patient_name"
                required
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                className={`${inp}${errorField === "patient_name" ? " border-rose-400 ring-rose-100" : ""}`}
                autoComplete="name"
              />
            </label>
            <MapboxUsAddressInput
              required
              className={`${inp}${errorField === "address" ? " border-rose-400 ring-rose-100" : ""}`}
              value={address}
              onValueChange={setAddress}
            />
            <label className="flex flex-col text-xs font-medium text-slate-600">
              Phone number *
              <FormattedPhoneInput
                name="phone_number"
                required
                className={`${inp}${errorField === "phone_number" ? " border-rose-400 ring-rose-100" : ""}`}
                value={phoneDisplay}
                onValueChange={setPhoneDisplay}
              />
            </label>
            <label className="flex flex-col text-xs font-medium text-slate-600">
              Email
              <input
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inp}
                autoComplete="email"
              />
            </label>
            <label className="flex flex-col text-xs font-medium text-slate-600">
              Date of birth *
              <FormattedDobInput
                name="date_of_birth"
                required
                className={`${inp}${errorField === "date_of_birth" ? " border-rose-400 ring-rose-100" : ""}`}
                value={dobDisplay}
                onValueChange={setDobDisplay}
              />
            </label>
            <label className="flex flex-col text-xs font-medium text-slate-600">
              Social Security Number
              <FormattedSsnInput
                className={`${inp}${errorField === "social_security_number" ? " border-rose-400 ring-rose-100" : ""}`}
                value={ssnDisplay}
                onValueChange={setSsnDisplay}
              />
            </label>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">Caregiver info</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col text-xs font-medium text-slate-600">
              Caregiver name
              <input
                name="caregiver_name"
                value={caregiverName}
                onChange={(e) => setCaregiverName(e.target.value)}
                className={inp}
              />
            </label>
            <label className="flex flex-col text-xs font-medium text-slate-600">
              Caregiver phone
              <FormattedPhoneInput
                name="caregiver_phone_number"
                className={inp}
                value={caregiverPhoneDisplay}
                onValueChange={setCaregiverPhoneDisplay}
              />
            </label>
            <label className="sm:col-span-2 flex flex-col text-xs font-medium text-slate-600">
              Relationship to patient
              <input
                name="caregiver_relationship"
                value={caregiverRelationship}
                onChange={(e) => setCaregiverRelationship(e.target.value)}
                className={inp}
                placeholder="Spouse, daughter, etc."
              />
            </label>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">Insurance info</h3>
          <p className="mt-1 text-xs text-slate-500">
            Select a type or type the plan name (for example UnitedHealthcare Advantage). At least one is required.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col text-xs font-medium text-slate-600">
              Medicare number
              <input
                name="medicare_number"
                value={medicareNumber}
                onChange={(e) => setMedicareNumber(e.target.value)}
                className={inp}
                autoComplete="off"
                inputMode="text"
              />
            </label>
            <label className="flex flex-col text-xs font-medium text-slate-600">
              Insurance type
              <select
                name="insurance_type"
                value={insuranceType}
                onChange={(e) => setInsuranceType(e.target.value)}
                className={`${inp}${errorField === "insurance_type" ? " border-rose-400 ring-rose-100" : ""}`}
              >
                <option value="">— Select —</option>
                {INSURANCE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col text-xs font-medium text-slate-600">
              Insurance name / plan
              <input
                name="insurance_name"
                value={insuranceName}
                onChange={(e) => setInsuranceName(e.target.value)}
                className={inp}
              />
            </label>
            <label className="flex flex-col text-xs font-medium text-slate-600">
              Member ID
              <input
                name="insurance_member_id"
                value={insuranceMemberId}
                onChange={(e) => setInsuranceMemberId(e.target.value)}
                className={inp}
              />
            </label>
            <p className="sm:col-span-2 text-[11px] font-normal text-slate-500">
              Phone pictures are resized before they upload, so Submit can finish even with a large photo.
            </p>
            {SALES_AGENT_ORDER_PHOTO_FIELDS.map((field) => (
              <CardPhotoInput
                key={field}
                label={SALES_AGENT_ORDER_PHOTO_LABELS[field]}
                selectedName={cardFiles[field]?.name ?? null}
                onFile={(file) => setCardFiles((current) => ({ ...current, [field]: file }))}
              />
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">Referral / clinical info</h3>
          <div className="mt-4 space-y-4">
            <div>
              <p className="text-xs font-medium text-slate-600">Services requested</p>
              <ServiceDisciplineCheckboxes
                name="services_requested"
                className="mt-2 flex flex-wrap gap-3"
                selected={servicesRequested}
                onSelectedChange={setServicesRequested}
              />
            </div>
            <label className="flex flex-col text-xs font-medium text-slate-600">
              Reason for referral
              <textarea
                name="reason_for_referral"
                rows={2}
                value={reasonForReferral}
                onChange={(e) => setReasonForReferral(e.target.value)}
                className={inp}
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col text-xs font-medium text-slate-600">
                Doctor / PCP name
                <input
                  name="doctor_or_pcp_name"
                  value={doctorName}
                  onChange={(e) => setDoctorName(e.target.value)}
                  className={inp}
                />
              </label>
              <label className="flex flex-col text-xs font-medium text-slate-600">
                Doctor / PCP phone
                <FormattedPhoneInput
                  name="doctor_or_pcp_phone"
                  className={`${inp}${errorField === "doctor_or_pcp_phone" ? " border-rose-400 ring-rose-100" : ""}`}
                  value={doctorPhoneDisplay}
                  onValueChange={setDoctorPhoneDisplay}
                />
              </label>
              <label className="sm:col-span-2 flex flex-col text-xs font-medium text-slate-600">
                Facility / hospital name
                <input
                  name="facility_or_hospital_name"
                  value={facilityName}
                  onChange={(e) => setFacilityName(e.target.value)}
                  className={inp}
                />
              </label>
            </div>
            <label className="flex flex-col text-xs font-medium text-slate-600">
              Notes
              <textarea
                name="notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className={inp}
              />
            </label>
          </div>
        </section>

        <section className="rounded-2xl border border-amber-100 bg-amber-50/60 p-5">
          <label className="flex cursor-pointer items-start gap-3 text-sm text-slate-800">
            <input
              type="checkbox"
              name="consent_to_contact"
              required
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className={`mt-1 rounded border-slate-300 text-sky-600 focus:ring-sky-500${
                errorField === "consent_to_contact" ? " border-rose-400" : ""
              }`}
            />
            <span>
              Patient/caregiver gave permission for Saintly Home Health to contact them regarding home health
              services. *
            </span>
          </label>
        </section>

        {displayError ? (
          <div
            ref={submitErrorRef}
            className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"
            role="alert"
          >
            {displayError}
          </div>
        ) : (
          <div ref={submitErrorRef} />
        )}

        <div className="flex flex-wrap gap-3">
          {savedLeadId ? (
            <>
              <button
                type="button"
                disabled={pending}
                onClick={() => void retryPhotoUpload()}
                className="rounded-full bg-sky-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 disabled:opacity-60"
              >
                {pending ? buttonLabel : "Retry photo upload"}
              </button>
              <Link
                href={`${paths.leadDetail(savedLeadId)}?created=1&cards=missing`}
                className="rounded-full border border-slate-200 bg-white px-6 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                View order
              </Link>
            </>
          ) : (
            <button
              type="submit"
              disabled={pending}
              className="rounded-full bg-sky-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 disabled:opacity-60"
            >
              {buttonLabel}
            </button>
          )}
          <Link
            href={paths.leads}
            className="rounded-full border border-slate-200 bg-white px-6 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

/** @deprecated Use SalesAgentCreateLeadForm */
export const SalesAgentNewLeadForm = SalesAgentCreateLeadForm;
