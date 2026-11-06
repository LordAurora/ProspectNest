import path from 'node:path';
import { loadEnvConfig } from '@next/env';
import type { NextConfig } from 'next';

const workspaceRoot = path.join(import.meta.dirname, '../..');

// One .env at the workspace root serves web, worker and the Prisma CLI.
loadEnvConfig(workspaceRoot);

const config: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: workspaceRoot,
  transpilePackages: ['@prospectnest/core', '@prospectnest/db'],
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
