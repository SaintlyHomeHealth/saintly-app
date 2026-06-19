import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  /* config options here */
  /**
   * Set CRM_LEADS_ID_DEBUG=1 in env when investigating lead-id issues (never hardcode in production).
   */
  env: {
    NEXT_PUBLIC_CRM_LEADS_ID_DEBUG: process.env.NEXT_PUBLIC_CRM_LEADS_ID_DEBUG ?? "",
  },
  experimental: {
    serverActions: {
      /** Default is 1 MB; credentialing PDF/image/bulk uploads need more headroom. */
      bodySizeLimit: "25mb",
    },
  },
  serverExternalPackages: [
    "pdf-parse",
    "pdfjs-dist",
    "unpdf",
    "mammoth",
    "word-extractor",
    "canvas",
    "@napi-rs/canvas",
    "tesseract.js",
  ],
  /**
   * pdf-parse / pdfjs-dist load `pdf.worker.mjs` via a runtime path that Next's
   * file tracer can't see, so it was missing from the Vercel lambda
   * ("Cannot find module .../pdfjs-dist/legacy/build/pdf.worker.mjs"). Force the
   * worker (and its sourcemap) into the serverless bundle for the parse routes.
   */
  outputFileTracingIncludes: {
    "/api/crm/patient-referrals/**": [
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      "./node_modules/pdfjs-dist/legacy/build/pdf.mjs",
    ],
  },
  allowedDevOrigins: ["hector-coud-karine.ngrok-free.dev"],
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    /** Marketing logos/photos use slightly higher quality than the default 75. */
    qualities: [75, 92, 94, 95],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
    ],
  },
};

export default withBundleAnalyzer(nextConfig);
