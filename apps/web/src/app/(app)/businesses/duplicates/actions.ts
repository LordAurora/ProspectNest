'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { keepSeparate, mergeDuplicate, MergeError } from '@prospectnest/db';
import { requireUser } from '@/lib/auth/session';
import { db } from '@/lib/db';

export type DuplicateActionState = { error?: string };

export async function resolveDuplicate(duplicateId: string, decision: 'merge' | 'separate'): Promise<DuplicateActionState> {
  const user = await requireUser();
  const id = z.uuid().parse(duplicateId);
  try {
    if (decision === 'merge') await mergeDuplicate(db(), id);
    else await keepSeparate(db(), id);
  } catch (error) {
    if (error instanceof MergeError) return { error: error.message };
    throw error;
  }
  await db().auditEvent.create({ data: { action: `business.duplicate_${decision}`, actorId: user.id, subject: id } });
  revalidatePath('/businesses');
  revalidatePath('/businesses/duplicates');
  return {};
}
