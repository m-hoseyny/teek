import type { NextConfig } from "next";

// Allow the external hostname (e.g. teek.studio) when running behind a reverse
// proxy in development. Without this, Next.js 16 dev mode blocks cross-origin
// requests from the proxied host, which breaks cookie handling for auth.
const allowedDevOrigins: string[] = [];
if (process.env.APP_HOST) {
  allowedDevOrigins.push(process.env.APP_HOST);
}

// Internal URL for the backend service (reachable from the Next.js server).
// In Docker: http://backend:8000. Locally: http://localhost:8000.
const backendInternalUrl = process.env.BACKEND_INTERNAL_URL || "http://backend:8000";

const nextConfig: NextConfig = {
  output: 'standalone',
  devIndicators: false,
  allowedDevOrigins,
  typescript: {
    ignoreBuildErrors: false,
  },
  async rewrites() {
    return [
      {
        source: '/api/backend/:path*',
        destination: `${backendInternalUrl}/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/jassub-worker.js',
        headers: [{ key: 'Content-Type', value: 'application/javascript' }],
      },
      {
        source: '/jassub-worker.wasm',
        headers: [{ key: 'Content-Type', value: 'application/wasm' }],
      },
    ];
  },
};

export default nextConfig;
