import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  /** Same build serves www + app subdomains; set per deploy for absolute OG URLs. */
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.saintlyhomehealth.com"),
  title: {
    default: "Saintly Home Health",
    template: "%s · Saintly Home Health",
  },
  description: "Home Health Services",
  applicationName: "Saintly Home Health",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Saintly Home Health",
  },
  /**
   * Icons: also provided via file convention in /src/app/
   * (favicon.ico, icon.png, apple-icon.png) so browsers + PWAs get the Saintly mark.
   */
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.png", sizes: "512x512", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  /** Matches PWA / app icon field (Saintly blue) */
  themeColor: "#0284c7",
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
        {children}
      </body>
    </html>
  );
}
