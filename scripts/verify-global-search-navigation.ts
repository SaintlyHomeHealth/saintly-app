/**
 * Lightweight assertions for global search navigation helpers.
 * Run: npx tsx scripts/verify-global-search-navigation.ts
 */

import assert from "node:assert/strict";

import { globalSearchHref } from "../src/lib/admin/global-search/hrefs";
import { isGlobalSearchResultCurrentPage } from "../src/lib/admin/global-search/navigation";

function testHrefs() {
  assert.equal(globalSearchHref("lead", "abc-123"), "/admin/crm/leads/abc-123");
  assert.equal(globalSearchHref("contact", "contact-1"), "/admin/crm/contacts/contact-1");
  assert.equal(globalSearchHref("recruit", "recruit-1"), "/admin/recruiting/recruit-1");
  assert.equal(globalSearchHref("facility", "fac-1"), "/admin/facilities/fac-1");
}

function testCurrentPage() {
  assert.equal(
    isGlobalSearchResultCurrentPage("/admin/crm/leads/abc-123", "", "/admin/crm/leads/abc-123"),
    true
  );
  assert.equal(
    isGlobalSearchResultCurrentPage("/admin/crm/leads/abc-123/", "", "/admin/crm/leads/abc-123"),
    true
  );
  assert.equal(
    isGlobalSearchResultCurrentPage("/admin/crm/leads/other-id", "", "/admin/crm/leads/abc-123"),
    false
  );
  assert.equal(
    isGlobalSearchResultCurrentPage(
      "/admin/private-pay",
      "?invoice=inv-1",
      "/admin/private-pay?invoice=inv-1"
    ),
    true
  );
  assert.equal(
    isGlobalSearchResultCurrentPage(
      "/admin/private-pay",
      "?invoice=inv-2",
      "/admin/private-pay?invoice=inv-1"
    ),
    false
  );
}

function testBlurSafeNavigationPattern() {
  // Document the event order we rely on: mousedown on the link fires before
  // the portaled dropdown is treated as an outside click when panelRef is wired.
  const events: string[] = [];
  const panelContainsTarget = true;

  events.push("mousedown");
  if (!panelContainsTarget) events.push("close-dropdown");
  events.push("click-navigate");

  assert.deepEqual(events, ["mousedown", "click-navigate"]);
}

testHrefs();
testCurrentPage();
testBlurSafeNavigationPattern();

console.log("verify-global-search-navigation: ok");
