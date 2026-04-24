"use client";

import { MessageCirclePlus, Search, Users } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

export type ChatListItem = {
  id: string;
  chatType: string;
  title: string;
  pinnedAt: string | null;
  notificationsMuted: boolean;
  lastMessageAt: string | null;
  lastMessagePreview: string;
  hasUnread: boolean;
  patientId: string | null;
  teamRole: string | null;
};

type Props = {
  showTeamAdmin: boolean;
};

export function ChatListClient({ showTeamAdmin }: Props) {
  const [chats, setChats] = useState<ChatListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQ, setSearchQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchHits, setSearchHits] = useState<{
    chats: Array<{ id: string; title: string; chatType: string }>;
    messages: Array<{ chatId: string; messageId: string; snippet: string }>;
  } | null>(null);
  const [teamTitle, setTeamTitle] = useState("");
  const [teamRole, setTeamRole] = useState("nurse");
  const [teamBusy, setTeamBusy] = useState(false);
  const [dmOpen, setDmOpen] = useState(false);
  const [dmQuery, setDmQuery] = useState("");
  const [dmUsers, setDmUsers] = useState<Array<{ userId: string; label: string }>>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/workspace/internal-chat/chats", { cache: "no-store" });
      const json = (await res.json()) as { chats?: ChatListItem[] };
      setChats(json.chats ?? []);
    } catch {
      setChats([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runSearch = useCallback(async () => {
    const q = searchQ.trim();
    if (q.length < 2) {
      setSearchHits(null);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/workspace/internal-chat/search?q=${encodeURIComponent(q)}`, {
        cache: "no-store",
      });
      const json = (await res.json()) as {
        chats?: Array<{ id: string; title: string; chatType: string }>;
        messages?: Array<{ chatId: string; messageId: string; snippet: string }>;
      };
      setSearchHits({
        chats: json.chats ?? [],
        messages: json.messages ?? [],
      });
    } catch {
      setSearchHits({ chats: [], messages: [] });
    } finally {
      setSearching(false);
    }
  }, [searchQ]);

  useEffect(() => {
    if (searchQ.trim().length < 2) {
      setSearchHits(null);
      return;
    }
    const t = window.setTimeout(() => {
      void runSearch();
    }, 280);
    return () => window.clearTimeout(t);
  }, [searchQ, runSearch]);

  const grouped = useMemo(() => {
    const byRecent = (a: ChatListItem, b: ChatListItem) => {
      const ta = a.lastMessageAt ?? "";
      const tb = b.lastMessageAt ?? "";
      return tb.localeCompare(ta);
    };
    const pinned = chats
      .filter((c) => Boolean(c.pinnedAt))
      .sort((a, b) => (b.pinnedAt ?? "").localeCompare(a.pinnedAt ?? ""));
    const pinnedIds = new Set(pinned.map((c) => c.id));
    const rest = chats.filter((c) => !pinnedIds.has(c.id));
    return {
      pinned,
      organization: rest.filter((c) => c.chatType === "company").sort(byRecent),
      teams: rest.filter((c) => c.chatType === "team").sort(byRecent),
      patients: rest.filter((c) => c.chatType === "patient").sort(byRecent),
      direct: rest.filter((c) => c.chatType === "direct").sort(byRecent),
    };
  }, [chats]);

  async function createTeamChannel(e: React.FormEvent) {
    e.preventDefault();
    if (!teamTitle.trim()) return;
    setTeamBusy(true);
    try {
      const res = await fetch("/api/admin/internal-chat/team-channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: teamTitle.trim(), teamRole }),
      });
      const json = (await res.json()) as { ok?: boolean; chatId?: string };
      if (json.ok && json.chatId) {
        setTeamTitle("");
        await load();
      }
    } finally {
      setTeamBusy(false);
    }
  }

  useEffect(() => {
    if (!dmOpen || dmQuery.trim().length < 2) {
      setDmUsers([]);
      return;
    }
    const id = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/workspace/internal-chat/directory?q=${encodeURIComponent(dmQuery.trim())}`,
          { cache: "no-store" }
        );
        const json = (await res.json()) as { users?: Array<{ userId: string; label: string }> };
        setDmUsers(json.users ?? []);
      } catch {
        setDmUsers([]);
      }
    }, 200);
    return () => window.clearTimeout(id);
  }, [dmOpen, dmQuery]);

  async function startDm(otherUserId: string) {
    const res = await fetch("/api/workspace/internal-chat/chats/direct", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ otherUserId }),
    });
    const json = (await res.json()) as { ok?: boolean; chatId?: string };
    if (json.ok && json.chatId) {
      window.location.href = `/workspace/phone/chat/${json.chatId}`;
    }
  }

  function section(title: string, rows: ChatListItem[]) {
    if (rows.length === 0) return null;
    return (
      <div className="mt-6">
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">{title}</h2>
        <ul className="mt-2 space-y-1">
          {rows.map((c) => (
            <li key={c.id}>
              <Link
                href={`/workspace/phone/chat/${c.id}`}
                className={`flex flex-col rounded-xl border px-3 py-2.5 transition ${
                  c.hasUnread
                    ? "border-sky-200 bg-sky-50/80"
                    : "border-slate-200/80 bg-white hover:border-slate-300"
                }`}
              >
                <span className="text-sm font-semibold text-slate-900">{c.title}</span>
                {c.lastMessagePreview ? (
                  <span className="mt-0.5 line-clamp-2 text-xs text-slate-600">{c.lastMessagePreview}</span>
                ) : null}
                <span className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                  {c.notificationsMuted ? <span>Muted</span> : null}
                  {c.chatType === "patient" && c.patientId ? (
                    <span className="rounded bg-slate-100 px-1.5 py-0.5">Patient</span>
                  ) : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pt-2 sm:px-5">
      <div className="relative mt-2 shrink-0">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={searchQ}
          onChange={(e) => setSearchQ(e.target.value)}
          placeholder="Search chats and messages…"
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none ring-phone-border focus:ring-2"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
      {searchQ.trim().length >= 2 && searchHits ? (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 text-sm">
          {searching ? <p className="text-slate-500">Searching…</p> : null}
          {!searching && searchHits.chats.length === 0 && searchHits.messages.length === 0 ? (
            <p className="text-slate-500">No matches.</p>
          ) : null}
          {searchHits.chats.length > 0 ? (
            <ul className="space-y-2">
              {searchHits.chats.map((h) => (
                <li key={h.id}>
                  <Link href={`/workspace/phone/chat/${h.id}`} className="font-medium text-sky-800 underline-offset-2 hover:underline">
                    {h.title}
                  </Link>
                  <span className="ml-2 text-xs text-slate-500">{h.chatType}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {searchHits.messages.length > 0 ? (
            <ul className="mt-3 space-y-2 border-t border-slate-100 pt-3">
              {searchHits.messages.map((m) => (
                <li key={`${m.chatId}-${m.messageId}`}>
                  <Link
                    href={`/workspace/phone/chat/${m.chatId}`}
                    className="text-sky-800 underline-offset-2 hover:underline"
                  >
                    <span className="line-clamp-2 text-slate-800">{m.snippet}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setDmOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm"
        >
          <MessageCirclePlus className="h-4 w-4" />
          New message
        </button>
      </div>

      {showTeamAdmin ? (
        <form
          onSubmit={createTeamChannel}
          className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50/80 p-3"
        >
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
            <Users className="h-4 w-4" />
            Create team channel (role-based)
          </div>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              value={teamTitle}
              onChange={(e) => setTeamTitle(e.target.value)}
              placeholder="Channel name"
              className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            />
            <select
              value={teamRole}
              onChange={(e) => setTeamRole(e.target.value)}
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            >
              <option value="nurse">Nurses</option>
              <option value="manager">Managers</option>
              <option value="admin">Admins</option>
              <option value="billing">Billing</option>
              <option value="dispatch">Dispatch</option>
              <option value="credentialing">Credentialing</option>
              <option value="recruiter">Recruiters</option>
              <option value="don">DON</option>
            </select>
            <button
              type="submit"
              disabled={teamBusy || !teamTitle.trim()}
              className="rounded-lg bg-phone-navy px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {teamBusy ? "…" : "Create"}
            </button>
          </div>
        </form>
      ) : null}

      {loading ? <p className="mt-8 text-sm text-slate-500">Loading chats…</p> : null}

      {!loading && chats.length === 0 ? (
        <p className="mt-8 text-sm text-slate-600">No conversations yet.</p>
      ) : null}

      {section("Pinned", grouped.pinned)}
      {section("Organization", grouped.organization)}
      {section("Teams", grouped.teams)}
      {section("Patients", grouped.patients)}
      {section("Direct messages", grouped.direct)}

      </div>

      {dmOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="max-h-[80vh] w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <span className="font-semibold text-slate-900">Direct message</span>
              <button
                type="button"
                onClick={() => setDmOpen(false)}
                className="text-sm font-medium text-sky-700"
              >
                Close
              </button>
            </div>
            <div className="p-4">
              <input
                value={dmQuery}
                onChange={(e) => setDmQuery(e.target.value)}
                placeholder="Search teammate…"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
              <ul className="mt-3 max-h-64 space-y-1 overflow-y-auto">
                {dmUsers.map((u) => (
                  <li key={u.userId}>
                    <button
                      type="button"
                      onClick={() => void startDm(u.userId)}
                      className="w-full rounded-lg px-2 py-2 text-left text-sm hover:bg-slate-50"
                    >
                      {u.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
