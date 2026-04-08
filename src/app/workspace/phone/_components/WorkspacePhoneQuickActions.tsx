import Link from "next/link";

const pill =
  "inline-flex min-h-11 items-center justify-center rounded-2xl border border-sky-100/90 bg-white px-4 py-2.5 text-sm font-semibold text-phone-ink shadow-sm shadow-sky-950/5 transition hover:border-sky-200 hover:bg-phone-ice hover:text-phone-navy active:scale-[0.99]";

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
