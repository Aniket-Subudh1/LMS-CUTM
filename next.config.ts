import type { NextConfig } from 'next';

const SECURITY_HEADERS = [
  {
    key: 'Content-Security-Policy',
    value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'",
  },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(self), microphone=(self), display-capture=(self), geolocation=(), payment=()',
  },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  output: 'standalone',
  // bullmq loads ioredis with a dynamic require that the bundler cannot follow.
  serverExternalPackages: ['bullmq', 'ioredis'],
  // CSV imports (06 §8: 5,000 rows) post the file inside the action request; files themselves never do (04 §3 S6).
  experimental: { serverActions: { bodySizeLimit: '2mb' } },
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
  headers: async () => [{ source: '/:path*', headers: SECURITY_HEADERS }],
};

export default nextConfig;
