import type { NextConfig } from 'next';

const outputDirectories: Readonly<Record<string, string>> = {
  '1': '.next-e2e',
  suite: '.next-e2e-suite',
};

const nextConfig: NextConfig = {
  distDir: outputDirectories[process.env.CMS_ADMIN_E2E ?? ''] ?? '.next',
  poweredByHeader: false,
  headers() {
    return ['/authorize', '/login', '/dashboard/account/credentials'].map((source) => ({
      source,
      headers: [
        { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
        { key: 'X-Frame-Options', value: 'DENY' },
      ],
    }));
  },
  transpilePackages: ['@new-cms/ui'],
  outputFileTracingIncludes: {
    '/api/admin/collections/*/og': [
      './src/assets/admin-og/noto-sans-sc.ttf',
      './.generated/og-worker.mjs',
      './node_modules/next/og.js',
      './node_modules/next/dist/server/og/**',
      './node_modules/next/dist/compiled/@vercel/og/**',
      './node_modules/react/**',
    ],
  },
  allowedDevOrigins: ['127.0.0.1', '192.168.110.207', '192.168.31.98'],
};

export default nextConfig;
