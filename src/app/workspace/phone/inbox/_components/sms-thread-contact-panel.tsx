"use client";

import { useCallback, useMemo, useState, useTransition } from "react";

import { saveSmsThreadContact, type SaveSmsThreadContactResult } from "@/app/admin/phone/messages/actions";
import { CRM_CONTACT_TYPE_LABELS, type CrmContactTypeValue } from "@/lib/crm/contact-types";

import { useWorkspaceSmsContactSave } from "./workspace-sms-conversation-shell";

const SMS_THREAD_TYPE_OPTIONS: { value: CrmContactTypeValue; label: string }[] = [
  { value: "patient", label: CRM_CONTACT_TYPE_LABELS.patient },
  { value: "lead", label: CRM_CONTACT_TYPE_LABELS.lead },
  { value: "recruit", label: CRM_CONTACT_TYPE_LABELS.recruit },
  { value: "referral", label: CRM_CONTACT_TYPE_LABELS.referral },
  { value: "other", label: CRM_CONTACT_TYPE_LABELS.other },
];

type Props = {
  conversationId: string;
  phoneDisplayFormatted: string;
  hasPrimaryContact: boolean;
  unknownTexter: boolean;
  initial: {
    fullName: string;
    email: string;
    contactType: string;
    notes: string;
  } | null;
  /** Desktop inbox 3-pane: tighter card chrome. */
  compactAside?: boolean;
};

function parseTagsFromNotes(notes: string): { body: string; tags: string } {
  const idx = notes.lastIndexOf("\n\nTags:");
  if (idx === -1) {
    if (notes.startsWith("Tags: ")) return { body: "", tags: notes.slice(6).trim() };
    return { body: notes, tags: "" };
  }
  const body = notes.slice(0, idx).trimEnd();
  const tagPart = notes.slice(idx + "\n\nTags:".length).trim();
  return { body, tags: tagPart };
}

export function SmsThreadContactPanel({
  conversationId,
  phoneDisplayFormatted,
  hasPrimaryContact,
  unknownTexter,
  initial,
  compactAside = false,
}: Props) {
  const ctx = useWorkspaceSmsContactSave();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);
  const [linkedLocally, setLinkedLocally] = useState(false);

  const defaults = useMemo(() => {
    if (!initial) {
      return {
        fullName: "",
        email: "",
        contactType: "patient" as CrmContactTypeValue,
        notes: "",
        tags: "",
      };
    }
    const { body, tags } = parseTagsFromNotes(initial.notes);
    const ctRaw = (initial.contactType ?? "").trim().toLowerCase();
    const contactType = SMS_THREAD_TYPE_OPTIONS.some((o) => o.value === ctRaw)
      ? (ctRaw as CrmContactTypeValue)
      : "other";
    return {
      fullName: initial.fullName,
      email: initial.email,
      contactType,
      notes: body,
      tags,
    };
  }, [initial]);

  const [fullName, setFullName] = useState(defaults.fullName);
  const [email, setEmail] = useState(defaults.email);
  const [contactType, setContactType] = useState<CrmContactTypeValue>(defaults.contactType);
  const [notes, setNotes] = useState(defaults.notes);
  const [tags, setTags] = useState(defaults.tags);

  const onSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setError(null);
      setSavedOk(false);
      const fd = new FormData(e.currentTarget);
      startTransition(async () => {
        const res: SaveSmsThreadContactResult = await saveSmsThreadContact(fd);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setSavedOk(true);
        setLinkedLocally(true);
        ctx?.onContactSaved({ displayName: res.displayName, badgeLabel: res.badgeLabel });
      });
    },
    [ctx]
  );

  return (
    <section
      className={
        compactAside
          ? "rounded-lg border border-slate-200 bg-white p-3 shadow-none"
          : "rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm ring-1 ring-slate-100/80"
      }
    >
      <h2 className={`font-semibold text-slate-900 ${compactAside ? "text-xs" : "text-sm"}`}>Contact</h2>
      <p className={`text-[11px] text-slate-500 ${compactAside ? "mt-0.5" : "mt-1 text-xs"}`}>
        Linked CRM record for this thread. Saves instantly — no page reload.
      </p>

      {unknownTexter && !hasPrimaryContact ? (
        <p className="mt-3 rounded-lg border border-amber-200/90 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          New number — add a name so the thread header shows who you are texting.
        </p>
      ) : null}

      <form className={`${compactAside ? "mt-2 space-y-2" : "mt-4 space-y-3"}`} onSubmit={onSubmit}>
        <input type="hidden" name="conversationId" value={conversationId} />

        <div>
          <label className="block text-xs font-medium text-slate-600" htmlFor={`sms-contact-name-${conversationId}`}>
            Name <span className="text-red-600">*</span>
          </label>
          <input
            id={`sms-contact-name-${conversationId}`}
            name="fullName"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            autoComplete="name"
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-inner shadow-slate-900/5 outline-none ring-sky-300/0 transition focus:border-sky-300 focus:ring-2 focus:ring-sky-200"
            placeholder="Full name"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600" htmlFor={`sms-contact-phone-${conversationId}`}>
            Phone
          </label>
          <input
            id={`sms-contact-phone-${conversationId}`}
            readOnly
            value={phoneDisplayFormatted}
            className="mt-1 w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm tabular-nums text-slate-600"
            aria-readonly
          />
          <p className="mt-0.5 text-[11px] text-slate-400">Thread number — update in CRM if it changes.</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600" htmlFor={`sms-contact-email-${conversationId}`}>
            Email
          </label>
          <input
            id={`sms-contact-email-${conversationId}`}
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-inner shadow-slate-900/5 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-200"
            placeholder="name@example.com"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600" htmlFor={`sms-contact-type-${conversationId}`}>
            Type
          </label>
          <select
            id={`sms-contact-type-${conversationId}`}
            name="contactType"
            value={contactType}
            onChange={(e) => setContactType(e.target.value as CrmContactTypeValue)}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-inner shadow-slate-900/5 focus:border-sky-300 focus:ring-2 focus:ring-sky-200"
          >
            {SMS_THREAD_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600" htmlFor={`sms-contact-notes-${conversationId}`}>
            Notes
          </label>
          <textarea
            id={`sms-contact-notes-${conversationId}`}
            name="notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-1 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-inner shadow-slate-900/5 focus:border-sky-300 focus:ring-2 focus:ring-sky-200"
            placeholder="Internal notes…"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600" htmlFor={`sms-contact-tags-${conversationId}`}>
            Tags
          </label>
          <input
            id={`sms-contact-tags-${conversationId}`}
            name="tags"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-inner shadow-slate-900/5 focus:border-sky-300 focus:ring-2 focus:ring-sky-200"
            placeholder="e.g. intake, spanish, night shift"
          />
        </div>

        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900" role="alert">
            {error}
          </p>
        ) : null}
        {savedOk && !error ? (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            Saved — header updated.
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-xl bg-gradient-to-b from-sky-500 to-blue-700 py-2.5 text-sm font-semibold text-white shadow-md shadow-sky-900/15 ring-1 ring-white/20 transition hover:brightness-[1.03] disabled:opacity-50"
        >
          {hasPrimaryContact || linkedLocally ? "Save contact" : "Add contact"}
        </button>
      </form>
    </section>
  );
}
