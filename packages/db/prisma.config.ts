import path from 'node:path';
import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

// Root .env is shared by web, worker and the Prisma CLI.
config({ path: path.resolve(import.meta.dirname, '../../.env'), quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // `prisma generate` does not connect, so it must work without a configured database.
  datasource: { url: process.env.DATABASE_URL ?? '' },
});
