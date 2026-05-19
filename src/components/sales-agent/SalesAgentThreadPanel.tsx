"use client";

import { ChevronLeft, FileText, Paperclip, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import {
  markAdminSalesAgentChatReadAction,
  markSalesAgentChatReadAction,
  sendAdminToSalesAgentChatMessage,
  sendSalesAgentChatMessage,
} from "@/app/sales-agent/chat-actions";
import { formatAppDateTime } from "@/lib/datetime/app-timezone";
import type { SalesAgentMessageAttachmentView, SalesAgentMessageView } from "@/lib/sales-agent/sales-agent-chat-types";

type Props = {
  mode: "agent" | "manager";
  agentUserId: string;
  title: string;
  subtitle?: string;
  viewerUserId: string;
  initialMessages: SalesAgentMessageView[];
  backHref?: string;
  /** Full-height workspace phone thread layout */
  variant?: "card" | "workspace";
};

function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentBlock({
  attachment,
  mine,
  mode,
}: {
  attachment: SalesAgentMessageAttachmentView;
  mine: boolean;
  mode: "agent" | "manager";
}) {
  const label = attachment.file_name?.trim() || (attachment.isImage ? "Photo" : "File");
  const size = formatFileSize(attachment.file_size_bytes);

  if (attachment.isImage) {
    return (
      <a
        href={attachment.fileUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 block overflow-hidden rounded-lg"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={attachment.fileUrl}
          alt=""
          className="max-h-48 w-full max-w-[240px] rounded-lg object-cover"
        />
      </a>
    );
  }

  return (
    <a
      href={attachment.fileUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`mt-2 flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs ${
        mine
          ? mode === "manager"
            ? "border-slate-600 bg-slate-800 text-white"
            : "border-sky-500 bg-sky-700 text-white"
          : "border-slate-200 bg-white text-slate-800"
      }`}
    >
      <FileText className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
      {size ? <span className="shrink-0 opacity-70">{size}</span> : null}
    </a>
  );
}

export function SalesAgentThreadPanel({
  mode,
  agentUserId,
  title,
  subtitle,
  viewerUserId,
  initialMessages,
  backHref,
  variant = "card",
}: Props) {
  const [messages, setMessages] = useState(initialMessages);
  const [body, setBody] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const messagesUrl =
    mode === "agent"
      ? "/api/sales-agent/chat/messages"
      : `/api/admin/sales-agent-chat/messages?agentUserId=${encodeURIComponent(agentUserId)}`;

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(messagesUrl, { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as { messages?: SalesAgentMessageView[] };
      setMessages(json.messages ?? []);
    } catch {
      /* ignore */
    }
  }, [messagesUrl]);

  useEffect(() => {
    if (mode === "agent") {
      void markSalesAgentChatReadAction();
    } else {
      void markAdminSalesAgentChatReadAction(agentUserId);
    }
    const id = window.setInterval(() => {
      void refresh();
    }, 8_000);
    return () => window.clearInterval(id);
  }, [mode, agentUserId, refresh]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  function pickFile(file: File | null) {
    setError(null);
    setPendingFile(file);
  }

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if ((!text && !pendingFile) || pending) return;

    const fd = new FormData();
    fd.set("body", text);
    if (pendingFile) {
      fd.set("attachment", pendingFile);
    }
    if (mode === "manager") {
      fd.set("agentUserId", agentUserId);
    }

    startTransition(async () => {
      setError(null);
      const result =
        mode === "agent"
          ? await sendSalesAgentChatMessage(fd)
          : await sendAdminToSalesAgentChatMessage(fd);
      if (result.ok) {
        setBody("");
        setPendingFile(null);
        await refresh();
      } else {
        setError(result.error ?? "Could not send message.");
      }
    });
  }

  const shellClass =
    variant === "workspace"
      ? "flex min-h-0 flex-1 flex-col overflow-hidden bg-white"
      : "flex min-h-[60vh] flex-col rounded-2xl border border-slate-200 bg-white shadow-sm";

  const canSend = Boolean(body.trim() || pendingFile);

  return (
    <div className={shellClass}>
      <div className="shrink-0 border-b border-slate-100 px-3 py-2.5 sm:px-4">
        <div className="flex items-center gap-2">
          {backHref ? (
            <Link
              href={backHref}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100"
              aria-label="Back to chat list"
            >
              <ChevronLeft className="h-5 w-5" />
            </Link>
          ) : null}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold text-slate-900">{title}</h2>
            {subtitle ? <p className="truncate text-xs text-slate-500">{subtitle}</p> : null}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-4 sm:px-4">
        {messages.length === 0 ? (
          <p className="text-center text-sm text-slate-500">No messages yet.</p>
        ) : (
          messages.map((m) => {
            const mine = m.sender_user_id === viewerUserId;
            const hasBody = Boolean(m.body.trim());
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                    mine
                      ? mode === "manager"
                        ? "bg-slate-900 text-white"
                        : "bg-sky-600 text-white"
                      : "bg-slate-100 text-slate-900"
                  }`}
                >
                  {!mine ? (
                    <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      {m.senderLabel}
                    </p>
                  ) : null}
                  {hasBody ? (
                    <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{m.body}</p>
                  ) : null}
                  {m.attachments.map((a) => (
                    <AttachmentBlock key={a.id} attachment={a} mine={mine} mode={mode} />
                  ))}
                  <p
                    className={`mt-1 text-[10px] ${
                      mine
                        ? mode === "manager"
                          ? "text-slate-300"
                          : "text-sky-100"
                        : "text-slate-500"
                    }`}
                  >
                    {formatAppDateTime(m.created_at, "—")}
                    {!mine && m.read_at ? " · Read" : !mine && !m.read_at ? " · Unread" : ""}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSend} className="shrink-0 border-t border-slate-100 p-3">
        {pendingFile ? (
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-700">
            <Paperclip className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{pendingFile.name}</span>
            <button
              type="button"
              onClick={() => pickFile(null)}
              className="inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-500 hover:bg-slate-200"
              aria-label="Remove attachment"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}
        {error ? <p className="mb-2 text-xs text-red-600">{error}</p> : null}
        <div className="flex gap-2">
          <div className="flex shrink-0 flex-col gap-1 self-end">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50"
              aria-label="Attach file"
            >
              <Paperclip className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 sm:hidden"
              aria-label="Take photo"
            >
              📷
            </button>
          </div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={2}
            placeholder="Type a message…"
            className="min-h-[44px] flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
          />
          <button
            type="submit"
            disabled={pending || !canSend}
            className={`shrink-0 self-end rounded-full px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 ${
              mode === "manager" ? "bg-slate-900 hover:bg-slate-800" : "bg-sky-600 hover:bg-sky-700"
            }`}
          >
            {pending ? "…" : "Send"}
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.pdf,.doc,.docx,.heic,.jpeg,.jpg,.png"
          className="hidden"
          onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
        />
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
        />
      </form>
    </div>
  );
}
