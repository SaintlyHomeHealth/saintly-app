import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";

import { MobileSupabaseSessionBridge } from "@/app/workspace/MobileSupabaseSessionBridge";
import { ClientDevPerfMonitor } from "@/components/perf/ClientDevPerfMonitor";
import { RoutePerfClientLogger } from "@/components/perf/RoutePerfClientLogger";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/** Resolve public site origin for metadata only (OG URLs, etc.). Production keeps the marketing fallback when unset. */
function metadataSiteOrigin(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (process.env.NODE_ENV === "development") {
    return "http://localhost:3000";
  }
  return "https://www.saintlyhomehealth.com";
}

export const metadata: Metadata = {
  /** Same build serves www + app subdomains; set per deploy for absolute OG URLs. */
  metadataBase: new URL(metadataSiteOrigin()),
  title: {
    default: "Saintly Home Health",
    template: "%s · Saintly Home Health",
  },
  description: "Premium Home Health Care",
  applicationName: "Saintly Home Health",
  manifest: "/site.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Saintly Home Health",
  },
  /**
   * Browser-tab icons are picked up automatically from `src/app/{icon,apple-icon,favicon.ico}`.
   * Next.js emits the proper <link rel="icon"> tags with content-hash URLs, so any change to
   * those files breaks browser cache without us needing to bump query params.
   */
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  /** Matches PWA manifest theme_color */
  themeColor: "#0B5FFF",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {/**
         * Posts Supabase JWT to the Saintly native shell on any route (login, admin, workspace) so RN can
         * call GET /api/softphone/token with Authorization: Bearer without waiting for /workspace/* to mount.
         */}
        <MobileSupabaseSessionBridge />
        <Suspense fallback={null}>
          <RoutePerfClientLogger />
          <ClientDevPerfMonitor />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
