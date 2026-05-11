"use client";

import { ChevronDown, ChevronRight, Mail, Phone, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import type { CredentialingContactActionResult } from "@/app/admin/credentialing/actions";
import {
  createCredentialingContactAction,
  deleteCredentialingContactAction,
  markCredentialingContactPrimaryAction,
  updateCredentialingContactAction,
} from "@/app/admin/credentialing/actions";
import { CopyTextButton } from "@/components/credentialing/CopyTextButton";
import {
  contactEffectiveOfficePhone,
  type PayerCredentialingRecordContact,
  sortPayerCredentialingContactsForDisplay,
} from "@/lib/crm/payer-credentialing-contacts";
import { phoneToTelHref, formatPhoneNumber } from "@/lib/phone/us-phone-format";

const inp =
  "mt-1 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 placeholder:text-slate-400";

const sectionHeading = "text-[11px] font-semibold uppercase tracking-wide text-slate-600";

function extensionDisplay(ext: string | null | undefined): string {
  return typeof ext === "string" && ext.trim() ? ` ext. ${ext.trim()}` : "";
}

function officeDisplayLine(c: PayerCredentialingRecordContact): string {
  const office = contactEffectiveOfficePhone(c);
  if (!office) return "";
  return `${formatPhoneNumber(office)}${extensionDisplay(c.extension)}`;
}

function officeCopyPayload(c: PayerCredentialingRecordContact): string {
  const office = contactEffectiveOfficePhone(c);
  if (!office) return "";
  return `${formatPhoneNumber(office)}${extensionDisplay(c.extension)}`.trim();
}

function hasAnyReachDetail(c: PayerCredentialingRecordContact): boolean {
  return !!(
    c.email?.trim() ||
    c.secondaryEmail?.trim() ||
    contactEffectiveOfficePhone(c) ||
    c.mobilePhone?.trim() ||
    c.otherPhone?.trim() ||
    c.fax?.trim()
  );
}

function ContactDetailLines({ contact: c }: { contact: PayerCredentialingRecordContact }) {
  const office = contactEffectiveOfficePhone(c);
  const officeLine = officeDisplayLine(c);
  const officeCopy = officeCopyPayload(c);
  const mobile = c.mobilePhone?.trim() ?? "";
  const mobileFmt = mobile ? formatPhoneNumber(mobile) : "";
  const other = c.otherPhone?.trim() ?? "";
  const otherFmt = other ? formatPhoneNumber(other) : "";
  const otherLbl = c.otherPhoneLabel?.trim() ?? "";
  const fax = c.fax?.trim() ?? "";
  const faxFmt = fax ? formatPhoneNumber(fax) : "";

  return (
    <div className="mt-1 space-y-1.5 text-xs text-slate-800">
      {c.email?.trim() ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 break-all">
          <span className="shrink-0 font-medium text-slate-500">Email</span>
          <span className="min-w-0">{c.email.trim()}</span>
          <CopyTextButton text={c.email.trim()} label="Copy" />
        </div>
      ) : null}
      {c.secondaryEmail?.trim() ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 break-all">
          <span className="shrink-0 font-medium text-slate-500">Secondary</span>
          <span className="min-w-0">{c.secondaryEmail.trim()}</span>
          <CopyTextButton text={c.secondaryEmail.trim()} label="Copy" />
        </div>
      ) : null}
      {office ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="shrink-0 font-medium text-slate-500">Office</span>
          <span className="tabular-nums text-slate-800">{officeLine}</span>
          <CopyTextButton text={officeCopy} label="Copy" />
        </div>
      ) : null}
      {mobile ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="shrink-0 font-medium text-slate-500">Mobile</span>
          <span className="tabular-nums">{mobileFmt}</span>
          <CopyTextButton text={mobileFmt} label="Copy" />
        </div>
      ) : null}
      {other ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="shrink-0 font-medium text-slate-500">{otherLbl || "Other"}</span>
          <span className="tabular-nums">{otherFmt}</span>
          <CopyTextButton text={otherFmt} label="Copy" />
        </div>
      ) : null}
      {fax ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="shrink-0 font-medium text-slate-500">Fax</span>
          <span className="tabular-nums">{faxFmt}</span>
          <CopyTextButton text={faxFmt} label="Copy" />
        </div>
      ) : null}
      {!hasAnyReachDetail(c) ? <span className="text-slate-500">—</span> : null}
    </div>
  );
}

type ContactChipProps = {
  contact: PayerCredentialingRecordContact;
  credentialingRecordId: string;
};

function ContactActionBar({ contact: c, credentialingRecordId }: ContactChipProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const email = c.email?.trim() ?? "";
  const office = contactEffectiveOfficePhone(c);
  const mobile = c.mobilePhone?.trim() ?? "";
  const other = c.otherPhone?.trim() ?? "";
  const officeDial = phoneToTelHref(office ?? "");
  const mobileDial = phoneToTelHref(mobile);
  const otherDial = phoneToTelHref(other);

  const callBtn =
    "inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-950 hover:bg-emerald-100";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {email ? (
        <a
          href={`mailto:${encodeURIComponent(email)}`}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-800 hover:bg-slate-50"
        >
          <Mail className="h-3.5 w-3.5" aria-hidden />
          Email
        </a>
      ) : (
        <span className="inline-flex cursor-not-allowed items-center gap-1 rounded-lg border border-slate-100 px-2 py-1 text-[11px] text-slate-400">
          <Mail className="h-3.5 w-3.5" aria-hidden />
          Email
        </span>
      )}
      {officeDial ? (
        <a href={officeDial} className={callBtn}>
          <Phone className="h-3.5 w-3.5" aria-hidden />
          Office
        </a>
      ) : null}
      {mobileDial ? (
        <a href={mobileDial} className={callBtn}>
          <Phone className="h-3.5 w-3.5" aria-hidden />
          Mobile
        </a>
      ) : null}
      {otherDial ? (
        <a href={otherDial} className={callBtn}>
          <Phone className="h-3.5 w-3.5" aria-hidden />
          Other
        </a>
      ) : null}
      {!c.is_primary ? (
        <button
          type="button"
          disabled={c.is_active !== true}
          onClick={() => {
            startTransition(async () => {
              const fd = new FormData();
              fd.append("credentialing_record_id", credentialingRecordId);
              fd.append("contact_id", c.id);
              await markCredentialingContactPrimaryAction(fd);
              router.refresh();
            });
          }}
          className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-950 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Star className="h-3.5 w-3.5" aria-hidden />
          Primary
        </button>
      ) : (
        <span className="inline-flex items-center rounded-full bg-sky-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
          Primary
        </span>
      )}
    </div>
  );
}

export function CredentialingContactsTopRibbon({
  credentialingRecordId,
  initialContacts,
}: {
  credentialingRecordId: string;
  initialContacts: PayerCredentialingRecordContact[];
}) {
  const hasRows = initialContacts.length > 0;
  const sorted = useMemo(
    () => sortPayerCredentialingContactsForDisplay(initialContacts.filter((c) => c.is_active)),
    [initialContacts]
  );
  const [expanded, setExpanded] = useState(false);

  const previewCount = 2;
  const showExpandControl = sorted.length > previewCount;
  const preview = expanded || !showExpandControl ? sorted : sorted.slice(0, previewCount);

  if (!hasRows) {
    return (
      <div className="mt-6 border-t border-slate-100 pt-5">
        <p className={sectionHeading}>Contacts</p>
        <p className="mt-2 text-xs text-slate-600">
          No contacts yet — add them in the{" "}
          <a href="#credentialing-contacts-section" className="font-semibold text-sky-800 underline underline-offset-2">
            Contacts
          </a>{" "}
          section below.
        </p>
      </div>
    );
  }

  if (sorted.length === 0) {
    return (
      <div className="mt-6 border-t border-slate-100 pt-5">
        <p className={sectionHeading}>Contacts</p>
        <p className="mt-2 text-xs text-slate-600">
          All contacts are inactive — activate one below or add a new contact.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 border-t border-slate-100 pt-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={sectionHeading}>Contacts</p>
        {showExpandControl ? (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-800 hover:bg-slate-50"
          >
            {expanded ? (
              <>
                Show fewer <ChevronDown className="h-3.5 w-3.5 rotate-180" aria-hidden />
              </>
            ) : (
              <>
                View all contacts ({sorted.length}) <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              </>
            )}
          </button>
        ) : null}
      </div>
      <ul className="mt-3 space-y-3">
        {preview.map((c) => (
          <li key={c.id} className="rounded-xl border border-slate-100 bg-white/95 px-3 py-3 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-950">
                  {c.name?.trim() || "(Unnamed)"}
                  {c.role?.trim() ? (
                    <span className="ml-2 font-normal text-slate-600">· {c.role.trim()}</span>
                  ) : null}
                </p>
                {c.label?.trim() ? (
                  <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-violet-800">
                    {c.label.trim()}
                  </p>
                ) : null}
                <ContactDetailLines contact={c} />
              </div>
            </div>
            <div className="mt-2 flex flex-wrap">
              <ContactActionBar contact={c} credentialingRecordId={credentialingRecordId} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CredentialingContactsPanel({
  credentialingRecordId,
  initialContacts,
}: {
  credentialingRecordId: string;
  initialContacts: PayerCredentialingRecordContact[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const sortedDisplay = useMemo(
    () => sortPayerCredentialingContactsForDisplay(initialContacts),
    [initialContacts]
  );

  function run(msg: Promise<CredentialingContactActionResult>) {
    startTransition(async () => {
      setErrorBanner(null);
      const res = await msg;
      if (!res.ok) {
        setErrorBanner(res.error ?? "Something went wrong.");
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div id="credentialing-contacts-section" className="space-y-4">
      {errorBanner ? (
        <div
          role="alert"
          className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-950"
        >
          {errorBanner}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">Contacts</p>
          <p className="mt-1 max-w-xl text-xs text-slate-500">
            Unlimited contacts — office, mobile, and alternate numbers, emails, labels, notes. At least one of name,
            email, phone, or fax per contact.
          </p>
        </div>
      </div>

      <ul className="space-y-3">
        {sortedDisplay.map((c) => (
          <li
            key={c.id}
            className={`rounded-2xl border px-4 py-3 shadow-sm sm:px-5 ${
              c.is_primary
                ? "border-sky-300 bg-sky-50/85 ring-1 ring-sky-200/70"
                : c.is_active
                  ? "border-slate-200/90 bg-white"
                  : "border-slate-100 bg-slate-50/70 opacity-80"
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-slate-950">{c.name?.trim() || "(Unnamed)"}</p>
                  {c.is_primary ? (
                    <span className="rounded-full bg-sky-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                      Primary
                    </span>
                  ) : null}
                  {c.is_active ? null : (
                    <span className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-700">
                      Inactive
                    </span>
                  )}
                </div>
                {c.role?.trim() ? (
                  <p className="mt-1 text-xs font-medium text-slate-700">{c.role.trim()}</p>
                ) : null}
                {c.label?.trim() ? (
                  <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-violet-900">
                    {c.label.trim()}
                  </p>
                ) : null}
                <ContactDetailLines contact={c} />
                {c.notes?.trim() ? (
                  <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-slate-600">{c.notes.trim()}</p>
                ) : null}
              </div>
              <ContactActionBar contact={c} credentialingRecordId={credentialingRecordId} />
            </div>

            <details className="mt-4 border-t border-slate-100/80 pt-3">
              <summary className="cursor-pointer text-[11px] font-semibold text-sky-900 hover:underline">
                Edit contact…
              </summary>
              <form
                className="mt-3 grid gap-3 sm:grid-cols-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const fd = new FormData(form);
                  const box = form.querySelector<HTMLInputElement>('input[data-contact-active="1"]');
                  fd.set("is_active", box?.checked ? "1" : "0");
                  run(updateCredentialingContactAction(fd));
                }}
              >
                <input type="hidden" name="credentialing_record_id" value={credentialingRecordId} />
                <input type="hidden" name="contact_id" value={c.id} />

                <label className="flex flex-col text-[11px] font-medium text-slate-600 sm:col-span-1">
                  Name
                  <input name="name" className={inp} disabled={pending} defaultValue={c.name ?? ""} />
                </label>
                <label className="flex flex-col text-[11px] font-medium text-slate-600">
                  Title / role
                  <input name="role" className={inp} disabled={pending} defaultValue={c.role ?? ""} />
                </label>
                <label className="flex flex-col text-[11px] font-medium text-slate-600 sm:col-span-2">
                  Email
                  <input name="email" type="email" className={inp} disabled={pending} defaultValue={c.email ?? ""} />
                </label>
                <label className="flex flex-col text-[11px] font-medium text-slate-600 sm:col-span-2">
                  Secondary email <span className="font-normal normal-case text-slate-400">(optional)</span>
                  <input
                    name="secondary_email"
                    type="email"
                    className={inp}
                    disabled={pending}
                    defaultValue={c.secondaryEmail ?? ""}
                  />
                </label>
                <p className={`${sectionHeading} sm:col-span-2`}>Phone numbers</p>
                <label className="flex flex-col text-[11px] font-medium text-slate-600">
                  Office phone
                  <input
                    name="office_phone"
                    className={inp}
                    disabled={pending}
                    defaultValue={contactEffectiveOfficePhone(c) ?? ""}
                  />
                </label>
                <label className="flex flex-col text-[11px] font-medium text-slate-600">
                  Extension
                  <input
                    name="extension"
                    className={inp}
                    disabled={pending}
                    defaultValue={c.extension ?? ""}
                  />
                </label>
                <label className="flex flex-col text-[11px] font-medium text-slate-600">
                  Mobile phone
                  <input
                    name="mobile_phone"
                    className={inp}
                    disabled={pending}
                    defaultValue={c.mobilePhone ?? ""}
                  />
                </label>
                <label className="flex flex-col text-[11px] font-medium text-slate-600">
                  Other phone
                  <input
                    name="other_phone"
                    className={inp}
                    disabled={pending}
                    defaultValue={c.otherPhone ?? ""}
                  />
                </label>
                <label className="flex flex-col text-[11px] font-medium text-slate-600">
                  Other phone label
                  <input
                    name="other_phone_label"
                    maxLength={80}
                    className={inp}
                    disabled={pending}
                    placeholder='e.g. Back line, Intake'
                    defaultValue={c.otherPhoneLabel ?? ""}
                  />
                </label>
                <label className="flex flex-col text-[11px] font-medium text-slate-600">
                  Fax <span className="font-normal normal-case text-slate-400">(optional)</span>
                  <input name="fax" className={inp} disabled={pending} defaultValue={c.fax ?? ""} />
                </label>
                <label className="flex flex-col text-[11px] font-medium text-slate-600 sm:col-span-2">
                  Label
                  <input name="label" maxLength={120} className={inp} disabled={pending} defaultValue={c.label ?? ""} />
                </label>
                <label className="flex flex-col text-[11px] font-medium text-slate-600 sm:col-span-2">
                  Notes
                  <textarea
                    name="notes"
                    rows={3}
                    disabled={pending}
                    className={`${inp} min-h-[76px]`}
                    defaultValue={c.notes ?? ""}
                  />
                </label>

                <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
                  <label className="inline-flex items-center gap-2 text-[11px] font-medium text-slate-700">
                    <input
                      type="checkbox"
                      data-contact-active="1"
                      defaultChecked={c.is_active !== false}
                      disabled={pending}
                      className="rounded border-slate-300"
                    />
                    Active
                  </label>
                </div>

                <div className="flex flex-wrap gap-2 sm:col-span-2">
                  <button
                    type="submit"
                    disabled={pending}
                    className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
                  >
                    Save changes
                  </button>
                </div>
              </form>
              <div className="mt-4 flex justify-end border-t border-slate-50 pt-3">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    if (!window.confirm(`Remove "${c.name?.trim() || "this contact"}" from this payer record?`)) return;
                    const fd = new FormData();
                    fd.append("credentialing_record_id", credentialingRecordId);
                    fd.append("contact_id", c.id);
                    run(deleteCredentialingContactAction(fd));
                  }}
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-[11px] font-semibold text-red-950 hover:bg-red-100 disabled:opacity-50"
                >
                  Delete contact…
                </button>
              </div>
            </details>
          </li>
        ))}
      </ul>

      <details className="rounded-2xl border border-dashed border-slate-200 bg-white/95 px-4 py-4 sm:px-5">
        <summary className="cursor-pointer text-sm font-semibold text-slate-900">Add contact</summary>
        <form
          className="mt-4 grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            fd.set("is_active", "1");
            run(createCredentialingContactAction(fd));
            e.currentTarget.reset();
          }}
        >
          <input type="hidden" name="credentialing_record_id" value={credentialingRecordId} />
          <input type="hidden" name="is_active" value="1" />

          <label className="flex flex-col text-[11px] font-medium text-slate-600">
            Name
            <input name="name" className={inp} disabled={pending} />
          </label>
          <label className="flex flex-col text-[11px] font-medium text-slate-600">
            Title / role
            <input name="role" className={inp} disabled={pending} />
          </label>
          <label className="flex flex-col text-[11px] font-medium text-slate-600 sm:col-span-2">
            Email
            <input name="email" type="email" className={inp} disabled={pending} />
          </label>
          <label className="flex flex-col text-[11px] font-medium text-slate-600 sm:col-span-2">
            Secondary email <span className="font-normal normal-case text-slate-400">(optional)</span>
            <input name="secondary_email" type="email" className={inp} disabled={pending} />
          </label>
          <p className={`${sectionHeading} sm:col-span-2`}>Phone numbers</p>
          <label className="flex flex-col text-[11px] font-medium text-slate-600">
            Office phone
            <input name="office_phone" className={inp} disabled={pending} placeholder="Main line" />
          </label>
          <label className="flex flex-col text-[11px] font-medium text-slate-600">
            Extension
            <input name="extension" className={inp} disabled={pending} placeholder="e.g. 4521" />
          </label>
          <label className="flex flex-col text-[11px] font-medium text-slate-600">
            Mobile phone
            <input name="mobile_phone" className={inp} disabled={pending} />
          </label>
          <label className="flex flex-col text-[11px] font-medium text-slate-600">
            Other phone
            <input name="other_phone" className={inp} disabled={pending} />
          </label>
          <label className="flex flex-col text-[11px] font-medium text-slate-600">
            Other phone label
            <input
              name="other_phone_label"
              maxLength={80}
              className={inp}
              disabled={pending}
              placeholder='e.g. Back line, Intake, After hours'
            />
          </label>
          <label className="flex flex-col text-[11px] font-medium text-slate-600">
            Fax <span className="font-normal normal-case text-slate-400">(optional)</span>
            <input name="fax" className={inp} disabled={pending} />
          </label>
          <label className="flex flex-col text-[11px] font-medium text-slate-600 sm:col-span-2">
            Label
            <input name="label" maxLength={120} className={inp} disabled={pending} />
          </label>
          <label className="flex flex-col text-[11px] font-medium text-slate-600 sm:col-span-2">
            Notes
            <textarea name="notes" rows={2} className={`${inp} min-h-[60px]`} disabled={pending} />
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-xl border border-sky-600 bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 disabled:opacity-50"
            >
              Add contact
            </button>
          </div>
        </form>
      </details>
    </div>
  );
}
