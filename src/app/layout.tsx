import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { MobileSupabaseSessionBridge } from "@/app/workspace/MobileSupabaseSessionBridge";

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
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: ["/favicon.ico"],
  },
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
        {children}
      </body>
    </html>
  );
}
