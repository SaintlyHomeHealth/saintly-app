"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import {
  markAdminSalesAgentChatReadAction,
  markSalesAgentChatReadAction,
  sendAdminToSalesAgentChatMessage,
  sendSalesAgentChatMessage,
} from "@/app/sales-agent/chat-actions";
import { formatAppDateTime } from "@/lib/datetime/app-timezone";
import type { SalesAgentMessageView } from "@/lib/sales-agent/sales-agent-chat-types";

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
  const [pending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);

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

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text || pending) return;
    const fd = new FormData();
    fd.set("body", text);
    if (mode === "manager") {
      fd.set("agentUserId", agentUserId);
    }
    startTransition(async () => {
      const result =
        mode === "agent"
          ? await sendSalesAgentChatMessage(fd)
          : await sendAdminToSalesAgentChatMessage(fd);
      if (result.ok) {
        setBody("");
        await refresh();
      }
    });
  }

  const shellClass =
    variant === "workspace"
      ? "flex min-h-0 flex-1 flex-col overflow-hidden bg-white"
      : "flex min-h-[60vh] flex-col rounded-2xl border border-slate-200 bg-white shadow-sm";

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
                  <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{m.body}</p>
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
        <div className="flex gap-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={2}
            placeholder="Type a message…"
            className="min-h-[44px] flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
          />
          <button
            type="submit"
            disabled={pending || !body.trim()}
            className={`shrink-0 self-end rounded-full px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 ${
              mode === "manager" ? "bg-slate-900 hover:bg-slate-800" : "bg-sky-600 hover:bg-sky-700"
            }`}
          >
            {pending ? "…" : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}
