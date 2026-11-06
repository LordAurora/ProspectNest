import type { Priority, RunItemStatus, RunStatus } from '@prospectnest/core';
import type { Tone } from '@/components/ui/badge';

export const runStatusTone: Record<RunStatus, Tone> = {
  queued: 'neutral',
  running: 'accent',
  partial: 'warning',
  completed: 'success',
  failed: 'danger',
  cancelled: 'neutral',
};

export const runItemStatusTone: Record<RunItemStatus, Tone> = {
  pending: 'neutral',
  running: 'accent',
  done: 'success',
  failed: 'danger',
  skipped: 'neutral',
  blocked: 'warning',
};

export const isActiveRun = (status: RunStatus) => status === 'queued' || status === 'running';

export const priorityTone: Record<Priority, Tone> = {
  high: 'accent',
  medium: 'neutral',
  low: 'neutral',
  not_evaluated: 'warning',
};
