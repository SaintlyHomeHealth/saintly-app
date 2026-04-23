/**
 * Assertions for staff sign-in URL helpers (no Jest/Vitest in repo).
 * Run: npx tsx scripts/verify-staff-sign-in-url.mts
 */

import assert from "node:assert/strict";

import {
  canonicalAppOriginForStaffCommsFromEnv,
  STAFF_SIGN_IN_PATH,
  staffCommsUsesExplicitAppUrl,
  staffSignInPageUrlFromEnv,
  type StaffCommsEnv,
} from "../src/lib/auth/staff-sign-in-url-build";

function testExplicitAppUrlWinsOverVercel() {
  const env: StaffCommsEnv = {
    NEXT_PUBLIC_APP_URL: "https://app.example.com",
    VERCEL_URL: "my-app-git-main-x.vercel.app",
    VERCEL_PROJECT_PRODUCTION_URL: "wrong.example.com",
  };
  assert.equal(canonicalAppOriginForStaffCommsFromEnv(env, "production"), "https://app.example.com");
  assert.equal(staffSignInPageUrlFromEnv(env, "production"), "https://app.example.com/admin/login");
  assert.equal(staffCommsUsesExplicitAppUrl(env), true);
}

function testPathIsAlwaysAdminLoginNotBareLogin() {
  const env: StaffCommsEnv = { NEXT_PUBLIC_APP_URL: "https://app.example.com" };
  const url = staffSignInPageUrlFromEnv(env, "production");
  assert.ok(url.endsWith("/admin/login"), `expected /admin/login, got ${url}`);
  assert.ok(!url.endsWith("/login"), "must not end with bare /login only");
  assert.equal(STAFF_SIGN_IN_PATH, "/admin/login");
}

function testDevelopmentDefault() {
  const env: StaffCommsEnv = {};
  assert.equal(canonicalAppOriginForStaffCommsFromEnv(env, "development"), "http://localhost:3000");
  assert.equal(
    staffSignInPageUrlFromEnv(env, "development"),
    "http://localhost:3000/admin/login"
  );
}

function testProductionFallsBackToVercelProductionUrlBeforePreview() {
  const env: StaffCommsEnv = {
    VERCEL_PROJECT_PRODUCTION_URL: "myapp.vercel.app",
    VERCEL_URL: "myapp-abc123.vercel.app",
  };
  const origin = canonicalAppOriginForStaffCommsFromEnv(env, "production");
  assert.equal(origin, "https://myapp.vercel.app");
  assert.ok(staffSignInPageUrlFromEnv(env, "production").startsWith("https://myapp.vercel.app/admin/login"));
}

function testProductionOnlyVercelUrl() {
  const env: StaffCommsEnv = { VERCEL_URL: "preview-xyz.vercel.app" };
  assert.equal(
    canonicalAppOriginForStaffCommsFromEnv(env, "production"),
    "https://preview-xyz.vercel.app"
  );
}

function testRedirectToShapeMatchesCreateLogin() {
  const env: StaffCommsEnv = { NEXT_PUBLIC_APP_URL: "https://app.example.com" };
  const origin = canonicalAppOriginForStaffCommsFromEnv(env, "production");
  const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent("/workspace/phone/keypad")}`;
  assert.ok(redirectTo.startsWith("https://app.example.com/auth/callback"));
  assert.ok(redirectTo.includes("next="));
}

/** Mirrors `src/app/admin/login/page.tsx` redirect target when `?next=` is present. */
function testAdminLoginRedirectPreservesNext() {
  const nextStr = "/workspace/phone/keypad";
  const q = new URLSearchParams();
  if (nextStr) q.set("next", nextStr);
  const target = q.toString() ? `/login?${q.toString()}` : "/login";
  assert.equal(target, "/login?next=%2Fworkspace%2Fphone%2Fkeypad");
}

testExplicitAppUrlWinsOverVercel();
testPathIsAlwaysAdminLoginNotBareLogin();
testDevelopmentDefault();
testProductionFallsBackToVercelProductionUrlBeforePreview();
testProductionOnlyVercelUrl();
testRedirectToShapeMatchesCreateLogin();
testAdminLoginRedirectPreservesNext();

console.log("verify-staff-sign-in-url: all checks passed.");
