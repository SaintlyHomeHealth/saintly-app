"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import {
  markSalesAgentChatReadAction,
  sendSalesAgentChatMessage,
} from "@/app/sales-agent/chat-actions";
import { formatAppDateTime } from "@/lib/datetime/app-timezone";
import type { SalesAgentMessageRow } from "@/lib/sales-agent/sales-agent-chat-types";

type Props = {
  initialMessages: SalesAgentMessageRow[];
  viewerUserId: string;
};

export function SalesAgentChatClient({ initialMessages, viewerUserId }: Props) {
  const [messages, setMessages] = useState(initialMessages);
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/sales-agent/chat/messages", { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as { messages?: SalesAgentMessageRow[] };
      setMessages(json.messages ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void markSalesAgentChatReadAction();
    const id = window.setInterval(() => {
      void refresh();
    }, 8_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text || pending) return;
    const fd = new FormData();
    fd.set("body", text);
    startTransition(async () => {
      const result = await sendSalesAgentChatMessage(fd);
      if (result.ok) {
        setBody("");
        await refresh();
      }
    });
  }

  return (
    <div className="flex min-h-[60vh] flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Chat with Saintly Admin</h2>
        <p className="mt-0.5 text-xs text-slate-500">Internal staff messages only — not SMS or email.</p>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <p className="text-center text-sm text-slate-500">No messages yet. Say hello to intake staff.</p>
        ) : (
          messages.map((m) => {
            const mine = m.sender_user_id === viewerUserId;
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                    mine ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-900"
                  }`}
                >
                  <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{m.body}</p>
                  <p className={`mt-1 text-[10px] ${mine ? "text-sky-100" : "text-slate-500"}`}>
                    {formatAppDateTime(m.created_at, "—")}
                    {!mine && m.read_at ? " · Read" : !mine ? " · Unread" : ""}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSend} className="border-t border-slate-100 p-3">
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
            className="shrink-0 self-end rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
          >
            {pending ? "…" : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}
