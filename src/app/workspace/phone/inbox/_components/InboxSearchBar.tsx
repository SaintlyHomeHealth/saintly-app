"use client";

type Props = {
  defaultQuery: string;
  /** When set, search submits preserve the current thread selection. */
  selectedConversationId: string | null;
};

/**
 * GET form for `/workspace/phone/inbox` — keeps `selected` in sync when filtering the list.
 */
export function InboxSearchBar({ defaultQuery, selectedConversationId }: Props) {
  return (
    <form method="get" action="/workspace/phone/inbox" className="w-full min-[400px]:w-52 sm:w-60">
      {selectedConversationId ? <input type="hidden" name="selected" value={selectedConversationId} /> : null}
      <input
        name="q"
        defaultValue={defaultQuery}
        placeholder="Search name or number"
        className="w-full rounded-full border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm shadow-slate-200/50 outline-none ring-sky-200 transition focus:ring"
      />
    </form>
  );
}
