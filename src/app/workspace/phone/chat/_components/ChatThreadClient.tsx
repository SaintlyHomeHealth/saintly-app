"use client";

import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { BellOff, ChevronLeft, Paperclip, Pin, Send, UserPlus } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type PatientMentionCard = { id: string; label: string; href: string };

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
  patientMentions?: PatientMentionCard[];
};

type StaffPick = { userId: string; label: string };
type PatientPick = { patientId: string; label: string };

type ChatMemberRow = {
  userId: string;
  memberRole: string;
  label: string;
  email: string | null;
  isActive: boolean;
};

type Props = {
  chatId: string;
  chatType: string;
  title: string;
  showMemberAdmin: boolean;
  selfUserId: string;
};

export function ChatThreadClient({ chatId, chatType, title, showMemberAdmin, selfUserId }: Props) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [staffPicks, setStaffPicks] = useState<StaffPick[]>([]);
  const [patientPicks, setPatientPicks] = useState<PatientPick[]>([]);
  const [sending, setSending] = useState(false);
  const [mentionPick, setMentionPick] = useState<Array<{ userId: string; label: string }>>([]);
  const [showMentions, setShowMentions] = useState(false);
  const [muted, setMuted] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [memberRole, setMemberRole] = useState("staff");
  const [canPost, setCanPost] = useState(true);
  const [members, setMembers] = useState<ChatMemberRow[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [memberSuggest, setMemberSuggest] = useState<Array<{ userId: string; label: string }>>([]);
  const [mentionablePatients, setMentionablePatients] = useState<PatientPick[]>([]);
  const [patientMenuOpen, setPatientMenuOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const showPatientMentions = chatType === "company" || chatType === "team";

  const loadMembers = useCallback(async () => {
    if (!showMemberAdmin) return;
    try {
      const res = await fetch(`/api/admin/internal-chat/chats/${chatId}/members`, { cache: "no-store" });
      const json = (await res.json()) as { members?: ChatMemberRow[] };
      setMembers(json.members ?? []);
    } catch {
      setMembers([]);
    }
  }, [chatId, showMemberAdmin]);

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
    void loadMembers();
  }, [loadMembers]);

  useEffect(() => {
    if (!showPatientMentions) return;
    void (async () => {
      try {
        const res = await fetch("/api/workspace/internal-chat/mentionable-patients", { cache: "no-store" });
        const json = (await res.json()) as { patients?: Array<{ patientId: string; label: string }> };
        setMentionablePatients(
          (json.patients ?? []).map((p) => ({ patientId: p.patientId, label: p.label }))
        );
      } catch {
        setMentionablePatients([]);
      }
    })();
  }, [showPatientMentions]);

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

  function upsertStaffPick(userId: string, label: string) {
    setStaffPicks((prev) => {
      const rest = prev.filter((p) => p.userId !== userId);
      return [...rest, { userId, label }];
    });
  }

  function upsertPatientPick(patientId: string, label: string) {
    setPatientPicks((prev) => {
      const rest = prev.filter((p) => p.patientId !== patientId);
      return [...rest, { patientId, label }];
    });
  }

  async function send() {
    const t = text.trim();
    const sp = staffPicks.filter((p) => text.includes(`@${p.label}`));
    const pp = patientPicks.filter((p) => text.includes(`@${p.label}`));
    if ((!t && pp.length === 0 && sp.length === 0) || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/workspace/internal-chat/chats/${chatId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: t,
          staffMentions: sp.map((p) => ({ userId: p.userId, label: p.label })),
          patientMentions: showPatientMentions
            ? pp.map((p) => ({ patientId: p.patientId, label: p.label }))
            : [],
        }),
      });
      if (res.ok) {
        setText("");
        setStaffPicks([]);
        setPatientPicks([]);
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
          staffMentions: [],
          patientMentions: [],
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
    const m = text.match(/@([\w.'\u2019+-]*)$/u);
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

  useEffect(() => {
    if (!showMemberAdmin || memberSearch.trim().length < 2) {
      setMemberSuggest([]);
      return;
    }
    const id = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/workspace/internal-chat/directory?q=${encodeURIComponent(memberSearch.trim())}`,
          { cache: "no-store" }
        );
        const json = (await res.json()) as { users?: Array<{ userId: string; label: string }> };
        const existing = new Set(members.map((x) => x.userId));
        setMemberSuggest((json.users ?? []).filter((u) => !existing.has(u.userId)).slice(0, 12));
      } catch {
        setMemberSuggest([]);
      }
    }, 200);
    return () => window.clearTimeout(id);
  }, [memberSearch, members, showMemberAdmin]);

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

  async function addMemberByUserId(userId: string) {
    await fetch(`/api/admin/internal-chat/chats/${chatId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, memberRole }),
    });
    setMemberSearch("");
    setMemberSuggest([]);
    await loadMembers();
  }

  async function removeMember(userId: string) {
    await fetch(`/api/admin/internal-chat/chats/${chatId}/members?userId=${encodeURIComponent(userId)}`, {
      method: "DELETE",
    });
    await loadMembers();
  }

  async function updateMemberRole(userId: string, role: string) {
    await fetch(`/api/admin/internal-chat/chats/${chatId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, memberRole: role }),
    });
    await loadMembers();
  }

  function insertStaffMentionFromPicker(userId: string, label: string) {
    const m = text.match(/^(.*)@([\w.'\u2019+-]*)$/u);
    const prefix = m ? m[1] ?? "" : text;
    setText(`${prefix}@${label} `);
    upsertStaffPick(userId, label);
    setShowMentions(false);
    setMentionPick([]);
  }

  function pickPatientForMention(p: PatientPick) {
    setText((prev) => `${prev}@${p.label} `);
    upsertPatientPick(p.patientId, p.label);
    setPatientMenuOpen(false);
  }

  const canSend =
    Boolean(text.trim()) ||
    staffPicks.some((p) => text.includes(`@${p.label}`)) ||
    (showPatientMentions && patientPicks.some((p) => text.includes(`@${p.label}`)));

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
        <div className="max-h-56 shrink-0 overflow-y-auto border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs">
          <div className="font-semibold text-slate-800">Manage members</div>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <input
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              placeholder="Search staff to add…"
              className="min-w-[10rem] flex-1 rounded border border-slate-200 px-2 py-1 text-sm"
            />
            <select
              value={memberRole}
              onChange={(e) => setMemberRole(e.target.value)}
              className="rounded border border-slate-200 px-2 py-1"
            >
              <option value="staff">Staff</option>
              <option value="read_only">Read-only</option>
              <option value="admin">Channel admin</option>
            </select>
          </div>
          {memberSuggest.length > 0 ? (
            <ul className="mt-1 max-h-24 overflow-y-auto rounded border border-slate-200 bg-white">
              {memberSuggest.map((u) => (
                <li key={u.userId}>
                  <button
                    type="button"
                    className="w-full px-2 py-1.5 text-left text-sm hover:bg-slate-50"
                    onClick={() => void addMemberByUserId(u.userId)}
                  >
                    {u.label}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <ul className="mt-2 space-y-1">
            {members.map((m) => (
              <li
                key={m.userId}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200/80 bg-white px-2 py-1"
              >
                <span className="min-w-0 truncate">
                  <span className="font-medium text-slate-900">{m.label}</span>
                  {m.email ? <span className="ml-1 text-slate-500">({m.email})</span> : null}
                  {!m.isActive ? <span className="ml-1 text-amber-700">inactive</span> : null}
                </span>
                <div className="flex items-center gap-1">
                  <select
                    value={m.memberRole}
                    className="rounded border border-slate-200 px-1 py-0.5 text-[11px]"
                    onChange={(e) => void updateMemberRole(m.userId, e.target.value)}
                  >
                    <option value="staff">Staff</option>
                    <option value="read_only">Read-only</option>
                    <option value="admin">Admin</option>
                  </select>
                  {m.userId !== selfUserId ? (
                    <button
                      type="button"
                      className="text-[11px] font-semibold text-rose-700"
                      onClick={() => void removeMember(m.userId)}
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
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
                {m.body ? (
                  <div className="whitespace-pre-wrap break-words">{m.body}</div>
                ) : null}
                {m.patientMentions && m.patientMentions.length > 0 ? (
                  <div className={`mt-2 space-y-1 ${mine ? "text-sky-100" : ""}`}>
                    {m.patientMentions.map((p) => (
                      <Link
                        key={p.id}
                        href={p.href}
                        className={`block rounded-lg border px-2 py-1.5 text-xs font-medium ${
                          mine
                            ? "border-sky-400/50 bg-phone-navy/90 text-white"
                            : "border-sky-200 bg-sky-50 text-sky-900"
                        }`}
                      >
                        Patient · {p.label}
                      </Link>
                    ))}
                  </div>
                ) : null}
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
                onClick={() => insertStaffMentionFromPicker(u.userId, u.label)}
              >
                {u.label}
              </button>
            ))}
          </div>
        ) : null}
        {showPatientMentions && canPost ? (
          <div className="mb-2">
            <button
              type="button"
              onClick={() => setPatientMenuOpen((o) => !o)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Reference patient
            </button>
            {patientMenuOpen ? (
              <ul className="mt-1 max-h-32 overflow-y-auto rounded-lg border border-slate-200 bg-white text-xs shadow-sm">
                {mentionablePatients.length === 0 ? (
                  <li className="px-2 py-2 text-slate-500">No assigned patients.</li>
                ) : (
                  mentionablePatients.map((p) => (
                    <li key={p.patientId}>
                      <button
                        type="button"
                        className="w-full px-2 py-1.5 text-left hover:bg-slate-50"
                        onClick={() => pickPatientForMention(p)}
                      >
                        {p.label}
                      </button>
                    </li>
                  ))
                )}
              </ul>
            ) : null}
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
            placeholder="Message… (type @ to mention a teammate)"
            disabled={!canPost}
            className="min-h-[44px] flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-phone-border"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={!canPost || sending || !canSend}
            className="mb-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-phone-navy text-white disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
