import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { Task } from '@/types/api';

export const TASK_DEADLINE_NOTIFICATION_TYPE = 'task_deadline';
export const TASK_DEADLINE_CHANNEL_ID = 'task-deadlines';

/** Checkpoint 6A frozen contract: fires exactly 1 hour before a task's
 * deadline, only for tasks whose deadline falls within the next 72 hours
 * (reuses the same window backend.app.services.task.DUE_SOON_WINDOW
 * already uses for "due soon" everywhere else) — bounds the scheduled
 * count well under iOS's ~64-pending-local-notification ceiling. Neither
 * number is user-configurable yet (notification_preferences UI is a
 * later, Should-scope item). */
const DEADLINE_LEAD_MS = 60 * 60 * 1000;
const DEADLINE_ELIGIBILITY_WINDOW_MS = 72 * 60 * 60 * 1000;

/** Payload contract (Checkpoint 6A, locked): exactly these three fields —
 * mirrors FocusBreakNotificationData's "nothing that could leak private
 * content" rule. Deliberately excludes `title`: the visible notification
 * body below is generated from the task at schedule time, not read back
 * from this payload at tap time. */
export interface TaskDeadlineNotificationData {
  type: typeof TASK_DEADLINE_NOTIFICATION_TYPE;
  task_id: string;
  deadline: string;
  [key: string]: unknown;
}

export function isTaskDeadlineNotificationData(data: unknown): data is TaskDeadlineNotificationData {
  if (typeof data !== 'object' || data === null) return false;
  const candidate = data as Record<string, unknown>;
  return (
    candidate.type === TASK_DEADLINE_NOTIFICATION_TYPE &&
    typeof candidate.task_id === 'string' &&
    typeof candidate.deadline === 'string'
  );
}

function identifierForTask(taskId: string): string {
  return `task-deadline:${taskId}`;
}

/** Collision-safe: JSON.stringify of a fixed-order tuple, not delimiter
 * concatenation (a title containing the delimiter could otherwise collide
 * with a different task/deadline/title combination). Includes `title`
 * (unlike the OS payload) so a title-only edit is detected as a change
 * and replaces the stale scheduled notification, even though the OS
 * schedule itself never stores the title anywhere. */
function signatureForTask(task: Task): string {
  return JSON.stringify([task.id, task.deadline, task.title]);
}

interface DesiredEntry {
  signature: string;
  taskId: string;
  deadline: string;
  title: string;
  triggerAt: Date;
}

/** Pure computation, no OS calls. `tasks` must already be the caller's
 * Pending/InProgress set (GET /tasks/today's `pending`, which is the
 * complete unbounded active-task list — never GET /tasks, whose default
 * page size of 20 would silently under-schedule). Defensively re-checks
 * status anyway (defense in depth, matching this codebase's existing
 * pattern of not trusting a single filtering layer). */
function computeDesiredSchedules(tasks: Task[], now: number): Map<string, DesiredEntry> {
  const desired = new Map<string, DesiredEntry>();
  for (const task of tasks) {
    if (task.status !== 'Pending' && task.status !== 'InProgress') continue;
    const deadlineMs = new Date(task.deadline).getTime();
    if (Number.isNaN(deadlineMs)) continue;
    if (deadlineMs - now > DEADLINE_ELIGIBILITY_WINDOW_MS) continue; // outside the 72h window
    const triggerMs = deadlineMs - DEADLINE_LEAD_MS;
    if (triggerMs <= now) continue; // trigger must be strictly in the future (also excludes overdue tasks)
    desired.set(identifierForTask(task.id), {
      signature: signatureForTask(task),
      taskId: task.id,
      deadline: task.deadline,
      title: task.title,
      triggerAt: new Date(triggerMs),
    });
  }
  return desired;
}

let channelEnsured = false;

/** Android requires a channel to exist before a notification can be
 * scheduled against it. Independent of (and never required before) the
 * shared OS permission prompt — `requestNotificationPermission` in
 * schedule-break-notification.ts already guarantees at least one channel
 * exists for that prompt; this ensures the task-deadlines channel
 * specifically, opportunistically, before this feature's first real
 * schedule call. No-op on iOS. Cheap to call repeatedly, but guarded so a
 * no-op apply pass never repeats the OS call. */
async function ensureTaskDeadlineChannel(): Promise<void> {
  if (Platform.OS !== 'android' || channelEnsured) return;
  await Notifications.setNotificationChannelAsync(TASK_DEADLINE_CHANNEL_ID, {
    name: 'Task deadline reminders',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'default',
  });
  channelEnsured = true;
}

// Same dependency-free FIFO promise-chain mutex as
// schedule-break-notification.ts, and for the same reason: enumerate/
// cancel/schedule OS calls must never overlap across two concurrent
// reconcile passes.
let opQueue: Promise<void> = Promise.resolve();

function enqueueOp<T>(fn: () => Promise<T>): Promise<T> {
  const run = opQueue.then(fn, fn);
  opQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

/** Diffs a SET of desired schedules against OS reality (generalizing the
 * single-signature diff in schedule-break-notification.ts's
 * applySchedule to many tasks at once). Only ever enumerates/cancels
 * notifications whose data payload is a TaskDeadlineNotificationData —
 * a Focus-break or any other app's notification is never touched.
 *
 * The OS payload never carries `title` (locked contract), so a currently
 * -scheduled request cannot reveal its own applied signature by itself;
 * `previouslyApplied` (this process's own cache of what it last
 * successfully applied, keyed by identifier) is the source of truth for
 * "is this already correct," cross-checked against which identifiers the
 * OS actually still has scheduled (in case reality diverged from the
 * cache, e.g. a notification already fired). Returns the newly-applied
 * cache — the caller only commits it after this resolves successfully. */
async function applySchedule(
  desired: Map<string, DesiredEntry>,
  previouslyApplied: Map<string, string>
): Promise<Map<string, string>> {
  await ensureTaskDeadlineChannel();

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const deadlineIdentifiers = new Set(
    scheduled
      .filter((request) => isTaskDeadlineNotificationData(request.content.data))
      .map((request) => request.identifier)
  );

  for (const identifier of deadlineIdentifiers) {
    if (!desired.has(identifier)) {
      await Notifications.cancelScheduledNotificationAsync(identifier);
    }
  }

  const nextApplied = new Map<string, string>();

  for (const [identifier, entry] of desired) {
    const alreadyCorrect =
      deadlineIdentifiers.has(identifier) && previouslyApplied.get(identifier) === entry.signature;
    if (alreadyCorrect) {
      nextApplied.set(identifier, entry.signature);
      continue;
    }

    if (deadlineIdentifiers.has(identifier)) {
      await Notifications.cancelScheduledNotificationAsync(identifier);
    }

    const data: TaskDeadlineNotificationData = {
      type: TASK_DEADLINE_NOTIFICATION_TYPE,
      task_id: entry.taskId,
      deadline: entry.deadline,
    };
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title: 'Deadline approaching',
        body: `${entry.title} is due in 1 hour.`,
        sound: 'default',
        data,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: entry.triggerAt,
        ...(Platform.OS === 'android' ? { channelId: TASK_DEADLINE_CHANNEL_ID } : {}),
      },
    });
    nextApplied.set(identifier, entry.signature);
  }

  return nextApplied;
}

function signatureMapsEqual(a: Map<string, string>, b: Map<string, string>): boolean {
  if (a.size !== b.size) return false;
  for (const [identifier, signature] of a) {
    if (b.get(identifier) !== signature) return false;
  }
  return true;
}

// `undefined` = never synced in this process (always triggers a real
// enumeration on first call, restart-safety included) — same sentinel
// convention as schedule-break-notification.ts's lastAppliedSignature.
// Written ONLY after applySchedule succeeds.
let lastAppliedSignatures: Map<string, string> | undefined;

export function resetDeadlineNotificationScheduleCache(): void {
  lastAppliedSignatures = undefined;
  channelEnsured = false;
}

export type ReconcileDeadlineScheduleResult = { ok: true } | { ok: false; error: string };

/** Restart-safe, no-churn, serialized reconciliation of the task-deadline
 * OS schedule set. `tasks` must be the caller's already-fetched
 * Pending/InProgress task list (GET /tasks/today's `pending`). A
 * scheduling failure is reported, never thrown. */
export async function reconcileDeadlineNotificationSchedule(
  tasks: Task[],
  permissionGranted: boolean,
  options?: { force?: boolean }
): Promise<ReconcileDeadlineScheduleResult> {
  const now = Date.now();
  const desired = permissionGranted ? computeDesiredSchedules(tasks, now) : new Map<string, DesiredEntry>();
  const desiredSignatures = new Map(Array.from(desired, ([identifier, entry]) => [identifier, entry.signature]));
  const force = options?.force ?? false;

  if (!force && lastAppliedSignatures !== undefined && signatureMapsEqual(desiredSignatures, lastAppliedSignatures)) {
    return { ok: true };
  }

  return enqueueOp(async () => {
    if (
      !force &&
      lastAppliedSignatures !== undefined &&
      signatureMapsEqual(desiredSignatures, lastAppliedSignatures)
    ) {
      return { ok: true };
    }
    try {
      const nextApplied = await applySchedule(desired, lastAppliedSignatures ?? new Map());
      lastAppliedSignatures = nextApplied;
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to update deadline reminder schedule.',
      };
    }
  });
}

/** Cancels every scheduled task-deadline notification (never a Focus-break
 * or unrelated one) and resets the applied-signature cache — the
 * sign-out/account-switch cleanup path. Serialized through the same
 * queue as reconcileDeadlineNotificationSchedule. */
export async function cancelAllDeadlineNotifications(): Promise<void> {
  await enqueueOp(async () => {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const deadlineSchedules = scheduled.filter((request) =>
      isTaskDeadlineNotificationData(request.content.data)
    );
    await Promise.all(
      deadlineSchedules.map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier))
    );
    resetDeadlineNotificationScheduleCache();
  });
}
