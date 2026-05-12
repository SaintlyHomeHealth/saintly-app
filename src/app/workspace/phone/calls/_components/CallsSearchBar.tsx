"use client";

type Props = {
  defaultQuery: string;
  /** Preserve non-default list filter when searching. */
  filter?: "all" | "missed" | "me";
  className?: string;
};

/**
 * GET `/workspace/phone/calls?q=…` — same visual language as inbox search.
 */
export function CallsSearchBar({ defaultQuery, filter = "all", className = "" }: Props) {
  return (
    <form method="get" action="/workspace/phone/calls" className={`w-full min-[400px]:w-52 sm:w-60 ${className}`.trim()}>
      {filter !== "all" ? <input type="hidden" name="filter" value={filter} /> : null}
      <input
        name="q"
        defaultValue={defaultQuery}
        placeholder="Search name or number"
        autoComplete="off"
        className="ws-phone-input w-full rounded-full px-3 py-2 text-sm shadow-sm shadow-sky-950/5 ring-offset-0"
      />
    </form>
  );
}
