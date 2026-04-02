import Link from "next/link";

const pill =
  "inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200/90 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm shadow-slate-200/40 transition hover:border-sky-200 hover:bg-sky-50/80 hover:text-sky-950 active:scale-[0.99]";

/**
 * Compact shortcuts for the Today home — keeps the screen scannable without duplicating the bottom nav.
 */
export function WorkspacePhoneQuickActions() {
  return (
    <nav className="flex flex-wrap gap-2" aria-label="Quick actions">
      <Link href="/workspace/phone/keypad" className={pill}>
        Keypad
      </Link>
      <Link href="/workspace/phone/inbox" className={pill}>
        Inbox
      </Link>
      <Link href="/workspace/phone/voicemail" className={pill}>
        Voicemail
      </Link>
      <Link href="/workspace/phone/calls" className={pill}>
        Calls
      </Link>
    </nav>
  );
}
