import type { TaskStatus } from '@/types/api';

/** Pure decision: given a task's current server-side status, return the
 *  target status a Focus start should transition it to, or null when no
 *  update is needed. Only Pending → InProgress; every other status is
 *  left untouched. null/undefined caller-supplied statuses never guess —
 *  the server-side getTask recheck remains authoritative. */
export function decideTaskTransition(currentStatus: TaskStatus): TaskStatus | null {
  if (currentStatus === 'Pending') return 'InProgress';
  return null;
}
