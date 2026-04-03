import type { NextConfig } from "next";

const devDomain = process.env.REPLIT_DEV_DOMAIN;

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "yt3.ggpht.com" },
      { protocol: "https", hostname: "yt3.googleusercontent.com" },
      { protocol: "https", hostname: "i.ytimg.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
  allowedDevOrigins: [
    "*.worf.replit.dev",
    "*.replit.dev",
    "*.repl.co",
    ...(devDomain ? [devDomain] : []),
  ],
  async redirects() {
    return [
      { source: "/member/campaigns", destination: "/member/generate-leads?section=campaigns", permanent: false },
      { source: "/member/analytics", destination: "/member/generate-leads?section=analytics", permanent: false },
      { source: "/member/link-tracking", destination: "/member/settings", permanent: false },
    ];
  },
  async rewrites() {
    return [
      { source: "/t.js", destination: "/api/t.js" },
      { source: "/api/calendar/:token.ics", destination: "/api/calendar/:token" },
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
