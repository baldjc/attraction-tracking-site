import type { NextConfig } from "next";

const devDomain = process.env.REPLIT_DEV_DOMAIN;

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "*.worf.replit.dev",
    "*.replit.dev",
    "*.repl.co",
    ...(devDomain ? [devDomain] : []),
  ],
  async rewrites() {
    return [
      { source: "/t.js", destination: "/api/t.js" },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "ALLOWALL" },
        ],
      },
      {
        source: "/t.js",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Content-Type", value: "application/javascript" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
