"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import {
  linkFaxPatientAction,
  rerunFaxExtractionAction,
  updateFaxStructuredFieldsAction,
} from "@/app/admin/fax/actions";
import { fx } from "@/app/admin/fax/_components/fax-tokens";
import {
  FAX_DOCUMENT_TYPES,
  FAX_DOCUMENT_TYPE_LABEL,
  FAX_TRIAGE_STATES,
  FAX_TRIAGE_LABEL,
  type FaxDocumentType,
} from "@/lib/fax/fax-extraction-types";

type StaffOption = { userId: string; name: string };

type FaxStructuredPanelProps = {
  faxId: string;
  patientName: string | null;
  patientDob: string | null;
  documentType: string | null;
  serviceDate: string | null;
  payer: string | null;
  senderOrg: string | null;
  referringProvider: string | null;
  clinician: string | null;
  assignedToUserId: string | null;
  triageState: string | null;
  sourcePage: number | null;
  patientId: string | null;
  patientMatchStatus: string | null;
  extractionStatus: string | null;
  staffOptions: StaffOption[];
  nearMatch?: { patientId: string; displayName: string } | null;
  onJumpPage?: (page: number) => void;
};

export function FaxStructuredPanel(props: FaxStructuredPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sourcePageHref = props.sourcePage
    ? `?${new URLSearchParams({
        ...Object.fromEntries(searchParams.entries()),
        page: String(props.sourcePage),
      }).toString()}`
    : "#";
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState({
    patientName: props.patientName ?? "",
    patientDob: props.patientDob ?? "",
    documentType: props.documentType ?? "",
    serviceDate: props.serviceDate ?? "",
    payer: props.payer ?? "",
    senderOrg: props.senderOrg ?? "",
    referringProvider: props.referringProvider ?? "",
    clinician: props.clinician ?? "",
    assignedToUserId: props.assignedToUserId ?? "",
    triageState: props.triageState ?? "new",
  });

  function save(patch: Partial<typeof values>) {
    setError(null);
    startTransition(async () => {
      const result = await updateFaxStructuredFieldsAction({
        faxId: props.faxId,
        patientName: patch.patientName ?? values.patientName,
        patientDob: patch.patientDob ?? values.patientDob,
        documentType: patch.documentType ?? values.documentType,
        serviceDate: patch.serviceDate ?? values.serviceDate,
        payer: patch.payer ?? values.payer,
        senderOrg: patch.senderOrg ?? values.senderOrg,
        referringProvider: patch.referringProvider ?? values.referringProvider,
        clinician: patch.clinician ?? values.clinician,
        assignedToUserId: patch.assignedToUserId ?? values.assignedToUserId,
        triageState: patch.triageState ?? values.triageState,
      });
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <section className={`${fx.card} p-4`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-[14px] font-bold">Extracted fields</h2>
        <button
          type="button"
          className={fx.btnSecondary}
          disabled={pending}
          onClick={() => {
            startTransition(async () => {
              const result = await rerunFaxExtractionAction(props.faxId);
              if (!result.ok) setError(result.error);
              else router.refresh();
            });
          }}
        >
          {pending ? "Working…" : "Re-run extraction"}
        </button>
      </div>
      {props.extractionStatus === "needs_review" || props.extractionStatus === "media_missing" ? (
        <p className={`${fx.chipWarn} mb-3`}>Needs review</p>
      ) : null}
      <div className="grid gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-semibold text-[color:var(--fx-text-muted)]">
            Patient
            {props.sourcePage ? (
              <a
                href={sourcePageHref}
                className="ml-2 text-[var(--fx-accent)] underline"
                onClick={(e) => {
                  if (props.onJumpPage) {
                    e.preventDefault();
                    props.onJumpPage(props.sourcePage!);
                  }
                }}
              >
                p.{props.sourcePage}
              </a>
            ) : null}
          </span>
          <input
            className={fx.input}
            value={values.patientName}
            onChange={(e) => setValues((v) => ({ ...v, patientName: e.target.value }))}
            onBlur={() => save({ patientName: values.patientName })}
          />
          {props.patientId ? (
            <Link href={`/admin/crm/patients/${props.patientId}`} className="text-[12px] text-[var(--fx-accent)] underline">
              Open patient record
            </Link>
          ) : props.nearMatch ? (
            <button
              type="button"
              className={fx.btnSecondary}
              onClick={() => {
                startTransition(async () => {
                  const result = await linkFaxPatientAction({
                    faxId: props.faxId,
                    patientId: props.nearMatch!.patientId,
                  });
                  if (!result.ok) setError(result.error);
                  else router.refresh();
                });
              }}
            >
              Link to {props.nearMatch.displayName}
            </button>
          ) : null}
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-semibold text-[color:var(--fx-text-muted)]">DOB</span>
          <input
            className={`${fx.input} tabular-nums`}
            value={values.patientDob}
            onChange={(e) => setValues((v) => ({ ...v, patientDob: e.target.value }))}
            onBlur={() => save({ patientDob: values.patientDob })}
            placeholder="YYYY-MM-DD"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-semibold text-[color:var(--fx-text-muted)]">Document type</span>
          <select
            className={fx.input}
            value={values.documentType}
            onChange={(e) => {
              const documentType = e.target.value;
              setValues((v) => ({ ...v, documentType }));
              save({ documentType });
            }}
          >
            <option value="">—</option>
            {FAX_DOCUMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {FAX_DOCUMENT_TYPE_LABEL[t as FaxDocumentType]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-semibold text-[color:var(--fx-text-muted)]">Service date</span>
          <input
            className={`${fx.input} tabular-nums`}
            value={values.serviceDate}
            onChange={(e) => setValues((v) => ({ ...v, serviceDate: e.target.value }))}
            onBlur={() => save({ serviceDate: values.serviceDate })}
            placeholder="YYYY-MM-DD"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-semibold text-[color:var(--fx-text-muted)]">Payer</span>
          <input
            className={fx.input}
            value={values.payer}
            onChange={(e) => setValues((v) => ({ ...v, payer: e.target.value }))}
            onBlur={() => save({ payer: values.payer })}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-semibold text-[color:var(--fx-text-muted)]">Referring provider</span>
          <input
            className={fx.input}
            value={values.referringProvider}
            onChange={(e) => setValues((v) => ({ ...v, referringProvider: e.target.value }))}
            onBlur={() => save({ referringProvider: values.referringProvider })}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-semibold text-[color:var(--fx-text-muted)]">Clinician</span>
          <input
            className={fx.input}
            value={values.clinician}
            onChange={(e) => setValues((v) => ({ ...v, clinician: e.target.value }))}
            onBlur={() => save({ clinician: values.clinician })}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-semibold text-[color:var(--fx-text-muted)]">Sender org</span>
          <input
            className={fx.input}
            value={values.senderOrg}
            onChange={(e) => setValues((v) => ({ ...v, senderOrg: e.target.value }))}
            onBlur={() => save({ senderOrg: values.senderOrg })}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-semibold text-[color:var(--fx-text-muted)]">Assigned to</span>
          <select
            className={fx.input}
            value={values.assignedToUserId}
            onChange={(e) => {
              const assignedToUserId = e.target.value;
              setValues((v) => ({ ...v, assignedToUserId }));
              save({ assignedToUserId });
            }}
          >
            <option value="">Unassigned</option>
            {props.staffOptions.map((s) => (
              <option key={s.userId} value={s.userId}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-semibold text-[color:var(--fx-text-muted)]">Status</span>
          <select
            className={fx.input}
            value={values.triageState}
            onChange={(e) => {
              const triageState = e.target.value;
              setValues((v) => ({ ...v, triageState }));
              save({ triageState });
            }}
          >
            {FAX_TRIAGE_STATES.map((s) => (
              <option key={s} value={s}>
                {FAX_TRIAGE_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error ? <p className="mt-2 text-[13px] text-rose-800">{error}</p> : null}
    </section>
  );
}
