"use client";

type Props = {
  defaultQuery: string;
  className?: string;
};

/**
 * GET `/workspace/phone/calls?q=…` — same visual language as inbox search.
 */
export function CallsSearchBar({ defaultQuery, className = "" }: Props) {
  return (
    <form method="get" action="/workspace/phone/calls" className={`w-full min-[400px]:w-52 sm:w-60 ${className}`.trim()}>
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
