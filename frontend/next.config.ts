import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  devIndicators: false,
  typescript: {
    ignoreBuildErrors: false,
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
