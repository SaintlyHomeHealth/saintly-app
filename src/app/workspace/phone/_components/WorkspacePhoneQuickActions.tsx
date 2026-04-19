import Link from "next/link";

const pill =
  "inline-flex min-h-9 flex-1 items-center justify-center rounded-xl border border-sky-100/90 bg-white px-3 py-2 text-[13px] font-semibold text-phone-ink shadow-sm shadow-sky-950/5 transition hover:border-sky-200 hover:bg-phone-ice hover:text-phone-navy active:scale-[0.99] sm:min-h-11 sm:flex-none sm:rounded-2xl sm:px-4 sm:py-2.5 sm:text-sm";

/**
 * Compact shortcuts for the Visits home — keeps the screen scannable without duplicating the bottom nav.
 */
export function WorkspacePhoneQuickActions() {
  return (
    <nav className="grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap sm:gap-2" aria-label="Quick actions">
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
