import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { StudySessionRead } from '@/types/api';

export const FOCUS_BREAK_NOTIFICATION_TYPE = 'focus_break';
export const FOCUS_BREAK_CHANNEL_ID = 'focus-breaks';

/** Payload contract (Checkpoint 9B, locked): exactly these three fields,
 * nothing that could leak private content (no token, email, task title,
 * or notes) through the OS notification data payload. */
export interface FocusBreakNotificationData {
  type: typeof FOCUS_BREAK_NOTIFICATION_TYPE;
  session_id: string;
  eligible_at: string;
  [key: string]: unknown;
}

export function isFocusBreakNotificationData(data: unknown): data is FocusBreakNotificationData {
  if (typeof data !== 'object' || data === null) return false;
  const candidate = data as Record<string, unknown>;
  return (
    candidate.type === FOCUS_BREAK_NOTIFICATION_TYPE &&
    typeof candidate.session_id === 'string' &&
    typeof candidate.eligible_at === 'string'
  );
}

function identifierForSession(sessionId: string): string {
  return `focus-break:${sessionId}`;
}

/** The desired schedule signature for a session snapshot, or `null` if no
 * notification should exist for it. `null` covers: no session, not
 * Active, no `next_break_eligible_at`, or an eligible_at that is already
 * now-or-past (locked rule 10 — no notification for an immediate/past
 * instant; the in-app `break_eligible` banner covers that case live). */
function desiredSignature(session: StudySessionRead | null): string | null {
  if (!session || session.status !== 'Active' || !session.next_break_eligible_at) return null;
  const eligibleAtMs = new Date(session.next_break_eligible_at).getTime();
  if (Number.isNaN(eligibleAtMs) || eligibleAtMs <= Date.now()) return null;
  return `${session.id}:${session.next_break_eligible_at}`;
}

export type FocusBreakPermissionStatus = 'granted' | 'denied' | 'undetermined';

function toPermissionStatus(response: Notifications.NotificationPermissionsStatus): FocusBreakPermissionStatus {
  if (response.granted) return 'granted';
  return response.status === 'denied' ? 'denied' : 'undetermined';
}

export async function getFocusBreakPermissionStatus(): Promise<FocusBreakPermissionStatus> {
  const response = await Notifications.getPermissionsAsync();
  return toPermissionStatus(response);
}

/** Android requires a notification channel to exist before the OS will
 * even show the SDK 13+ permission prompt — must run before
 * `requestPermissionsAsync`. No-op on iOS. */
export async function ensureFocusBreakChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(FOCUS_BREAK_CHANNEL_ID, {
    name: 'Focus break reminders',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'default',
  });
}

export async function requestFocusBreakPermission(): Promise<FocusBreakPermissionStatus> {
  await ensureFocusBreakChannel();
  const response = await Notifications.requestPermissionsAsync();
  return toPermissionStatus(response);
}

// Module-scope cache of the last signature this process actually applied
// to the OS schedule — `undefined` means "never synced in this process,"
// which deliberately differs from every real `string | null` signature so
// the very first call after any process (re)start always runs the real
// enumeration, restart-safety included. Never read/written from component
// state — a remount must not force a redundant enumeration. Written ONLY
// after a real OS operation succeeds (see `reconcileBreakNotificationSchedule`
// and `cancelAllBreakNotifications`) — never optimistically before the
// awaited OS call resolves. A failed operation leaves this exactly as it
// was, so the same desired value is treated as still-unapplied and will
// be retried by the next poll/focus/AppState/explicit-retry call.
let lastAppliedSignature: string | null | undefined;

/** Explicit cache reset — call on sign-out/account-switch cleanup
 * alongside `cancelAllBreakNotifications` (which also calls this
 * internally) so a new user's first sync is never skipped because it
 * happens to coincide with the previous user's last-applied value. */
export function resetBreakNotificationScheduleCache(): void {
  lastAppliedSignature = undefined;
}

// --- OS-operation serialization ------------------------------------------
// `getAllScheduledNotificationsAsync`/`cancelScheduledNotificationAsync`/
// `scheduleNotificationAsync` calls must never overlap: two concurrent
// enumerate-then-mutate passes could each read the same stale snapshot and
// both "correctly" schedule/cancel against it, corrupting the final state
// (e.g. both missing that the other already created the correct match, and
// creating a duplicate). A dependency-free FIFO promise-chain mutex is
// sufficient — no coalescing/cancellation of superseded work is needed
// because each enqueued op already captured its own fully-resolved desired
// state at call time, and running strictly in send (= real event) order
// means a later (newer) op always has the final say: it runs after, and
// therefore overwrites, anything an earlier (older) op applied. An older
// queued op can never run after — and so can never overwrite — a newer one.
let opQueue: Promise<void> = Promise.resolve();

function enqueueOp<T>(fn: () => Promise<T>): Promise<T> {
  const run = opQueue.then(fn, fn); // run after the previous op settles, regardless of its outcome
  opQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function applySchedule(session: StudySessionRead | null, desired: string | null): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const focusBreakSchedules = scheduled.filter((request) => isFocusBreakNotificationData(request.content.data));

  let matched = false;
  for (const request of focusBreakSchedules) {
    const data = request.content.data as unknown as FocusBreakNotificationData;
    const signature = `${data.session_id}:${data.eligible_at}`;
    if (!matched && desired !== null && signature === desired) {
      matched = true; // exactly one correct match is preserved unchanged
      continue;
    }
    await Notifications.cancelScheduledNotificationAsync(request.identifier);
  }

  if (desired !== null && !matched && session?.next_break_eligible_at) {
    const data: FocusBreakNotificationData = {
      type: FOCUS_BREAK_NOTIFICATION_TYPE,
      session_id: session.id,
      eligible_at: session.next_break_eligible_at,
    };
    await Notifications.scheduleNotificationAsync({
      identifier: identifierForSession(session.id),
      content: {
        title: 'Time for a break?',
        body: "You've been studying for a while — take a moment when you're ready.",
        sound: 'default',
        data,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(session.next_break_eligible_at),
        ...(Platform.OS === 'android' ? { channelId: FOCUS_BREAK_CHANNEL_ID } : {}),
      },
    });
  }
}

export type ReconcileScheduleResult = { ok: true } | { ok: false; error: string };

/** Restart-safe, no-churn, serialized reconciliation of the focus-break OS
 * schedule. Enumerates (`getAllScheduledNotificationsAsync`) only when
 * `force` is set or the desired signature differs from what this process
 * last successfully applied — an unchanged 30s poll costs zero OS calls
 * and never enters the serialization queue at all. A scheduling failure is
 * reported, never thrown: it must not corrupt or block session/timer state
 * in the caller. */
export async function reconcileBreakNotificationSchedule(
  session: StudySessionRead | null,
  permissionGranted: boolean,
  options?: { force?: boolean }
): Promise<ReconcileScheduleResult> {
  const desired = permissionGranted ? desiredSignature(session) : null;
  const force = options?.force ?? false;

  // Cheap pre-check outside the queue: keeps an unchanged poll at zero
  // cost even under queue contention from other in-flight ops.
  if (!force && lastAppliedSignature !== undefined && desired === lastAppliedSignature) {
    return { ok: true };
  }

  return enqueueOp(async () => {
    // Re-check with whatever the queue's most recent op just applied —
    // an earlier-enqueued op may have already reached this exact desired
    // state while this call was waiting for its turn.
    if (!force && lastAppliedSignature !== undefined && desired === lastAppliedSignature) {
      return { ok: true };
    }
    try {
      await applySchedule(session, desired);
      lastAppliedSignature = desired; // only set AFTER the OS operation succeeds
      return { ok: true };
    } catch (err) {
      // Deliberately do not update `lastAppliedSignature` — the next
      // accepted snapshot (or the next forced trigger) will retry, since
      // the cache still does not reflect `desired` as applied.
      return { ok: false, error: err instanceof Error ? err.message : 'Failed to update break reminder schedule.' };
    }
  });
}

/** Cancels every scheduled focus-break notification and resets the
 * applied-signature cache — the sign-out/account-switch cleanup path.
 * Serialized through the same queue as `reconcileBreakNotificationSchedule`
 * so it can never interleave with an in-flight enumerate/cancel/schedule
 * pass (e.g. racing a poll that's mid-reschedule for the outgoing user). */
export async function cancelAllBreakNotifications(): Promise<void> {
  await enqueueOp(async () => {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const focusBreakSchedules = scheduled.filter((request) => isFocusBreakNotificationData(request.content.data));
    await Promise.all(
      focusBreakSchedules.map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier))
    );
    resetBreakNotificationScheduleCache();
  });
}
