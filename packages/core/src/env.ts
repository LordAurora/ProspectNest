import { z } from 'zod';

const booleanFlag = z
  .enum(['true', 'false', '1', '0', ''])
  .optional()
  .transform((value) => value === 'true' || value === '1');

const optionalString = z
  .string()
  .optional()
  .transform((value) => (value && value.trim() !== '' ? value.trim() : undefined));

export const serverEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL gerekli'),
  APP_URL: z.url().default('http://localhost:3000'),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET en az 32 karakter olmalı'),
  CREDENTIAL_ENCRYPTION_KEY: optionalString,
  DEMO_MODE: booleanFlag,
  AI_MODE: z.enum(['disabled', 'local']).default('disabled'),
  OLLAMA_BASE_URL: z.url().default('http://127.0.0.1:11434'),
  OLLAMA_MODEL: optionalString,
  GOOGLE_APPLICATION_CREDENTIALS: optionalString,
  GOOGLE_SPREADSHEET_ID: optionalString,
  DISCOVERY_PROVIDER: z.string().default('none'),
  DISCOVERY_API_KEY: optionalString,
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(2),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

/** Parses process.env once. Throws with a readable list of problems. */
export function getServerEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  if (cached && source === process.env) return cached;
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Geçersiz ortam yapılandırması:\n${issues}`);
  }
  if (source === process.env) cached = result.data;
  return result.data;
}

export const workerEnvSchema = serverEnvSchema.pick({
  DATABASE_URL: true,
  WORKER_CONCURRENCY: true,
  AI_MODE: true,
  DEMO_MODE: true,
});

export type WorkerEnv = z.infer<typeof workerEnvSchema>;
