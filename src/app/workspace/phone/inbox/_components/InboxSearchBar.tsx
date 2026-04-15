"use client";

type Props = {
  defaultQuery: string;
  /** Keeps desktop split-pane selection when filtering (optional `thread` query). */
  preserveThreadId?: string;
};

/**
 * GET form for `/workspace/phone/inbox` — filters the conversation list.
 */
export function InboxSearchBar({ defaultQuery, preserveThreadId }: Props) {
  return (
    <form method="get" action="/workspace/phone/inbox" className="w-full min-[400px]:w-52 sm:w-60">
      {preserveThreadId ? <input type="hidden" name="thread" value={preserveThreadId} /> : null}
      <input
        name="q"
        defaultValue={defaultQuery}
        placeholder="Search name or number"
        className="ws-phone-input w-full rounded-full px-3 py-2 text-sm shadow-sm shadow-sky-950/5 ring-offset-0"
      />
    </form>
  );
}
