import type { NextConfig } from "next";

// Parse allowed dev origins from environment variable
const allowedDevOrigins = process.env.ALLOWED_DEV_ORIGINS
  ? process.env.ALLOWED_DEV_ORIGINS.split(',').map(origin => origin.trim())
  : [];

const nextConfig: NextConfig = {
  /* config options here */

  // Allowed origins for cross-origin requests in development
  allowedDevOrigins,

  // Enable standalone output for Docker builds
  output: 'standalone',

  // HYDRATION DIAGNOSTICS: Enable React strict mode and detailed error reporting
  reactStrictMode: true,

  // Remove console logs in production (keep warn/error for monitoring)
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production'
      ? { exclude: ['error', 'warn'] }
      : false,
  },

  // Proxy configuration to replace middleware
  async rewrites() {
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

    return [
      {
        source: "/api/v1/:path*",
        destination: `${backendUrl}/api/v1/:path*`,
      },
    ];
  },

  // Headers for CORS and security
  async headers() {
    // SECURITY: Never fall back to "*" for CORS origin
    // If NEXT_PUBLIC_FRONTEND_URL is not set, restrict to same-origin only
    const corsOrigin = process.env.NEXT_PUBLIC_FRONTEND_URL || "";

    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Credentials", value: "true" },
          // Only set Access-Control-Allow-Origin if explicitly configured
          // Empty string or missing env var means no CORS (same-origin only)
          ...(corsOrigin ? [{
            key: "Access-Control-Allow-Origin",
            value: corsOrigin,
          }] : []),
          {
            key: "Access-Control-Allow-Methods",
            value: "GET,DELETE,PATCH,POST,PUT,OPTIONS",
          },
          {
            key: "Access-Control-Allow-Headers",
            value:
              "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
