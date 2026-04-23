"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ExternalLink, MessageSquare, Phone, StickyNote, X } from "lucide-react";

import { createLeadFromContact } from "@/app/admin/phone/actions";
import { labelForContactType } from "@/lib/crm/contact-types";
import {
  buildWorkspaceInboxNewSmsHref,
  buildWorkspaceKeypadCallHref,
  buildWorkspaceSmsToContactHref,
} from "@/lib/workspace-phone/launch-urls";

const btnPrimary =
  "inline-flex min-h-[40px] flex-1 items-center justify-center rounded-xl bg-gradient-to-r from-blue-950 via-blue-700 to-sky-500 px-3 py-2.5 text-sm font-semibold text-white shadow-sm shadow-blue-900/20 transition hover:brightness-105 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40";
const btnSecondary =
  "inline-flex min-h-[40px] flex-1 items-center justify-center rounded-xl border border-sky-200/90 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-sky-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40";
const inputCls =
  "mt-1 w-full rounded-xl border border-slate-200/90 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-sky-500/20 focus:ring-2";
const labelCls = "text-[11px] font-bold uppercase tracking-wide text-slate-500";

export type QuickSaveKindUi = "contact" | "lead" | "patient" | "employee" | "facility_vendor";

const KIND_OPTIONS: { value: QuickSaveKindUi; label: string }[] = [
  { value: "contact", label: "Contact" },
  { value: "lead", label: "Lead" },
  { value: "patient", label: "Patient" },
  { value: "employee", label: "Employee" },
  { value: "facility_vendor", label: "Facility / Vendor" },
];

type FormStep = "form" | "success" | "duplicate";

type DupPayload = {
  id: string;
  displayName: string;
  contactType: string | null;
  hasActiveLead: boolean;
  hasPatient: boolean;
};

export type QuickSaveContactSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** E.164 when known; empty while resolving */
  initialE164: string;
  initialName?: string;
  phoneCallId?: string | null;
  /** When open becomes true, reset step to form */
  resetKey?: string | number;
};

export function QuickSaveContactSheet({
  open,
  onOpenChange,
  initialE164,
  initialName = "",
  phoneCallId = null,
  resetKey = 0,
}: QuickSaveContactSheetProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [kind, setKind] = useState<QuickSaveKindUi>("contact");
  const [step, setStep] = useState<FormStep>("form");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [dup, setDup] = useState<DupPayload | null>(null);
  const [result, setResult] = useState<{
    contactId: string;
    displayName: string;
    e164: string;
    kind: QuickSaveKindUi;
    leadId: string | null;
    patientId: string | null;
  } | null>(null);
  const [moveBusy, setMoveBusy] = useState<"lead" | "fv" | null>(null);
  const [moveErr, setMoveErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(initialName);
    setNotes("");
    setKind("contact");
    setStep("form");
    setErr(null);
    setDup(null);
    setResult(null);
    setMoveErr(null);
  }, [open, initialName, resetKey]);

  const close = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const submit = useCallback(async () => {
    if (!initialE164.trim()) {
      setErr("Enter a valid phone number first.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const r = await fetch("/api/workspace/phone/quick-save-contact", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: initialE164,
          name: name.trim(),
          notes: notes.trim(),
          kind,
          phoneCallId: phoneCallId ?? undefined,
        }),
      });
      const data = (await r.json()) as {
        ok?: string | boolean;
        error?: string;
        message?: string;
        contact?: DupPayload;
        contactId?: string;
        displayName?: string;
        e164?: string;
        kind?: QuickSaveKindUi;
        leadId?: string | null;
        patientId?: string | null;
      };
      if (data.ok === "duplicate" && data.contact) {
        setDup(data.contact);
        setStep("duplicate");
        return;
      }
      if (!r.ok || data.ok !== true) {
        setErr(data.message || data.error || "Could not save contact.");
        return;
      }
      if (data.contactId && data.e164) {
        setResult({
          contactId: data.contactId,
          displayName: data.displayName || data.e164,
          e164: data.e164,
          kind: (data.kind as QuickSaveKindUi) || "contact",
          leadId: data.leadId ?? null,
          patientId: data.patientId ?? null,
        });
        setStep("success");
        router.refresh();
      }
    } catch {
      setErr("Network error. Try again.");
    } finally {
      setSaving(false);
    }
  }, [initialE164, name, notes, kind, phoneCallId, router]);

  const moveToLead = useCallback(async () => {
    if (!result?.contactId) return;
    setMoveBusy("lead");
    setMoveErr(null);
    const r = await createLeadFromContact(result.contactId);
    if (!r.ok) {
      setMoveErr(
        r.error === "active_lead_exists"
          ? "Already linked to a lead — open the lead from CRM or workspace."
          : r.error === "already_patient"
            ? "This contact is already a patient."
            : "Could not create lead."
      );
      setMoveBusy(null);
      return;
    }
    setResult((prev) => (prev ? { ...prev, leadId: r.leadId, kind: "lead" } : prev));
    setMoveBusy(null);
    router.refresh();
  }, [result?.contactId, router]);

  const moveToFacilityVendor = useCallback(async () => {
    if (!result?.contactId) return;
    setMoveBusy("fv");
    setMoveErr(null);
    try {
      const r = await fetch("/api/workspace/phone/quick-save-contact", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: result.contactId, kind: "facility_vendor" }),
      });
      const data = (await r.json()) as { ok?: boolean; error?: string };
      if (!r.ok || !data.ok) {
        setMoveErr(data.error || "Could not update type.");
        setMoveBusy(null);
        return;
      }
      setResult((prev) => (prev ? { ...prev, kind: "facility_vendor" } : prev));
      router.refresh();
    } catch {
      setMoveErr("Network error.");
    } finally {
      setMoveBusy(null);
    }
  }, [result?.contactId, router]);

  if (!open) return null;

  const e164 = initialE164.trim();
  const callHref = e164
    ? buildWorkspaceKeypadCallHref({ dial: e164, contactId: result?.contactId, placeCall: true })
    : null;
  const composeSmsHref = e164
    ? buildWorkspaceInboxNewSmsHref({
        phone: e164,
        contactId: result?.contactId ?? dup?.id,
        name: result?.displayName,
      })
    : null;
  const threadHref = result?.contactId
    ? buildWorkspaceSmsToContactHref({ contactId: result.contactId, leadId: result.leadId ?? undefined })
    : null;
  const dupThreadHref = dup?.id
    ? buildWorkspaceSmsToContactHref({
        contactId: dup.id,
      })
    : null;
  const crmContactHref = result?.contactId ? `/admin/crm/contacts/${result.contactId}` : null;
  const crmLeadHref = result?.leadId ? `/admin/crm/leads/${result.leadId}` : null;
  const patientHref = result?.patientId ? `/workspace/phone/patients/${result.patientId}` : null;
  const dupCrmHref = dup?.id ? `/admin/crm/contacts/${dup.id}` : null;

  return (
    <div
      className="fixed inset-0 z-[220] flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Save contact"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/30 transition"
        aria-label="Close"
        onClick={close}
      />
      <div className="relative z-10 max-h-[min(88dvh,640px)] w-full max-w-md overflow-hidden rounded-t-2xl border border-slate-200/90 bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="text-base font-semibold text-slate-900">
            {step === "duplicate" ? "Already saved" : step === "success" ? "Saved" : "Save contact"}
          </h2>
          <button
            type="button"
            onClick={close}
            className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[min(70dvh,520px)] overflow-y-auto px-4 py-3">
          {step === "form" ? (
            <div className="space-y-3">
              <div>
                <label className={labelCls} htmlFor="qsc-name">
                  Name
                </label>
                <input
                  id="qsc-name"
                  className={inputCls}
                  placeholder="Optional"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                />
              </div>
              <div>
                <span className={labelCls}>Phone</span>
                <p className="mt-1 rounded-xl border border-slate-100 bg-slate-50/90 px-3 py-2.5 font-mono text-sm text-slate-800 tabular-nums">
                  {e164 || "—"}
                </p>
              </div>
              <div>
                <label className={labelCls} htmlFor="qsc-type">
                  Type
                </label>
                <select
                  id="qsc-type"
                  className={inputCls}
                  value={kind}
                  onChange={(e) => setKind(e.target.value as QuickSaveKindUi)}
                >
                  {KIND_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls} htmlFor="qsc-notes">
                  Notes
                </label>
                <textarea
                  id="qsc-notes"
                  className={`${inputCls} min-h-[88px] resize-y`}
                  placeholder="Optional"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
              {err ? (
                <p className="rounded-xl border border-red-200 bg-red-50/95 px-3 py-2 text-sm text-red-900">{err}</p>
              ) : null}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={close} className={btnSecondary}>
                  Cancel
                </button>
                <button type="button" onClick={() => void submit()} disabled={saving || !e164} className={btnPrimary}>
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          ) : null}

          {step === "duplicate" && dup ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-slate-700">
                <span className="font-semibold text-slate-900">{dup.displayName}</span> is already in your directory
                {dup.hasPatient ? " as a patient" : ""}
                {dup.hasActiveLead ? " with an active lead" : ""}.
              </p>
              <p className="text-xs text-slate-500">Type: {labelForContactType(dup.contactType)}</p>
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
                {dupThreadHref ? (
                  <Link href={dupThreadHref} className={btnPrimary} prefetch={false} onClick={close}>
                    <MessageSquare className="mr-1.5 h-4 w-4" />
                    Open thread
                  </Link>
                ) : null}
                {dupCrmHref ? (
                  <Link href={dupCrmHref} className={btnSecondary} prefetch={false} onClick={close}>
                    <ExternalLink className="mr-1.5 h-4 w-4" />
                    CRM contact
                  </Link>
                ) : null}
                <button type="button" onClick={close} className={btnSecondary}>
                  Close
                </button>
              </div>
            </div>
          ) : null}

          {step === "success" && result ? (
            <div className="space-y-4">
              <div className="flex items-start gap-2 rounded-xl border border-emerald-200/80 bg-emerald-50/90 px-3 py-2.5 text-sm text-emerald-950">
                <Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
                <div>
                  <p className="font-semibold">
                    Saved as {KIND_OPTIONS.find((k) => k.value === result.kind)?.label ?? "Contact"}{" "}
                    <span aria-hidden>✓</span>
                  </p>
                  <p className="mt-0.5 text-emerald-900/90">{result.displayName}</p>
                </div>
              </div>
              {moveErr ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                  {moveErr}
                </p>
              ) : null}
              <div className="grid grid-cols-2 gap-2">
                {result.kind !== "lead" && !result.leadId ? (
                  <button
                    type="button"
                    onClick={() => void moveToLead()}
                    disabled={moveBusy !== null}
                    className={btnSecondary}
                  >
                    {moveBusy === "lead" ? "…" : "Move to lead"}
                  </button>
                ) : null}
                {result.kind !== "facility_vendor" ? (
                  <button
                    type="button"
                    onClick={() => void moveToFacilityVendor()}
                    disabled={moveBusy !== null}
                    className={btnSecondary}
                  >
                    {moveBusy === "fv" ? "…" : "Move to facility / vendor"}
                  </button>
                ) : null}
                {threadHref ? (
                  <Link
                    href={threadHref}
                    className={btnSecondary}
                    prefetch={false}
                    onClick={close}
                  >
                    <MessageSquare className="mr-1 inline h-4 w-4" />
                    Text
                  </Link>
                ) : null}
                {callHref ? (
                  <Link href={callHref} className={btnSecondary} prefetch={false} onClick={close}>
                    <Phone className="mr-1 inline h-4 w-4" />
                    Call
                  </Link>
                ) : null}
                {patientHref && result.patientId ? (
                  <Link href={patientHref} className={btnSecondary} prefetch={false} onClick={close}>
                    Open patient
                  </Link>
                ) : null}
                {crmLeadHref && result.leadId ? (
                  <Link href={crmLeadHref} className={btnSecondary} prefetch={false} onClick={close}>
                    Open lead
                  </Link>
                ) : null}
                {composeSmsHref && !threadHref ? (
                  <Link href={composeSmsHref} className={btnSecondary} prefetch={false} onClick={close}>
                    Compose text
                  </Link>
                ) : null}
                {crmContactHref ? (
                  <Link href={crmContactHref} className={btnSecondary} prefetch={false} onClick={close}>
                    <StickyNote className="mr-1 inline h-4 w-4" />
                    Open (notes)
                  </Link>
                ) : null}
              </div>
              <p className="text-center text-xs text-slate-500">
                CRM links require manager access; messaging uses workspace inbox.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
