import type { NextConfig } from "next";

/**
 * The browser only ever talks to this origin. `/api/*` is proxied server-side
 * to the Laravel API, so there is no CORS surface and the API location lives
 * in a single environment variable.
 */
const API_URL = process.env.API_URL ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/api/:path*` }];
  },
};

export default nextConfig;
