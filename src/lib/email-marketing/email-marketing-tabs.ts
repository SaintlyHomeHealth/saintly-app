export type EmailMarketingTab =
  | "inbox"
  | "composer"
  | "templates"
  | "flyers"
  | "history"
  | "settings";

export const EMAIL_MARKETING_TABS: { id: EmailMarketingTab; label: string }[] = [
  { id: "inbox", label: "Inbox" },
  { id: "composer", label: "Composer" },
  { id: "templates", label: "Templates" },
  { id: "flyers", label: "Flyers" },
  { id: "history", label: "Sent / Drafts" },
  { id: "settings", label: "Settings" },
];

export function parseEmailMarketingTab(raw: string | undefined): EmailMarketingTab {
  if (raw && EMAIL_MARKETING_TABS.some((t) => t.id === raw)) {
    return raw as EmailMarketingTab;
  }
  return "inbox";
}

export const emailMarketingTabLinkCls = {
  base: "inline-flex items-center rounded-[20px] border px-4 py-2 text-sm font-semibold transition",
  active: "border-sky-300 bg-sky-50 text-sky-900 shadow-sm",
  idle: "border-slate-200 bg-white text-slate-600 hover:border-sky-200 hover:bg-sky-50/40",
} as const;
