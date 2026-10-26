import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  transpilePackages: ['@new-cms/ui'],
   allowedDevOrigins: ['127.0.0.1'],
};

export default nextConfig;
