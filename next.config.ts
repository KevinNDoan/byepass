import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Avoid bundling Chromium; keep Puppeteer external on the server
    serverComponentsExternalPackages: ["puppeteer"],
  },
};

export default nextConfig;
