/**
 * Quick assertions for workspace outbound dial parsing.
 * Run: npm run verify:outbound-parse
 */
import { parseWorkspaceOutboundDialInput } from "../src/lib/softphone/phone-number.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

const mustOk: Array<[string, string]> = [
  ["(262) 366-1970", "+12623661970"],
  ["2623661970", "+12623661970"],
  ["+12623661970", "+12623661970"],
  ["4803600008", "+14803600008"],
  ["+14803600008", "+14803600008"],
  /** 202-555-1234 is allowed here (we only hard-block 555-01XX subscriber ranges). */
  ["12025551234", "+12025551234"],
];

const mustFail = ["555", "123", "2025550100", "12025550100", "2025550199", "5550100", "5550101"];

for (const [input, e164] of mustOk) {
  const r = parseWorkspaceOutboundDialInput(input);
  assert(r.ok === true && r.e164 === e164, `expected ok ${e164} for ${JSON.stringify(input)} got ${JSON.stringify(r)}`);
}

for (const input of mustFail) {
  const r = parseWorkspaceOutboundDialInput(input);
  assert(r.ok === false, `expected fail for ${JSON.stringify(input)} got ${JSON.stringify(r)}`);
}

console.log("verify-workspace-outbound-parse: OK");
