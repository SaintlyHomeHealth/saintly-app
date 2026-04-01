import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  allowedDevOrigins: ["hector-coud-karine.ngrok-free.dev"],
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
