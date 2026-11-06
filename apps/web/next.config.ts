import path from 'node:path';
import type { NextConfig } from 'next';

const workspaceRoot = path.join(import.meta.dirname, '../..');

const config: NextConfig = {
  // The root .env is loaded by the package scripts (scripts/next.mjs); containers get real env vars.
  output: 'standalone',
  outputFileTracingRoot: workspaceRoot,
  transpilePackages: ['@prospectnest/core', '@prospectnest/db', '@prospectnest/providers'],
  serverExternalPackages: ['@node-rs/argon2', 'pg'],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default config;
