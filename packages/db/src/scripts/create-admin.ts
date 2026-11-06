/**
 * Creates or resets the single administrator account.
 *
 *   pnpm admin:create --email you@example.com
 *
 * The password is read from ADMIN_PASSWORD or prompted on the terminal so it
 * never ends up in shell history.
 */
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { parseArgs } from 'node:util';
import { config } from 'dotenv';
import { z } from 'zod';
import { getDb } from '../client';
import { MIN_PASSWORD_LENGTH, hashPassword } from '../password';

config({ path: path.resolve(import.meta.dirname, '../../../../.env'), quiet: true });

/** Reads a password without echoing it back to the terminal. */
async function promptPassword(): Promise<string> {
  const prompt = 'Parola: ';
  const output = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      // Let the prompt itself through, swallow everything typed after it.
      if (chunk.toString() === prompt) process.stdout.write(chunk);
      callback();
    },
  });
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  try {
    return await rl.question(prompt);
  } finally {
    rl.close();
    process.stdout.write('\n');
  }
}

async function main() {
  const { values } = parseArgs({
    // pnpm forwards a literal "--" separator when users type one.
    args: process.argv.slice(2).filter((arg) => arg !== '--'),
    options: { email: { type: 'string' }, name: { type: 'string' } },
  });
  const email = z.email('Geçerli bir e-posta girin').parse(values.email ?? process.env.ADMIN_EMAIL);
  const password = process.env.ADMIN_PASSWORD ?? (await promptPassword());
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Parola en az ${MIN_PASSWORD_LENGTH} karakter olmalı`);
  }

  const db = getDb();
  const existing = await db.user.findFirst({ select: { id: true, email: true } });
  if (existing && existing.email !== email.toLowerCase()) {
    throw new Error(`Zaten bir yönetici var (${existing.email}). Tek yönetici desteklenir.`);
  }

  const passwordHash = await hashPassword(password);
  const user = await db.user.upsert({
    where: { email: email.toLowerCase() },
    create: { email: email.toLowerCase(), name: values.name ?? null, passwordHash },
    update: { passwordHash, ...(values.name ? { name: values.name } : {}) },
  });
  // Password change invalidates every existing session.
  await db.session.deleteMany({ where: { userId: user.id } });
  await db.auditEvent.create({ data: { action: existing ? 'auth.password_reset' : 'auth.admin_created', actorId: user.id } });
  console.log(`Yönetici hazır: ${user.email}`);
  await db.$disconnect();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
