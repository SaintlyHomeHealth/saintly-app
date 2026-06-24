import Link from "next/link";

import {
  EMAIL_MARKETING_TABS,
  emailMarketingTabLinkCls,
  type EmailMarketingTab,
} from "@/lib/email-marketing/email-marketing-tabs";

type Props = {
  activeTab: EmailMarketingTab;
  isAdmin: boolean;
};

/** Server-rendered tab bar — always visible (not blocked by client Suspense). */
export function EmailMarketingTabNav({ activeTab, isAdmin }: Props) {
  const tabs = EMAIL_MARKETING_TABS.filter((t) => (t.id === "settings" ? isAdmin : true));

  return (
    <nav aria-label="Email & Marketing sections" className="flex flex-wrap gap-2">
      {tabs.map((t) => {
        const active = t.id === activeTab;
        return (
          <Link
            key={t.id}
            href={`/admin/email-marketing?tab=${t.id}`}
            scroll={false}
            className={`${emailMarketingTabLinkCls.base} ${active ? emailMarketingTabLinkCls.active : emailMarketingTabLinkCls.idle}`}
            aria-current={active ? "page" : undefined}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
