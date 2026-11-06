import type { Priority, RunStatus } from '@prospectnest/core';
import type { Tone } from '@/components/ui/badge';

export const runStatusTone: Record<RunStatus, Tone> = {
  queued: 'neutral',
  running: 'accent',
  partial: 'warning',
  completed: 'success',
  failed: 'danger',
  cancelled: 'neutral',
};

export const priorityTone: Record<Priority, Tone> = {
  high: 'accent',
  medium: 'neutral',
  low: 'neutral',
  not_evaluated: 'warning',
};
