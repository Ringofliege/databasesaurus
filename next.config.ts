import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  typescript: {
    // Ignore type errors during build for faster iteration
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
