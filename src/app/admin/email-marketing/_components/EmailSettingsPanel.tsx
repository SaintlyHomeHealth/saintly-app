"use client";

import { useState, useTransition } from "react";

import type { EmailMailboxRow } from "@/lib/email-marketing/types";

import { emUi } from "./email-marketing-ui";

type Props = {
  mailbox: EmailMailboxRow | null;
  gmailConnected: boolean;
  oauthConfigured: boolean;
  connectError?: string | null;
  connectSuccess?: boolean;
};

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "Never";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function EmailSettingsPanel({
  mailbox,
  gmailConnected,
  oauthConfigured,
  connectError,
  connectSuccess,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function syncNow() {
    startTransition(async () => {
      setMessage(null);
      const res = await fetch("/api/admin/email-marketing/sync", { method: "POST" });
      const json = (await res.json()) as { ok?: boolean; error?: string; syncedMessages?: number };
      if (!res.ok || json.error) {
        setMessage(json.error ?? "Sync failed.");
        return;
      }
      setMessage(`Synced ${json.syncedMessages ?? 0} message(s).`);
    });
  }

  function disconnect() {
    startTransition(async () => {
      setMessage(null);
      const res = await fetch("/api/admin/email-marketing/gmail/disconnect", { method: "POST" });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || json.error) {
        setMessage(json.error ?? "Disconnect failed.");
        return;
      }
      setMessage("Mailbox disconnected. Refresh to update status.");
    });
  }

  return (
    <section className={`${emUi.card} p-5 sm:p-6`}>
      <h2 className="text-lg font-bold text-slate-900">Mailbox settings</h2>
      <p className="mt-1 text-sm text-slate-600">
        Connect <strong>admin@saintlyhomehealth.com</strong> via Gmail API. Staff never need the Gmail password. The
        private info@ inbox is not connected here.
      </p>

      {connectSuccess ? <div className={`${emUi.alertOk} mt-4`}>Gmail connected successfully.</div> : null}
      {connectError ? <div className={`${emUi.alertError} mt-4`}>{connectError}</div> : null}
      {message ? (
        <div className={`${message.includes("failed") || message.includes("Disconnect failed") ? emUi.alertError : emUi.alertOk} mt-4`}>
          {message}
        </div>
      ) : null}

      <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
          <dt className={emUi.sectionTitle}>Connected mailbox</dt>
          <dd className="mt-2 font-semibold text-slate-900">{mailbox?.email_address ?? "admin@saintlyhomehealth.com"}</dd>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
          <dt className={emUi.sectionTitle}>Provider</dt>
          <dd className="mt-2 font-semibold text-slate-900">{mailbox?.provider ?? "gmail"}</dd>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
          <dt className={emUi.sectionTitle}>Connection status</dt>
          <dd className="mt-2">
            <span className={gmailConnected ? emUi.pill : emUi.pillMuted}>
              {gmailConnected ? mailbox?.status ?? "active" : mailbox?.status ?? "pending"}
            </span>
          </dd>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
          <dt className={emUi.sectionTitle}>Last sync</dt>
          <dd className="mt-2 text-slate-700">{formatWhen(mailbox?.last_sync_at)}</dd>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:col-span-2">
          <dt className={emUi.sectionTitle}>Last Gmail historyId</dt>
          <dd className="mt-2 break-all font-mono text-xs text-slate-700">{mailbox?.last_history_id ?? "—"}</dd>
        </div>
        {mailbox?.sync_error ? (
          <div className={`${emUi.alertError} sm:col-span-2`}>Sync error: {mailbox.sync_error}</div>
        ) : null}
      </dl>

      <div className="mt-6 flex flex-wrap gap-2">
        {oauthConfigured ? (
          <a href="/api/admin/email-marketing/gmail/connect" className={emUi.btnPrimary}>
            {gmailConnected ? "Reconnect Gmail" : "Connect Gmail (admin@)"}
          </a>
        ) : (
          <p className={`${emUi.alertWarn} flex-1`}>
            Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI to enable OAuth connect. You can also set
            GOOGLE_GMAIL_REFRESH_TOKEN manually.
          </p>
        )}
        <button type="button" className={emUi.btnSecondary} disabled={pending || !gmailConnected} onClick={syncNow}>
          Sync now
        </button>
        <button type="button" className={emUi.btnGhost} disabled={pending || !gmailConnected} onClick={disconnect}>
          Disconnect
        </button>
      </div>
    </section>
  );
}
