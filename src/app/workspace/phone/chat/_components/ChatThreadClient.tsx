"use client";

import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { BellOff, ChevronLeft, Paperclip, Pin, Send } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type Msg = {
  id: string;
  senderId: string;
  senderLabel: string;
  createdAt: string;
  body: string;
  attachmentPath: string | null;
  attachmentMime: string | null;
  attachmentName: string | null;
  mentionUserIds: string[];
  readByUserIds: string[];
};

type Props = {
  chatId: string;
  title: string;
  showMemberAdmin: boolean;
  selfUserId: string;
};

export function ChatThreadClient({ chatId, title, showMemberAdmin, selfUserId }: Props) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [mentionPick, setMentionPick] = useState<Array<{ userId: string; label: string }>>([]);
  const [showMentions, setShowMentions] = useState(false);
  const [muted, setMuted] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [memberUserId, setMemberUserId] = useState("");
  const [memberRole, setMemberRole] = useState("staff");
  const [canPost, setCanPost] = useState(true);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const loadMessages = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/workspace/internal-chat/chats/${chatId}/messages`, {
        cache: "no-store",
      });
      const json = (await res.json()) as {
        messages?: Msg[];
        notificationsMuted?: boolean;
        pinned?: boolean;
        canPost?: boolean;
      };
      const list = json.messages ?? [];
      setMessages(list);
      if (typeof json.notificationsMuted === "boolean") {
        setMuted(json.notificationsMuted);
      }
      if (typeof json.pinned === "boolean") {
        setPinned(json.pinned);
      }
      if (typeof json.canPost === "boolean") {
        setCanPost(json.canPost);
      }
      const last = list[list.length - 1];
      if (last?.id) {
        await fetch(`/api/workspace/internal-chat/chats/${chatId}/read`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ upToMessageId: last.id }),
        });
      }
    } catch {
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [chatId]);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    const channel = supabase
      .channel(`internal_chat_${chatId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "internal_chat_messages",
          filter: `chat_id=eq.${chatId}`,
        },
        () => {
          void loadMessages();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [chatId, loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function send() {
    const t = text.trim();
    if (!t || sending) return;
    const mentionUserIds = [
      ...new Set([...t.matchAll(/@([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi)].map((m) => m[1])),
    ];
    setSending(true);
    try {
      const res = await fetch(`/api/workspace/internal-chat/chats/${chatId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: t, mentionUserIds }),
      });
      if (res.ok) {
        setText("");
        await loadMessages();
      }
    } finally {
      setSending(false);
    }
  }

  async function openAttachment(path: string) {
    const res = await fetch(`/api/workspace/internal-chat/attachment-url?path=${encodeURIComponent(path)}`);
    const json = (await res.json()) as { url?: string };
    if (json.url) {
      window.open(json.url, "_blank", "noopener,noreferrer");
    }
  }

  async function onPickFile(file: File | null) {
    if (!file) return;
    const safe = file.name.replace(/[^\w.\-()+ ]/g, "_").slice(0, 120);
    const objectPath = `${chatId}/${crypto.randomUUID()}/${safe}`;
    const supabase = createBrowserSupabaseClient();
    const { error: upErr } = await supabase.storage.from("internal-chat").upload(objectPath, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || undefined,
    });
    if (upErr) {
      console.warn("[chat] upload", upErr.message);
      return;
    }
    setSending(true);
    try {
      await fetch(`/api/workspace/internal-chat/chats/${chatId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "",
          attachmentPath: objectPath,
          attachmentMime: file.type || "application/octet-stream",
          attachmentName: file.name,
        }),
      });
      await loadMessages();
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    const m = text.match(/@([\w.+@-]*)$/);
    const q = (m?.[1] ?? "").trim();
    if (!m || q.length < 1) {
      setShowMentions(false);
      setMentionPick([]);
      return;
    }
    setShowMentions(true);
    const id = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/workspace/internal-chat/directory?q=${encodeURIComponent(q)}`, {
          cache: "no-store",
        });
        const json = (await res.json()) as { users?: Array<{ userId: string; label: string }> };
        setMentionPick((json.users ?? []).slice(0, 8));
      } catch {
        setMentionPick([]);
      }
    }, 200);
    return () => window.clearTimeout(id);
  }, [text]);

  async function toggleMute() {
    const next = !muted;
    const res = await fetch(`/api/workspace/internal-chat/chats/${chatId}/mute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ muted: next }),
    });
    if (res.ok) {
      setMuted(next);
    }
  }

  async function togglePin() {
    const next = !pinned;
    const res = await fetch(`/api/workspace/internal-chat/chats/${chatId}/pin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: next }),
    });
    if (res.ok) {
      setPinned(next);
    }
  }

  async function addMember(e: React.FormEvent) {
    e.preventDefault();
    if (!memberUserId.trim()) return;
    await fetch(`/api/admin/internal-chat/chats/${chatId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: memberUserId.trim(), memberRole }),
    });
    setMemberUserId("");
  }

  function renderBody(m: Msg) {
    let out = m.body;
    for (const id of m.mentionUserIds ?? []) {
      const re = new RegExp(`@${id}`, "g");
      out = out.replace(re, `@…`);
    }
    return out;
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden pb-24">
      <header className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
        <Link
          href="/workspace/phone/chat"
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600"
          aria-label="Back"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-bold text-slate-900">{title}</h1>
        </div>
        <button
          type="button"
          onClick={() => void togglePin()}
          className={`rounded-lg p-2 ${pinned ? "bg-amber-50 text-amber-800" : "text-slate-500"}`}
          title="Pin"
        >
          <Pin className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => void toggleMute()}
          className={`rounded-lg p-2 ${muted ? "bg-slate-100 text-slate-800" : "text-slate-500"}`}
          title="Mute notifications"
        >
          <BellOff className="h-4 w-4" />
        </button>
      </header>

      {showMemberAdmin ? (
        <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs">
          <form className="flex flex-wrap items-end gap-2" onSubmit={addMember}>
            <label className="flex flex-col">
              <span className="text-[10px] font-semibold uppercase text-slate-500">Add user id</span>
              <input
                value={memberUserId}
                onChange={(e) => setMemberUserId(e.target.value)}
                placeholder="UUID"
                className="w-48 rounded border border-slate-200 px-2 py-1 font-mono text-[11px]"
              />
            </label>
            <select
              value={memberRole}
              onChange={(e) => setMemberRole(e.target.value)}
              className="rounded border border-slate-200 px-2 py-1"
            >
              <option value="staff">Staff</option>
              <option value="read_only">Read-only</option>
              <option value="admin">Admin</option>
            </select>
            <button type="submit" className="rounded bg-slate-800 px-2 py-1 font-semibold text-white">
              Add / update
            </button>
          </form>
          <p className="mt-1 text-[10px] text-slate-500">
            Paste a teammate&apos;s user id from Staff Access / admin tools. Remove via API only in this MVP.
          </p>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {loading ? <p className="text-sm text-slate-500">Loading…</p> : null}
        {!loading && messages.length === 0 ? (
          <p className="text-sm text-slate-500">No messages yet. Say hello.</p>
        ) : null}
        {messages.map((m) => {
          const mine = m.senderId === selfUserId;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                  mine ? "bg-phone-navy text-white" : "border border-slate-200 bg-white text-slate-900"
                }`}
              >
                {!mine ? (
                  <div className="mb-1 text-[10px] font-semibold text-slate-500">{m.senderLabel}</div>
                ) : null}
                <div className="whitespace-pre-wrap break-words">{renderBody(m)}</div>
                {m.attachmentPath ? (
                  <button
                    type="button"
                    onClick={() => void openAttachment(m.attachmentPath!)}
                    className={`mt-2 text-xs underline ${mine ? "text-sky-200" : "text-sky-700"}`}
                  >
                    {m.attachmentName ?? "Attachment"}
                  </button>
                ) : null}
                <div
                  className={`mt-1 text-[10px] ${mine ? "text-sky-100/90" : "text-slate-400"}`}
                >
                  {new Date(m.createdAt).toLocaleString()}
                  {mine && m.readByUserIds.filter((id) => id !== selfUserId).length > 0 ? " · Read" : null}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 border-t border-slate-200 bg-white px-2 py-2">
        {!canPost ? (
          <p className="mb-2 text-center text-xs text-slate-500">You have read-only access in this chat.</p>
        ) : null}
        {showMentions && mentionPick.length > 0 ? (
          <div className="mb-2 max-h-28 overflow-y-auto rounded-lg border border-slate-200 bg-white text-xs shadow-sm">
            {mentionPick.map((u) => (
              <button
                key={u.userId}
                type="button"
                className="block w-full px-2 py-1.5 text-left hover:bg-slate-50"
                onClick={() => {
                  setText((t) => t.slice(0, -1) + `@${u.userId} `);
                  setShowMentions(false);
                }}
              >
                {u.label}
              </button>
            ))}
          </div>
        ) : null}
        <div className={`flex items-end gap-2 ${!canPost ? "pointer-events-none opacity-50" : ""}`}>
          <label className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50">
            <Paperclip className="h-4 w-4" />
            <input
              type="file"
              className="hidden"
              disabled={!canPost}
              onChange={(e) => void onPickFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            placeholder="Message… (@ for mentions)"
            disabled={!canPost}
            className="min-h-[44px] flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-phone-border"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={!canPost || sending || !text.trim()}
            className="mb-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-phone-navy text-white disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
