import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: [],
  experimental: {
    proxyTimeout: 120_000,
  },
};

export default nextConfig;
