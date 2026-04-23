import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    serverActions: {
      /** Default is 1 MB; credentialing PDF/image/bulk uploads need more headroom. */
      bodySizeLimit: "25mb",
    },
  },
  serverExternalPackages: [
    "pdf-parse",
    "pdfjs-dist",
    "mammoth",
    "word-extractor",
    "canvas",
    "@napi-rs/canvas",
    "tesseract.js",
  ],
  allowedDevOrigins: ["hector-coud-karine.ngrok-free.dev"],
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
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
