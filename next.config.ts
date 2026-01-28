import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  typescript: {
    // Ignore type errors during build for faster iteration
    ignoreBuildErrors: true,
  },
  // Enable instrumentation for startup logging
  experimental: {
    instrumentationHook: true,
  },
};

export default nextConfig;
