import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  distDir: process.env.CMS_ADMIN_E2E === '1' ? '.next-e2e' : '.next',
  poweredByHeader: false,
  transpilePackages: ['@new-cms/ui'],
  allowedDevOrigins: ['127.0.0.1', '192.168.110.207', '192.168.31.98'],
};

export default nextConfig;
