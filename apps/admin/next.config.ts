import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  transpilePackages: ['@new-cms/ui'],
  allowedDevOrigins: ['127.0.0.1', '192.168.110.207'],
};

export default nextConfig;
