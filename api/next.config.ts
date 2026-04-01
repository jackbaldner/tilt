import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Exclude native modules from serverless bundle — only used in local dev
  serverExternalPackages: ["better-sqlite3"],
  // Allow images from Google and other OAuth providers
  images: {
    remotePatterns: [
      { hostname: "lh3.googleusercontent.com" },
      { hostname: "avatars.githubusercontent.com" },
    ],
  },
  // CORS headers for mobile app
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET,POST,PUT,PATCH,DELETE,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization" },
        ],
      },
    ];
  },
};

export default nextConfig;
