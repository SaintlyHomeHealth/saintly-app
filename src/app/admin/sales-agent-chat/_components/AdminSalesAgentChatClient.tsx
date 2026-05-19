"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import {
  markAdminSalesAgentChatReadAction,
  sendAdminToSalesAgentChatMessage,
} from "@/app/sales-agent/chat-actions";
import { formatAppDateTime } from "@/lib/datetime/app-timezone";
import type { SalesAgentChatAgentOption, SalesAgentMessageRow } from "@/lib/sales-agent/sales-agent-chat-types";
import { salesAgentDisplayName } from "@/lib/sales-agent/sales-agent-chat-types";

type Props = {
  agents: SalesAgentChatAgentOption[];
  initialAgentUserId: string | null;
  initialMessages: SalesAgentMessageRow[];
  viewerUserId: string;
};

export function AdminSalesAgentChatClient({
  agents,
  initialAgentUserId,
  initialMessages,
  viewerUserId,
}: Props) {
  const [selectedId, setSelectedId] = useState(initialAgentUserId ?? agents[0]?.user_id ?? "");
  const [messages, setMessages] = useState(initialMessages);
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);

  const refreshMessages = useCallback(async (agentUserId: string) => {
    if (!agentUserId) return;
    try {
      const res = await fetch(
        `/api/admin/sales-agent-chat/messages?agentUserId=${encodeURIComponent(agentUserId)}`,
        { cache: "no-store" }
      );
      if (!res.ok) return;
      const json = (await res.json()) as { messages?: SalesAgentMessageRow[] };
      setMessages(json.messages ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    void markAdminSalesAgentChatReadAction(selectedId);
    void refreshMessages(selectedId);
    const id = window.setInterval(() => {
      void refreshMessages(selectedId);
    }, 8_000);
    return () => window.clearInterval(id);
  }, [selectedId, refreshMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, selectedId]);

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text || !selectedId || pending) return;
    const fd = new FormData();
    fd.set("agentUserId", selectedId);
    fd.set("body", text);
    startTransition(async () => {
      const result = await sendAdminToSalesAgentChatMessage(fd);
      if (result.ok) {
        setBody("");
        await refreshMessages(selectedId);
      }
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
      <aside className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <p className="px-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Sales agents</p>
        <ul className="mt-2 space-y-1">
          {agents.length === 0 ? (
            <li className="px-2 py-3 text-sm text-slate-500">No active sales agents.</li>
          ) : (
            agents.map((a) => {
              const active = a.user_id === selectedId;
              return (
                <li key={a.user_id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(a.user_id)}
                    className={`flex w-full items-center justify-between gap-2 rounded-xl px-2 py-2 text-left text-sm ${
                      active ? "bg-sky-50 font-semibold text-sky-900 ring-1 ring-sky-200" : "text-slate-800 hover:bg-slate-50"
                    }`}
                  >
                    <span className="truncate">{salesAgentDisplayName(a)}</span>
                    {a.unread_count > 0 ? (
                      <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                        {a.unread_count}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </aside>

      <div className="flex min-h-[60vh] flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">
            {selectedId
              ? salesAgentDisplayName(agents.find((a) => a.user_id === selectedId) ?? { user_id: selectedId, full_name: null, email: null, unread_count: 0 })
              : "Select a sales agent"}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">Internal staff chat — do not include patient PHI.</p>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {!selectedId ? (
            <p className="text-sm text-slate-500">Choose a sales agent to start chatting.</p>
          ) : messages.length === 0 ? (
            <p className="text-sm text-slate-500">No messages yet.</p>
          ) : (
            messages.map((m) => {
              const mine = m.sender_user_id === viewerUserId;
              return (
                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                      mine ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-900"
                    }`}
                  >
                    <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{m.body}</p>
                    <p className={`mt-1 text-[10px] ${mine ? "text-slate-300" : "text-slate-500"}`}>
                      {formatAppDateTime(m.created_at, "—")}
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
              disabled={!selectedId}
              placeholder={selectedId ? "Type a message…" : "Select an agent first"}
              className="min-h-[44px] flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:bg-slate-50"
            />
            <button
              type="submit"
              disabled={pending || !body.trim() || !selectedId}
              className="shrink-0 self-end rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {pending ? "…" : "Send"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
