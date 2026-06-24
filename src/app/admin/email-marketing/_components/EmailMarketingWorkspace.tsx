"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import {
  saveEmailMarketingDraftAction,
  sendEmailMarketingMessageAction,
  toggleEmailMarketingFlyerAction,
  toggleEmailMarketingTemplateAction,
  uploadEmailMarketingFlyerAction,
} from "@/app/admin/email-marketing/actions";
import { SAINTLY_COMPANY } from "@/lib/email-marketing/company-info";
import {
  applyTemplateVariables,
  buildLetterheadHtml,
  EMAIL_MARKETING_HIPAA_WARNING,
  resolveSenderProfile,
} from "@/lib/email-marketing/letterhead";
import {
  EMAIL_MARKETING_CATEGORY_LABELS,
  type EmailAttachmentRow,
  type EmailMailboxRow,
  type EmailMarketingFlyerRow,
  type EmailMarketingMessageRow,
  type EmailMarketingTemplateRow,
  type EmailMessageRow,
  type EmailSenderProfileRow,
  type EmailThreadRow,
} from "@/lib/email-marketing/types";

import { EmailInboxPanel } from "./EmailInboxPanel";
import { EmailSettingsPanel } from "./EmailSettingsPanel";
import { EMAIL_MARKETING_TABS, emUi, type EmailMarketingTab } from "./email-marketing-ui";

type HistoryRow = EmailMarketingMessageRow & {
  email_marketing_templates?: { name: string } | null;
  email_sender_profiles?: { display_name: string } | null;
  email_marketing_flyers?: { title: string; file_url: string } | null;
};

type Props = {
  templates: EmailMarketingTemplateRow[];
  senderProfiles: EmailSenderProfileRow[];
  flyers: EmailMarketingFlyerRow[];
  history: HistoryRow[];
  threads: EmailThreadRow[];
  messagesByThread: Record<string, (EmailMessageRow & { email_attachments?: EmailAttachmentRow[] })[]>;
  mailbox: EmailMailboxRow | null;
  gmailConnected: boolean;
  oauthConfigured: boolean;
  emailConfigured: boolean;
  fromEmail: string;
  replyToEmail: string;
  canViewAllHistory: boolean;
  canViewPrivateEmail: boolean;
  isAdmin: boolean;
  staffLabels: Record<string, string>;
  staffOptions: Array<{ userId: string; label: string }>;
  currentUserId: string;
  initialTab?: EmailMarketingTab;
  connectError?: string | null;
  connectSuccess?: boolean;
};

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function EmailMarketingWorkspace({
  templates,
  senderProfiles,
  flyers,
  history,
  threads,
  messagesByThread,
  mailbox,
  gmailConnected,
  oauthConfigured,
  emailConfigured,
  fromEmail,
  replyToEmail,
  canViewAllHistory,
  canViewPrivateEmail,
  isAdmin,
  staffLabels,
  staffOptions,
  currentUserId,
  initialTab = "inbox",
  connectError,
  connectSuccess,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab") as EmailMarketingTab | null;
  const validTab = EMAIL_MARKETING_TABS.some((t) => t.id === tabParam) ? tabParam! : initialTab;
  const [tab, setTab] = useState<EmailMarketingTab>(validTab);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<{ type: "ok" | "error"; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const defaultProfile =
    senderProfiles.find((p) => p.is_default && !p.is_custom) ??
    senderProfiles.find((p) => !p.is_custom) ??
    senderProfiles[0] ??
    null;

  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [senderProfileId, setSenderProfileId] = useState(defaultProfile?.id ?? "");
  const [flyerId, setFlyerId] = useState("");
  const [attachFlyer, setAttachFlyer] = useState(false);
  const [messageId, setMessageId] = useState("");
  const [customSenderName, setCustomSenderName] = useState("");
  const [customSenderTitle, setCustomSenderTitle] = useState("");
  const [customSenderPhone, setCustomSenderPhone] = useState("");
  const [customSenderEmail, setCustomSenderEmail] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [historyDetailId, setHistoryDetailId] = useState<string | null>(null);

  const selectedProfile = senderProfiles.find((p) => p.id === senderProfileId) ?? null;
  const isCustomSender = selectedProfile?.is_custom === true;
  const selectedFlyer = flyers.find((f) => f.id === flyerId) ?? null;

  const resolvedBody = useMemo(
    () => applyTemplateVariables(body, { recipient_name: recipientName, organization_name: organizationName }),
    [body, recipientName, organizationName]
  );

  const previewHtml = useMemo(() => {
    const sender = resolveSenderProfile(selectedProfile, {
      name: customSenderName,
      title: customSenderTitle,
      phone: customSenderPhone,
      email: customSenderEmail,
    });
    return buildLetterheadHtml({
      body: resolvedBody,
      sender,
      showPrivateBusinessEmail: canViewPrivateEmail,
      flyer: selectedFlyer,
      attachFlyer,
    });
  }, [
    selectedProfile,
    customSenderName,
    customSenderTitle,
    customSenderPhone,
    customSenderEmail,
    resolvedBody,
    canViewPrivateEmail,
    selectedFlyer,
    attachFlyer,
  ]);

  function showToast(type: "ok" | "error", message: string) {
    setToast({ type, message });
    window.setTimeout(() => setToast(null), type === "ok" ? 4500 : 6500);
  }

  function switchTab(next: EmailMarketingTab) {
    setTab(next);
    router.replace(`/admin/email-marketing?tab=${next}`, { scroll: false });
  }

  async function syncInbox() {
    setSyncing(true);
    try {
      const res = await fetch("/api/admin/email-marketing/sync", { method: "POST" });
      const json = (await res.json()) as { error?: string };
      if (!res.ok || json.error) throw new Error(json.error ?? "Sync failed.");
      router.refresh();
    } finally {
      setSyncing(false);
    }
  }

  function applyTemplate(id: string) {
    setTemplateId(id);
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;
    setSubject(tpl.subject);
    setBody(tpl.body);
  }

  function buildFormData(): FormData {
    const fd = new FormData();
    fd.set("recipient_name", recipientName);
    fd.set("recipient_email", recipientEmail);
    fd.set("organization_name", organizationName);
    fd.set("subject", subject);
    fd.set("body", body);
    fd.set("template_id", templateId);
    fd.set("sender_profile_id", senderProfileId);
    fd.set("flyer_id", flyerId);
    fd.set("attach_flyer", attachFlyer ? "1" : "0");
    if (messageId) fd.set("message_id", messageId);
    fd.set("custom_sender_name", customSenderName);
    fd.set("custom_sender_title", customSenderTitle);
    fd.set("custom_sender_phone", customSenderPhone);
    fd.set("custom_sender_email", customSenderEmail);
    return fd;
  }

  function handleSaveDraft() {
    startTransition(async () => {
      const result = await saveEmailMarketingDraftAction(buildFormData());
      if (!result.ok) {
        showToast("error", result.error);
        return;
      }
      if (result.id) setMessageId(result.id);
      showToast("ok", "Draft saved.");
    });
  }

  function handleSend() {
    if (!emailConfigured) {
      showToast("error", "Email sending is not configured. Check EMAIL_PROVIDER and provider API keys.");
      return;
    }
    startTransition(async () => {
      const result = await sendEmailMarketingMessageAction(buildFormData());
      if (!result.ok) {
        showToast("error", result.error);
        return;
      }
      setMessageId(result.id);
      showToast("ok", "Email sent successfully.");
      switchTab("inbox");
      await syncInbox();
    });
  }

  function loadDraftFromHistory(row: HistoryRow) {
    setRecipientName(row.recipient_name ?? "");
    setRecipientEmail(row.recipient_email);
    setOrganizationName(row.organization_name ?? "");
    setSubject(row.subject);
    setBody(row.body);
    setTemplateId(row.template_id ?? "");
    setSenderProfileId(row.sender_profile_id ?? defaultProfile?.id ?? "");
    setFlyerId(row.flyer_id ?? "");
    setAttachFlyer(row.attach_flyer);
    setMessageId(row.id);
    setCustomSenderName(row.custom_sender_name ?? "");
    setCustomSenderTitle(row.custom_sender_title ?? "");
    setCustomSenderPhone(row.custom_sender_phone ?? "");
    setCustomSenderEmail(row.custom_sender_email ?? "");
    switchTab("composer");
  }

  const historyDetail = history.find((h) => h.id === historyDetailId) ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {EMAIL_MARKETING_TABS.filter((t) => (t.id === "settings" ? isAdmin : true)).map((t) => (
          <button
            key={t.id}
            type="button"
            className={`${emUi.tab} ${tab === t.id ? emUi.tabActive : emUi.tabIdle}`}
            onClick={() => switchTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!emailConfigured ? (
        <div className={emUi.alertWarn}>
          Email delivery is not configured yet. Set <code className="text-xs">EMAIL_PROVIDER</code> and the matching
          provider credentials in environment variables. Drafts and previews still work.
        </div>
      ) : null}

      {toast ? (
        <div className={toast.type === "ok" ? emUi.alertOk : emUi.alertError} role="status">
          {toast.message}
        </div>
      ) : null}

      {tab === "inbox" ? (
        <EmailInboxPanel
          threads={threads}
          messagesByThread={messagesByThread}
          senderProfiles={senderProfiles}
          flyers={flyers}
          staffOptions={staffOptions}
          currentUserId={currentUserId}
          staffLabels={staffLabels}
          onToast={showToast}
          onSync={syncInbox}
          syncing={syncing}
        />
      ) : null}

      {tab === "settings" && isAdmin ? (
        <EmailSettingsPanel
          mailbox={mailbox}
          gmailConnected={gmailConnected}
          oauthConfigured={oauthConfigured}
          connectError={connectError}
          connectSuccess={connectSuccess}
        />
      ) : null}

      {tab === "templates" ? (
        <section className={`${emUi.card} p-5 sm:p-6`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Template Library</h2>
              <p className="mt-1 text-sm text-slate-600">
                Starter outreach templates for referral sources, clinics, assisted living, vendor fairs, and follow-ups.
              </p>
            </div>
          </div>
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {templates.map((tpl) => (
              <article
                key={tpl.id}
                className="rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50/70 to-white p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-slate-900">{tpl.name}</h3>
                    <p className="mt-1 text-xs text-slate-500">{EMAIL_MARKETING_CATEGORY_LABELS[tpl.category]}</p>
                  </div>
                  <span className={tpl.is_active ? emUi.pill : emUi.pillMuted}>
                    {tpl.is_active ? "Active" : "Inactive"}
                  </span>
                </div>
                <p className="mt-3 text-sm font-medium text-slate-800">Subject: {tpl.subject}</p>
                <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm text-slate-600">{tpl.body}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={emUi.btnSecondary}
                    onClick={() => {
                      applyTemplate(tpl.id);
                      switchTab("composer");
                    }}
                  >
                    Use in composer
                  </button>
                  {isAdmin ? (
                    <button
                      type="button"
                      className={emUi.btnGhost}
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          const fd = new FormData();
                          fd.set("id", tpl.id);
                          fd.set("is_active", tpl.is_active ? "0" : "1");
                          const result = await toggleEmailMarketingTemplateAction(fd);
                          showToast(result.ok ? "ok" : "error", result.ok ? "Template updated." : result.error);
                        })
                      }
                    >
                      {tpl.is_active ? "Deactivate" : "Activate"}
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {tab === "composer" ? (
        <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
          <div className={`${emUi.card} p-5 sm:p-6`}>
            <h2 className="text-lg font-bold text-slate-900">Letterhead Composer</h2>
            <p className="mt-1 text-sm text-slate-600">
              Sends from <span className="font-medium">{fromEmail}</span> with reply-to{" "}
              <span className="font-medium">{replyToEmail}</span>. Signature uses the selected sender profile.
            </p>

            <div className={`${emUi.alertWarn} mt-4`}>{EMAIL_MARKETING_HIPAA_WARNING}</div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block space-y-1.5 sm:col-span-1">
                <span className={emUi.label}>Recipient name</span>
                <input className={emUi.input} value={recipientName} onChange={(e) => setRecipientName(e.target.value)} />
              </label>
              <label className="block space-y-1.5 sm:col-span-1">
                <span className={emUi.label}>Recipient email</span>
                <input
                  className={emUi.input}
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                />
              </label>
              <label className="block space-y-1.5 sm:col-span-2">
                <span className={emUi.label}>Organization</span>
                <input
                  className={emUi.input}
                  value={organizationName}
                  onChange={(e) => setOrganizationName(e.target.value)}
                />
              </label>
              <label className="block space-y-1.5 sm:col-span-2">
                <span className={emUi.label}>Template</span>
                <select
                  className={emUi.select}
                  value={templateId}
                  onChange={(e) => applyTemplate(e.target.value)}
                >
                  <option value="">Custom / blank</option>
                  {templates
                    .filter((t) => t.is_active)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="block space-y-1.5 sm:col-span-2">
                <span className={emUi.label}>Subject</span>
                <input className={emUi.input} value={subject} onChange={(e) => setSubject(e.target.value)} />
              </label>
              <label className="block space-y-1.5 sm:col-span-2">
                <span className={emUi.label}>Message body</span>
                <textarea className={emUi.textarea} value={body} onChange={(e) => setBody(e.target.value)} />
              </label>
              <label className="block space-y-1.5 sm:col-span-2">
                <span className={emUi.label}>Sender profile</span>
                <select
                  className={emUi.select}
                  value={senderProfileId}
                  onChange={(e) => setSenderProfileId(e.target.value)}
                >
                  {senderProfiles
                    .filter((p) => p.is_active)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.display_name}
                        {p.title ? ` — ${p.title}` : ""}
                      </option>
                    ))}
                </select>
              </label>
              {isCustomSender ? (
                <>
                  <label className="block space-y-1.5">
                    <span className={emUi.label}>Custom name</span>
                    <input
                      className={emUi.input}
                      value={customSenderName}
                      onChange={(e) => setCustomSenderName(e.target.value)}
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <span className={emUi.label}>Custom title</span>
                    <input
                      className={emUi.input}
                      value={customSenderTitle}
                      onChange={(e) => setCustomSenderTitle(e.target.value)}
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <span className={emUi.label}>Custom phone</span>
                    <input
                      className={emUi.input}
                      value={customSenderPhone}
                      onChange={(e) => setCustomSenderPhone(e.target.value)}
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <span className={emUi.label}>Custom email (signature only)</span>
                    <input
                      className={emUi.input}
                      value={customSenderEmail}
                      onChange={(e) => setCustomSenderEmail(e.target.value)}
                      placeholder={SAINTLY_COMPANY.crmSendEmail}
                    />
                  </label>
                </>
              ) : null}
              <label className="block space-y-1.5 sm:col-span-2">
                <span className={emUi.label}>Flyer</span>
                <select className={emUi.select} value={flyerId} onChange={(e) => setFlyerId(e.target.value)}>
                  <option value="">No flyer</option>
                  {flyers
                    .filter((f) => f.is_active)
                    .map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.title}
                      </option>
                    ))}
                </select>
              </label>
              <label className="flex items-center gap-2 sm:col-span-2">
                <input
                  type="checkbox"
                  checked={attachFlyer}
                  onChange={(e) => setAttachFlyer(e.target.checked)}
                  disabled={!flyerId}
                />
                <span className="text-sm text-slate-700">Attach flyer to email (also includes share link in body)</span>
              </label>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              <button type="button" className={emUi.btnSecondary} onClick={() => setPreviewOpen(true)}>
                Preview letterhead
              </button>
              <button type="button" className={emUi.btnGhost} disabled={pending} onClick={handleSaveDraft}>
                Save draft
              </button>
              <button type="button" className={emUi.btnSend} disabled={pending} onClick={handleSend}>
                {pending ? "Sending…" : "Send email"}
              </button>
            </div>
          </div>

          <aside className={`${emUi.card} p-5 sm:p-6`}>
            <p className={emUi.sectionTitle}>Shared mailbox</p>
            <div className="mt-3 space-y-2 text-sm text-slate-700">
              <p>
                <span className="font-semibold text-slate-900">From:</span> Saintly Home Health &lt;{fromEmail}&gt;
              </p>
              <p>
                <span className="font-semibold text-slate-900">Reply-To:</span> {replyToEmail}
              </p>
              <p className="text-xs leading-relaxed text-slate-500">
                Staff send through the shared CRM mailbox. Your CRM login is tracked internally; staff do not need the
                Gmail password for admin@.
              </p>
              {!canViewPrivateEmail ? (
                <p className="text-xs text-amber-800">
                  The private info@ business inbox is not shown in this tool. Outreach uses admin@ only.
                </p>
              ) : null}
            </div>

            <div className="mt-6 rounded-2xl border border-sky-100 bg-sky-50/50 p-4">
              <div className="flex items-center gap-3">
                <Image src="/saintly-logo.png" alt="" width={44} height={44} className="rounded-xl border bg-white p-1" />
                <div>
                  <p className="font-semibold text-slate-900">{SAINTLY_COMPANY.legalName}</p>
                  <p className="text-xs text-slate-600">{SAINTLY_COMPANY.cityStateZip}</p>
                </div>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-slate-600">
                NPI {SAINTLY_COMPANY.npi} · Medicare PTAN/CCN {SAINTLY_COMPANY.medicarePtan} · AZDHS{" "}
                {SAINTLY_COMPANY.azdhsLicense}
              </p>
            </div>
          </aside>
        </section>
      ) : null}

      {tab === "flyers" ? (
        <section className={`${emUi.card} p-5 sm:p-6`}>
          <h2 className="text-lg font-bold text-slate-900">Flyer Library</h2>
          <p className="mt-1 text-sm text-slate-600">
            Upload PDFs or images for outreach. Attach to emails or copy the public share link.
          </p>

          {isAdmin ? (
            <form
              className="mt-5 grid gap-3 rounded-2xl border border-dashed border-sky-200 bg-sky-50/30 p-4 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const fd = new FormData(form);
                startTransition(async () => {
                  const result = await uploadEmailMarketingFlyerAction(fd);
                  showToast(result.ok ? "ok" : "error", result.ok ? "Flyer uploaded." : result.error);
                  if (result.ok) form.reset();
                });
              }}
            >
              <label className="block space-y-1.5 sm:col-span-1">
                <span className={emUi.label}>Title</span>
                <input name="title" className={emUi.input} required />
              </label>
              <label className="block space-y-1.5 sm:col-span-1">
                <span className={emUi.label}>Description</span>
                <input name="description" className={emUi.input} />
              </label>
              <label className="block space-y-1.5 sm:col-span-2">
                <span className={emUi.label}>File (PDF or image)</span>
                <input name="file" type="file" accept="application/pdf,image/*" className={emUi.input} required />
              </label>
              <div className="sm:col-span-2">
                <button type="submit" className={emUi.btnPrimary} disabled={pending}>
                  Upload flyer
                </button>
              </div>
            </form>
          ) : (
            <p className={`${emUi.alertWarn} mt-4`}>Only admins can upload new flyers. You can still attach existing flyers.</p>
          )}

          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {flyers.map((flyer) => (
              <article key={flyer.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-slate-900">{flyer.title}</h3>
                    {flyer.description ? <p className="mt-1 text-sm text-slate-600">{flyer.description}</p> : null}
                  </div>
                  <span className={flyer.is_active ? emUi.pill : emUi.pillMuted}>
                    {flyer.is_active ? "Active" : "Inactive"}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-500">{flyer.file_name}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a href={flyer.file_url} target="_blank" rel="noreferrer" className={emUi.btnSecondary}>
                    Open flyer
                  </a>
                  <button
                    type="button"
                    className={emUi.btnGhost}
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(flyer.file_url);
                        showToast("ok", "Share link copied.");
                      } catch {
                        showToast("error", "Could not copy link.");
                      }
                    }}
                  >
                    Copy share link
                  </button>
                  {isAdmin ? (
                    <button
                      type="button"
                      className={emUi.btnGhost}
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          const fd = new FormData();
                          fd.set("id", flyer.id);
                          fd.set("is_active", flyer.is_active ? "0" : "1");
                          const result = await toggleEmailMarketingFlyerAction(fd);
                          showToast(result.ok ? "ok" : "error", result.ok ? "Flyer updated." : result.error);
                        })
                      }
                    >
                      {flyer.is_active ? "Deactivate" : "Activate"}
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
            {flyers.length === 0 ? <p className="text-sm text-slate-500">No flyers uploaded yet.</p> : null}
          </div>
        </section>
      ) : null}

      {tab === "history" ? (
        <section className={`${emUi.card} overflow-x-auto p-5 sm:p-6`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Sent Email History</h2>
              <p className="mt-1 text-sm text-slate-600">
                {canViewAllHistory
                  ? "Showing all CRM email marketing activity."
                  : "Showing emails you sent from the CRM."}
              </p>
            </div>
          </div>
          <table className="mt-5 w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                <th className="px-2 py-2">Date</th>
                <th className="px-2 py-2">Recipient</th>
                <th className="px-2 py-2">Organization</th>
                <th className="px-2 py-2">Subject</th>
                <th className="px-2 py-2">Template</th>
                <th className="px-2 py-2">Sent by</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Details</th>
              </tr>
            </thead>
            <tbody>
              {history.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50/80">
                  <td className="px-2 py-3 whitespace-nowrap text-slate-600">
                    {formatWhen(row.sent_at ?? row.created_at)}
                  </td>
                  <td className="px-2 py-3">
                    <div className="font-medium text-slate-900">{row.recipient_name || row.recipient_email}</div>
                    <div className="text-xs text-slate-500">{row.recipient_email}</div>
                  </td>
                  <td className="px-2 py-3 text-slate-600">{row.organization_name || "—"}</td>
                  <td className="px-2 py-3 text-slate-800">{row.subject}</td>
                  <td className="px-2 py-3 text-slate-600">{row.email_marketing_templates?.name || "—"}</td>
                  <td className="px-2 py-3 text-slate-600">
                    {row.sent_by_user_id ? staffLabels[row.sent_by_user_id] || "Staff" : "—"}
                  </td>
                  <td className="px-2 py-3">
                    <span className={row.status === "sent" ? emUi.pill : emUi.pillMuted}>{row.status}</span>
                  </td>
                  <td className="px-2 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className={emUi.btnGhost} onClick={() => setHistoryDetailId(row.id)}>
                        View
                      </button>
                      {row.status === "draft" ? (
                        <button type="button" className={emUi.btnSecondary} onClick={() => loadDraftFromHistory(row)}>
                          Edit draft
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {history.length === 0 ? <p className="mt-4 text-sm text-slate-500">No emails yet.</p> : null}
        </section>
      ) : null}

      {previewOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[2px]">
          <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h3 className="text-lg font-bold text-slate-900">Letterhead preview</h3>
              <button type="button" className={emUi.btnGhost} onClick={() => setPreviewOpen(false)}>
                Close
              </button>
            </div>
            <iframe title="Email preview" className="h-[min(72vh,720px)] w-full bg-slate-100" srcDoc={previewHtml} />
          </div>
        </div>
      ) : null}

      {historyDetail ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[2px]">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[28px] border border-slate-200 bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">{historyDetail.subject}</h3>
                <p className="mt-1 text-sm text-slate-600">
                  {formatWhen(historyDetail.sent_at ?? historyDetail.created_at)} · {historyDetail.status}
                </p>
              </div>
              <button type="button" className={emUi.btnGhost} onClick={() => setHistoryDetailId(null)}>
                Close
              </button>
            </div>
            <dl className="mt-4 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
              <div>
                <dt className="font-semibold text-slate-900">Recipient</dt>
                <dd>
                  {historyDetail.recipient_name || "—"} ({historyDetail.recipient_email})
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-900">Organization</dt>
                <dd>{historyDetail.organization_name || "—"}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-900">Sender profile</dt>
                <dd>{historyDetail.email_sender_profiles?.display_name || "—"}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-900">From / Reply-To</dt>
                <dd>
                  {historyDetail.from_email} · {historyDetail.reply_to_email}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-900">Template</dt>
                <dd>{historyDetail.email_marketing_templates?.name || "—"}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-900">Flyer</dt>
                <dd>
                  {historyDetail.email_marketing_flyers?.title ? (
                    <a
                      href={historyDetail.email_marketing_flyers.file_url}
                      className="text-sky-700 underline"
                      target="_blank"
                      rel="noreferrer"
                    >
                      {historyDetail.email_marketing_flyers.title}
                    </a>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
            </dl>
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Body</p>
              <pre className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{historyDetail.body}</pre>
            </div>
            {historyDetail.error_message ? (
              <div className={`${emUi.alertError} mt-4`}>{historyDetail.error_message}</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
