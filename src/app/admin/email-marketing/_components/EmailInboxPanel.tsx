"use client";

import { useMemo, useState, useTransition } from "react";

import {
  archiveEmailThreadAction,
  assignEmailThreadAction,
  markEmailThreadReadAction,
} from "@/app/admin/email-marketing/actions";
import { EMAIL_MARKETING_HIPAA_WARNING } from "@/lib/email-marketing/letterhead";
import type {
  EmailAttachmentRow,
  EmailMarketingFlyerRow,
  EmailMessageRow,
  EmailSenderProfileRow,
  EmailThreadRow,
} from "@/lib/email-marketing/types";

import { emUi } from "./email-marketing-ui";

type ThreadMessage = EmailMessageRow & { email_attachments?: EmailAttachmentRow[] };

type StaffOption = { userId: string; label: string };

type Props = {
  threads: EmailThreadRow[];
  messagesByThread: Record<string, ThreadMessage[]>;
  senderProfiles: EmailSenderProfileRow[];
  flyers: EmailMarketingFlyerRow[];
  staffOptions: StaffOption[];
  currentUserId: string;
  staffLabels: Record<string, string>;
  onToast: (type: "ok" | "error", message: string) => void;
  onSync: () => Promise<void>;
  syncing: boolean;
};

type InboxFilter = "all" | "unread" | "assigned_to_me" | "archived";

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function threadHasUnread(messages: ThreadMessage[] | undefined): boolean {
  return (messages ?? []).some((m) => m.direction === "inbound" && !m.read_at);
}

export function EmailInboxPanel({
  threads,
  messagesByThread,
  senderProfiles,
  flyers,
  staffOptions,
  currentUserId,
  staffLabels,
  onToast,
  onSync,
  syncing,
}: Props) {
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [search, setSearch] = useState("");
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(threads[0]?.id ?? null);
  const [replyBody, setReplyBody] = useState("");
  const [senderProfileId, setSenderProfileId] = useState(
    senderProfiles.find((p) => p.is_default && !p.is_custom)?.id ?? senderProfiles[0]?.id ?? ""
  );
  const [flyerId, setFlyerId] = useState("");
  const [attachFlyer, setAttachFlyer] = useState(false);
  const [pending, startTransition] = useTransition();
  const [replyPending, setReplyPending] = useState(false);

  const filteredThreads = useMemo(() => {
    const q = search.trim().toLowerCase();
    return threads.filter((t) => {
      if (filter === "archived" && t.status !== "archived") return false;
      if (filter !== "archived" && t.status === "archived") return false;
      if (filter === "assigned_to_me" && t.assigned_to !== currentUserId) return false;
      if (filter === "unread" && !threadHasUnread(messagesByThread[t.id])) return false;
      if (!q) return true;
      const hay = [t.subject, t.last_message_preview, ...(t.participant_emails ?? []), ...(t.participant_names ?? [])]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [threads, filter, search, messagesByThread, currentUserId]);

  const selectedThread = filteredThreads.find((t) => t.id === selectedThreadId) ?? filteredThreads[0] ?? null;
  const selectedMessages = selectedThread ? messagesByThread[selectedThread.id] ?? [] : [];

  async function handleSync() {
    try {
      await onSync();
      onToast("ok", "Inbox synced.");
    } catch (err) {
      onToast("error", err instanceof Error ? err.message : "Sync failed.");
    }
  }

  function runThreadAction(action: (fd: FormData) => Promise<{ ok: boolean; error?: string }>, fd: FormData, okMsg: string) {
    startTransition(async () => {
      const result = await action(fd);
      onToast(result.ok ? "ok" : "error", result.ok ? okMsg : result.error ?? "Action failed.");
    });
  }

  async function sendReply() {
    if (!selectedThread) return;
    setReplyPending(true);
    try {
      const res = await fetch(`/api/admin/email-marketing/threads/${selectedThread.id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: replyBody,
          senderProfileId,
          flyerId: flyerId || null,
          attachFlyer,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || json.error) {
        onToast("error", json.error ?? "Reply failed.");
        return;
      }
      setReplyBody("");
      onToast("ok", "Reply sent.");
      await onSync();
    } catch (err) {
      onToast("error", err instanceof Error ? err.message : "Reply failed.");
    } finally {
      setReplyPending(false);
    }
  }

  return (
    <section className={`${emUi.card} overflow-hidden`}>
      <div className="flex flex-col lg:grid lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] lg:min-h-[640px]">
        <aside className="border-b border-slate-200 lg:border-b-0 lg:border-r">
          <div className="space-y-3 border-b border-slate-100 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-bold text-slate-900">Inbox</h2>
              <button type="button" className={emUi.btnSecondary} disabled={syncing || pending} onClick={handleSync}>
                {syncing ? "Syncing…" : "Sync inbox"}
              </button>
            </div>
            <input
              className={emUi.input}
              placeholder="Search threads…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["all", "All"],
                  ["unread", "Unread"],
                  ["assigned_to_me", "Assigned to me"],
                  ["archived", "Archived"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`${emUi.tab} ${filter === id ? emUi.tabActive : emUi.tabIdle}`}
                  onClick={() => setFilter(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="max-h-[520px] overflow-y-auto">
            {filteredThreads.map((thread) => {
              const unread = threadHasUnread(messagesByThread[thread.id]);
              const active = selectedThread?.id === thread.id;
              const sender =
                thread.participant_names?.[0] ||
                thread.participant_emails?.find((e) => !e.includes("admin@saintlyhomehealth.com")) ||
                thread.participant_emails?.[0] ||
                "Unknown";
              return (
                <button
                  key={thread.id}
                  type="button"
                  className={`block w-full border-b border-slate-100 px-4 py-3 text-left transition ${
                    active ? "bg-sky-50/80" : "hover:bg-slate-50"
                  }`}
                  onClick={() => setSelectedThreadId(thread.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-sm ${unread ? "font-bold text-slate-900" : "font-medium text-slate-800"}`}>
                      {sender}
                    </p>
                    <span className="shrink-0 text-[11px] text-slate-500">{formatWhen(thread.last_message_at)}</span>
                  </div>
                  <p className={`mt-1 truncate text-sm ${unread ? "font-semibold text-slate-900" : "text-slate-700"}`}>
                    {thread.subject || "(No subject)"}
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-500">{thread.last_message_preview}</p>
                  {unread ? <span className={`${emUi.pill} mt-2`}>Unread</span> : null}
                </button>
              );
            })}
            {filteredThreads.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">No threads yet. Send outreach or sync the inbox.</p>
            ) : null}
          </div>
        </aside>

        <div className="flex min-h-[420px] flex-col">
          {selectedThread ? (
            <>
              <div className="border-b border-slate-100 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">{selectedThread.subject || "(No subject)"}</h3>
                    <p className="mt-1 text-xs text-slate-500">
                      {(selectedThread.participant_emails ?? []).join(", ") || "—"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={emUi.btnGhost}
                      disabled={pending}
                      onClick={() => {
                        const fd = new FormData();
                        fd.set("thread_id", selectedThread.id);
                        fd.set("read", "1");
                        runThreadAction(markEmailThreadReadAction, fd, "Marked read.");
                      }}
                    >
                      Mark read
                    </button>
                    <button
                      type="button"
                      className={emUi.btnGhost}
                      disabled={pending}
                      onClick={() => {
                        const fd = new FormData();
                        fd.set("thread_id", selectedThread.id);
                        fd.set("archived", selectedThread.status === "archived" ? "0" : "1");
                        runThreadAction(
                          archiveEmailThreadAction,
                          fd,
                          selectedThread.status === "archived" ? "Unarchived." : "Archived."
                        );
                      }}
                    >
                      {selectedThread.status === "archived" ? "Unarchive" : "Archive"}
                    </button>
                  </div>
                </div>
                <label className="mt-3 block max-w-xs space-y-1">
                  <span className={emUi.label}>Assign to</span>
                  <select
                    className={emUi.select}
                    value={selectedThread.assigned_to ?? ""}
                    onChange={(e) => {
                      const fd = new FormData();
                      fd.set("thread_id", selectedThread.id);
                      fd.set("assigned_to", e.target.value);
                      runThreadAction(assignEmailThreadAction, fd, "Assignment updated.");
                    }}
                  >
                    <option value="">Unassigned</option>
                    {staffOptions.map((s) => (
                      <option key={s.userId} value={s.userId}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {selectedMessages.map((msg) => {
                  const outbound = msg.direction === "outbound";
                  return (
                    <article
                      key={msg.id}
                      className={`rounded-2xl border p-4 ${
                        outbound
                          ? "ml-4 border-sky-200 bg-sky-50/70 sm:ml-12"
                          : "mr-4 border-slate-200 bg-white sm:mr-12"
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            {msg.from_name || msg.from_email}
                            {outbound && msg.sent_by_user_id ? (
                              <span className="ml-2 text-xs font-normal text-slate-500">
                                via CRM · {staffLabels[msg.sent_by_user_id] ?? "Staff"}
                              </span>
                            ) : null}
                          </p>
                          <p className="text-xs text-slate-500">{formatWhen(msg.gmail_internal_date ?? msg.created_at)}</p>
                        </div>
                        <span className={outbound ? emUi.pill : emUi.pillMuted}>{outbound ? "Sent" : "Received"}</span>
                      </div>
                      <div className="mt-3 whitespace-pre-wrap text-sm text-slate-800">
                        {msg.body_html ? (
                          <div
                            className="prose prose-sm max-w-none text-slate-800"
                            dangerouslySetInnerHTML={{ __html: msg.body_html }}
                          />
                        ) : (
                          msg.body_text
                        )}
                      </div>
                      {msg.email_attachments?.length ? (
                        <ul className="mt-3 space-y-1 text-sm">
                          {msg.email_attachments.map((att) => (
                            <li key={att.id}>
                              <a
                                className="font-medium text-sky-700 hover:underline"
                                href={`/api/admin/email-marketing/attachments/download?id=${att.id}`}
                              >
                                Download {att.file_name}
                              </a>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </article>
                  );
                })}
              </div>

              <div className="border-t border-slate-100 bg-slate-50/60 p-4">
                <div className={emUi.alertWarn}>{EMAIL_MARKETING_HIPAA_WARNING}</div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="block space-y-1 sm:col-span-2">
                    <span className={emUi.label}>Sender profile</span>
                    <select className={emUi.select} value={senderProfileId} onChange={(e) => setSenderProfileId(e.target.value)}>
                      {senderProfiles
                        .filter((p) => p.is_active)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.display_name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="block space-y-1 sm:col-span-2">
                    <span className={emUi.label}>Reply</span>
                    <textarea
                      className={emUi.textarea}
                      value={replyBody}
                      onChange={(e) => setReplyBody(e.target.value)}
                      placeholder="Write your reply…"
                    />
                  </label>
                  <label className="block space-y-1">
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
                  <label className="flex items-center gap-2 self-end pb-2">
                    <input type="checkbox" checked={attachFlyer} onChange={(e) => setAttachFlyer(e.target.checked)} disabled={!flyerId} />
                    <span className="text-sm text-slate-700">Attach flyer</span>
                  </label>
                </div>
                <button
                  type="button"
                  className={`${emUi.btnSend} mt-3`}
                  disabled={replyPending || !replyBody.trim()}
                  onClick={sendReply}
                >
                  {replyPending ? "Sending…" : "Send reply"}
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-8 text-sm text-slate-500">
              Select a thread to read and reply.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
