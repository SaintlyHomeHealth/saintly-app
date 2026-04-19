"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { searchWorkspaceSmsComposeTargets, sendWorkspaceNewSms, type SmsComposeSearchRow } from "../actions";

import { SmsTextFromBar } from "./SmsTextFromBar";

const inputCls =
  "ws-phone-input w-full rounded-2xl border border-sky-200/80 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm shadow-sky-950/5 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200/80";

const btnPrimary =
  "inline-flex min-h-[2.5rem] items-center justify-center rounded-2xl bg-gradient-to-r from-blue-950 to-sky-600 px-5 text-sm font-semibold text-white shadow-md shadow-blue-900/25 hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50";

type Props = {
  /** Prefill from `/workspace/phone/inbox/new?recruitingCandidateId=` */
  initialRecruitingCandidateId?: string | null;
  initialPhone?: string | null;
  /** Prefill from `/workspace/phone/inbox/new?contactId=` (CRM contact UUID) */
  initialContactId?: string | null;
  initialNameHint?: string | null;
  errorBanner?: string | null;
  twilioError?: string | null;
};

export function NewWorkspaceSmsComposeClient({
  initialRecruitingCandidateId,
  initialPhone,
  initialContactId,
  initialNameHint,
  errorBanner,
  twilioError,
}: Props) {
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [contactId, setContactId] = useState((initialContactId ?? "").trim());
  const [recruitingCandidateId, setRecruitingCandidateId] = useState(initialRecruitingCandidateId ?? "");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [hits, setHits] = useState<{ contacts: SmsComposeSearchRow[]; recruits: SmsComposeSearchRow[] }>({
    contacts: [],
    recruits: [],
  });
  const [pending, setPending] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const hint = useMemo(() => {
    if (!initialNameHint?.trim()) return null;
    return `Messaging: ${initialNameHint.trim()}`;
  }, [initialNameHint]);

  const runSearch = useCallback((q: string) => {
    const t = q.trim();
    if (t.length < 2) {
      setHits({ contacts: [], recruits: [] });
      return;
    }
    setPending(true);
    void searchWorkspaceSmsComposeTargets(t).then((res) => {
      setHits(res);
      setPending(false);
    });
  }, []);

  useEffect(() => {
    if (!pickerOpen) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      runSearch(phone);
    }, 280);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [phone, pickerOpen, runSearch]);

  useEffect(() => {
    function onDocDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, []);

  function pickRow(row: SmsComposeSearchRow) {
    setContactId(row.kind === "contact" ? row.id : "");
    setRecruitingCandidateId(row.kind === "recruit" ? row.id : "");
    setPhone(row.phone?.trim() || phone);
    setPickerOpen(false);
    setHits({ contacts: [], recruits: [] });
  }

  function clearPicks() {
    setContactId("");
    setRecruitingCandidateId("");
  }

  const showHits =
    pickerOpen && (hits.contacts.length > 0 || hits.recruits.length > 0 || (pending && phone.trim().length >= 2));

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/workspace/phone/inbox"
          className="text-sm font-semibold text-sky-800 hover:text-sky-950 hover:underline"
        >
          ← Back to Inbox
        </Link>
      </div>

      {errorBanner ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-900">
          {errorBanner}
        </div>
      ) : null}
      {twilioError ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {twilioError}
        </div>
      ) : null}
      {hint ? (
        <p className="rounded-2xl border border-violet-200/80 bg-violet-50/90 px-4 py-3 text-sm text-violet-950">
          {hint}
        </p>
      ) : null}

      <form action={sendWorkspaceNewSms} className="space-y-4">
        <input type="hidden" name="contactId" value={contactId} />
        <input type="hidden" name="recruitingCandidateId" value={recruitingCandidateId} />

        <div ref={rootRef} className="relative space-y-1.5">
          <label htmlFor="ws-sms-to" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            To (phone number)
          </label>
          <input
            id="ws-sms-to"
            name="phone"
            value={phone}
            autoComplete="off"
            onChange={(e) => {
              clearPicks();
              setPhone(e.target.value);
            }}
            onFocus={() => setPickerOpen(true)}
            placeholder="+1…"
            className={inputCls}
            required={!contactId && !recruitingCandidateId}
          />
          <p className="text-xs text-slate-500">
            Type a number or search by name — pick a CRM contact or recruiting candidate below.
          </p>

          {showHits ? (
            <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-auto rounded-2xl border border-sky-200/90 bg-white py-1 shadow-lg shadow-sky-950/10">
              {pending && phone.trim().length >= 2 ? (
                <div className="px-3 py-2 text-xs text-slate-500">Searching…</div>
              ) : null}
              {hits.contacts.length > 0 ? (
                <div className="px-2 pb-1 pt-1">
                  <div className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    Contacts
                  </div>
                  {hits.contacts.map((row) => (
                    <button
                      key={`c-${row.id}`}
                      type="button"
                      onClick={() => pickRow(row)}
                      className="w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-phone-ice/80"
                    >
                      <span className="font-semibold text-slate-900">{row.label}</span>
                      {row.phone ? (
                        <span className="mt-0.5 block text-xs text-slate-500">{row.phone}</span>
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : null}
              {hits.recruits.length > 0 ? (
                <div className="px-2 pb-1 pt-1">
                  <div className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    Recruiting
                  </div>
                  {hits.recruits.map((row) => (
                    <button
                      key={`r-${row.id}`}
                      type="button"
                      onClick={() => pickRow(row)}
                      className="w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-violet-50"
                    >
                      <span className="font-semibold text-slate-900">{row.label}</span>
                      <span className="mt-0.5 block text-xs text-violet-800/90">Recruit · {row.phone ?? "—"}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <SmsTextFromBar />

        <div className="space-y-1.5">
          <label htmlFor="ws-sms-body" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Message
          </label>
          <textarea
            id="ws-sms-body"
            name="body"
            rows={5}
            maxLength={1600}
            placeholder="Write your SMS…"
            className={inputCls}
            required
          />
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <button type="submit" className={btnPrimary}>
            Send
          </button>
          <Link
            href="/workspace/phone/inbox"
            className="inline-flex min-h-[2.5rem] items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
