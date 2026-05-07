"use client";

import { ChevronDown, ChevronRight, Copy, Mail, Phone, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import type { CredentialingContactActionResult } from "@/app/admin/credentialing/actions";
import {
  createCredentialingContactAction,
  deleteCredentialingContactAction,
  markCredentialingContactPrimaryAction,
  updateCredentialingContactAction,
} from "@/app/admin/credentialing/actions";
import { phoneToTelHref, formatPhoneNumber } from "@/lib/phone/us-phone-format";
import {
  type PayerCredentialingRecordContact,
  sortPayerCredentialingContactsForDisplay,
} from "@/lib/crm/payer-credentialing-contacts";

const inp =
  "mt-1 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 placeholder:text-slate-400";

function displayPhone(contact: Pick<PayerCredentialingRecordContact, "phone" | "extension">): string {
  const formatted = formatPhoneNumber(contact.phone ?? "");
  const ext =
    typeof contact.extension === "string" && contact.extension.trim()
      ? ` ext. ${contact.extension.trim()}`
      : "";
  if (!formatted && !ext.trim()) return "—";
  return `${formatted || "—"}${ext}`;
}

function copyText(text: string) {
  if (!text.trim()) return;
  void navigator.clipboard.writeText(text.trim()).catch(() => {});
}

type ContactChipProps = {
  contact: PayerCredentialingRecordContact;
  credentialingRecordId: string;
};

function ContactActionBar({ contact, credentialingRecordId }: ContactChipProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const email = contact.email?.trim() ?? "";
  const phoneDial = phoneToTelHref(contact.phone ?? "");
  const showPhoneDigits = formatPhoneNumber(contact.phone ?? "");

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
      {phoneDial ? (
        <a
          href={phoneDial}
          className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-950 hover:bg-emerald-100"
        >
          <Phone className="h-3.5 w-3.5" aria-hidden />
          Call
        </a>
      ) : (
        <span className="inline-flex cursor-not-allowed items-center gap-1 rounded-lg border border-slate-100 px-2 py-1 text-[11px] text-slate-400">
          <Phone className="h-3.5 w-3.5" aria-hidden />
          Call
        </span>
      )}
      <button
        type="button"
        disabled={!email}
        onClick={() => copyText(email)}
        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Copy className="h-3.5 w-3.5" aria-hidden />
        Copy mail
      </button>
      <button
        type="button"
        disabled={!showPhoneDigits.trim()}
        onClick={() => copyText(showPhoneDigits)}
        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Copy className="h-3.5 w-3.5" aria-hidden />
        Copy phone
      </button>
      {!contact.is_primary ? (
        <button
          type="button"
          disabled={contact.is_active !== true}
          onClick={() => {
            startTransition(async () => {
              const fd = new FormData();
              fd.append("credentialing_record_id", credentialingRecordId);
              fd.append("contact_id", contact.id);
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
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Contacts</p>
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
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Contacts</p>
        <p className="mt-2 text-xs text-slate-600">
          All contacts are inactive — activate one below or add a new contact.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 border-t border-slate-100 pt-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Contacts</p>
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
                <p className="mt-1 space-y-0.5 break-all text-xs text-slate-800">
                  {c.email?.trim() ? <span className="block">{c.email.trim()}</span> : null}
                  {c.phone?.trim() ? (
                    <span className="block text-slate-700">{displayPhone(c)}</span>
                  ) : null}
                  {!c.email?.trim() && !c.phone?.trim() ? <span className="text-slate-500">—</span> : null}
                </p>
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
            Unlimited contacts — name, phone, extension, roles, labels, notes. At least one of name, email, or phone per
            contact.
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
              <div className="min-w-0">
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
                <p className="mt-2 break-all text-xs text-slate-800">{c.email?.trim() || "—"}</p>
                {c.phone?.trim() ? <p className="mt-0.5 text-xs text-slate-700">{displayPhone(c)}</p> : null}
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
                className="mt-3 grid gap-2 sm:grid-cols-2"
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
                <label className="flex flex-col text-[11px] font-medium text-slate-600 sm:col-span-1">
                  Email
                  <input name="email" type="email" className={inp} disabled={pending} defaultValue={c.email ?? ""} />
                </label>
                <label className="flex flex-col text-[11px] font-medium text-slate-600">
                  Phone
                  <input name="phone" className={inp} disabled={pending} defaultValue={c.phone ?? ""} />
                </label>
                <label className="flex flex-col text-[11px] font-medium text-slate-600">
                  Extension
                  <input name="extension" className={inp} disabled={pending} defaultValue={c.extension ?? ""} />
                </label>
                <label className="flex flex-col text-[11px] font-medium text-slate-600 sm:col-span-2">
                  Label
                  <input name="label" maxLength={120} className={inp} disabled={pending} defaultValue={c.label ?? ""} />
                </label>
                <label className="flex flex-col text-[11px] font-medium text-slate-600 sm:col-span-2">
                  Notes
                  <textarea name="notes" rows={3} disabled={pending} className={`${inp} min-h-[76px]`} defaultValue={c.notes ?? ""} />
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
          className="mt-4 grid gap-2 sm:grid-cols-2"
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
          <label className="flex flex-col text-[11px] font-medium text-slate-600">
            Email
            <input name="email" type="email" className={inp} disabled={pending} />
          </label>
          <label className="flex flex-col text-[11px] font-medium text-slate-600">
            Phone
            <input name="phone" className={inp} disabled={pending} />
          </label>
          <label className="flex flex-col text-[11px] font-medium text-slate-600">
            Extension
            <input name="extension" className={inp} disabled={pending} />
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
