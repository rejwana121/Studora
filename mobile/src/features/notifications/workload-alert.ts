import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { secureStorageAdapter } from '@/lib/secure-storage';
import type { WorkloadCurrentResponse } from '@/types/api';

export const WORKLOAD_ALERT_NOTIFICATION_TYPE = 'workload_alert';
// v1: a brand-new feature, not a migration off an older channel — versioned
// from the start so any future retune (sound/importance/etc.) can bump this
// the same way task-deadlines did, without inheriting a decision made here.
export const WORKLOAD_ALERT_CHANNEL_ID = 'workload-alerts-v1';

// Reuses the already-bundled Checkpoint 7D-1 asset (see app.json's
// expo-notifications `sounds` array) — no new sound file, no app.json change.
const WORKLOAD_ALERT_SOUND_FILE = 'studora_alert.wav';

const COOLDOWN_MS = 4 * 60 * 60 * 1000;

/** Payload contract: deliberately carries no score/factor/level detail —
 * only what tap-navigation and staleness comparison need. Never leaks a
 * workload number, band, or explanation through the OS data payload. */
export interface WorkloadAlertNotificationData {
  type: typeof WORKLOAD_ALERT_NOTIFICATION_TYPE;
  evaluated_at: string;
  [key: string]: unknown;
}

export function isWorkloadAlertNotificationData(data: unknown): data is WorkloadAlertNotificationData {
  if (typeof data !== 'object' || data === null) return false;
  const candidate = data as Record<string, unknown>;
  return candidate.type === WORKLOAD_ALERT_NOTIFICATION_TYPE && typeof candidate.evaluated_at === 'string';
}

function identifierForUser(userId: string): string {
  return `workload-alert:${userId}`;
}

// SecureStore keys must match /^[\w.-]+$/ (alphanumeric, ".", "-", "_" only)
// — a ":" separator throws, so "." is used instead.
function stateKeyForUser(userId: string): string {
  return `workload_alert_state.${userId}`;
}

/** Persisted per user (SecureStore, never AsyncStorage/plaintext — see
 * secure-storage.ts). Deliberately only booleans/timestamps/version string:
 * never `level`, `raw_score`, `strong_signal_count`, `factors`,
 * `recommendations`, or any explanation text. */
interface WorkloadAlertState {
  wasQualifying: boolean;
  cooldownUntil: string | null;
  lastEvaluatedAt: string | null;
  engineVersion: string | null;
}

const DEFAULT_STATE: WorkloadAlertState = {
  wasQualifying: false,
  cooldownUntil: null,
  lastEvaluatedAt: null,
  engineVersion: null,
};

function isWorkloadAlertState(value: unknown): value is WorkloadAlertState {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.wasQualifying === 'boolean' &&
    (candidate.cooldownUntil === null || typeof candidate.cooldownUntil === 'string') &&
    (candidate.lastEvaluatedAt === null || typeof candidate.lastEvaluatedAt === 'string') &&
    (candidate.engineVersion === null || typeof candidate.engineVersion === 'string')
  );
}

// A corrupt/unreadable record is never fatal — it just falls back to the
// same "never alerted yet" baseline a first-ever check would see.
async function readState(userId: string): Promise<WorkloadAlertState> {
  try {
    const raw = await secureStorageAdapter.getItem(stateKeyForUser(userId));
    if (raw === null) return DEFAULT_STATE;
    const parsed: unknown = JSON.parse(raw);
    return isWorkloadAlertState(parsed) ? parsed : DEFAULT_STATE;
  } catch {
    return DEFAULT_STATE;
  }
}

async function writeState(userId: string, state: WorkloadAlertState): Promise<void> {
  try {
    await secureStorageAdapter.setItem(stateKeyForUser(userId), JSON.stringify(state));
  } catch {
    // Silent by design (see module doc) — worst case the next check
    // re-derives from whatever was last durably written.
  }
}

/** Sign-out/account-switch cleanup: deliberately does NOT touch the
 * persisted state (that would make the same user re-alert on their next
 * sign-in while workload has stayed continuously High/Critical the whole
 * time). Only removes the currently-displayed OS notification, if any, so
 * a different account signing in on the same device never sees a leftover
 * tray entry whose tap could feel like it belongs to them. */
export async function dismissWorkloadAlert(userId: string): Promise<void> {
  try {
    await Notifications.dismissNotificationAsync(identifierForUser(userId));
  } catch {
    // Best-effort — if this fails, the stale notification (if any) simply
    // remains in the tray; nothing about app state depends on it.
  }
}

export async function ensureWorkloadAlertChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(WORKLOAD_ALERT_CHANNEL_ID, {
    name: 'Workload alerts',
    importance: Notifications.AndroidImportance.MAX,
    sound: WORKLOAD_ALERT_SOUND_FILE,
  });
}

// Same dependency-free FIFO promise-chain mutex as schedule-break-
// notification.ts / schedule-deadline-notification.ts: the read-decide-
// persist critical section below must never interleave across two
// concurrently-triggered checks (e.g. a task mutation and the AppState
// foreground listener firing together) — otherwise both could read the
// same stale `wasQualifying: false` and both fire.
let opQueue: Promise<void> = Promise.resolve();

function enqueueOp<T>(fn: () => Promise<T>): Promise<T> {
  const run = opQueue.then(fn, fn);
  opQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

/** Safe ISO-8601 parse for staleness comparison — never a raw string
 * ordering, which would be wrong across differing timestamp formats/
 * lengths. An unparseable value is treated as "no usable timestamp." */
function parseTimestampMs(value: string | null): number | null {
  if (value === null) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function workloadQualifies(workload: WorkloadCurrentResponse): boolean {
  return (workload.level === 'High' || workload.level === 'Critical') && workload.strong_signal_count >= 2;
}

async function fireNotification(userId: string, evaluatedAt: string): Promise<boolean> {
  const data: WorkloadAlertNotificationData = {
    type: WORKLOAD_ALERT_NOTIFICATION_TYPE,
    evaluated_at: evaluatedAt,
  };
  try {
    await ensureWorkloadAlertChannel();
    await Notifications.scheduleNotificationAsync({
      identifier: identifierForUser(userId),
      content: {
        title: 'Your workload needs attention',
        body: "Your workload is currently heavy — see what's contributing and what might help.",
        sound: WORKLOAD_ALERT_SOUND_FILE,
        data,
      },
      trigger: Platform.OS === 'android' ? { channelId: WORKLOAD_ALERT_CHANNEL_ID } : null,
    });
    return true;
  } catch {
    return false;
  }
}

/** Core transition/dedup/cooldown decision, serialized per module (not per
 * user — acceptable, since this app has at most one authenticated user at
 * a time and calls are already infrequent). See Checkpoint 7D-2 plan for
 * the full state-machine rationale; summarized here:
 *
 * - `!qualifies` -> reset (`wasQualifying: false`), never alerts. This is
 *   the ONLY reset path (dropping back below High/Critical).
 * - `qualifies && wasQualifying` -> already consumed for this stretch, no
 *   alert.
 * - `qualifies && !wasQualifying` but still within `cooldownUntil` ->
 *   silently consumed (`wasQualifying: true`) without alerting — this is
 *   the oscillation guard (a fast drop-then-recross spends the crossing
 *   instead of spamming).
 * - `qualifies && !wasQualifying`, cooldown clear, but `permissionGranted`
 *   is false, or the OS call fails -> NOT consumed (`wasQualifying` stays
 *   false, `cooldownUntil` untouched) so the very next check (including
 *   the one fired right after a permission grant) retries.
 * - Same, but the OS call succeeds -> consumed AND a fresh cooldown starts.
 *
 * A response older than (or from a different engine version than) the
 * last one already applied is discarded outright — see the staleness/
 * engine-version guards below — so an out-of-order concurrent fetch can
 * never regress already-applied, newer state. */
export async function checkAndMaybeFireWorkloadAlert(
  userId: string,
  permissionGranted: boolean,
  workload: WorkloadCurrentResponse
): Promise<void> {
  await enqueueOp(async () => {
    const state = await readState(userId);

    const newEvaluatedMs = parseTimestampMs(workload.evaluated_at);
    const priorEvaluatedMs = parseTimestampMs(state.lastEvaluatedAt);
    const sameEngineVersion = state.engineVersion === workload.engine_version;

    if (
      sameEngineVersion &&
      newEvaluatedMs !== null &&
      priorEvaluatedMs !== null &&
      newEvaluatedMs <= priorEvaluatedMs
    ) {
      return; // stale or duplicate evaluation — never regress already-applied state
    }

    if (state.engineVersion !== null && !sameEngineVersion) {
      // Engine retuned: establish a fresh baseline rather than firing (or
      // suppressing) based on decision state computed under a different
      // scoring scheme. Not itself a user-facing "transition."
      await writeState(userId, {
        wasQualifying: workloadQualifies(workload),
        cooldownUntil: null,
        lastEvaluatedAt: workload.evaluated_at,
        engineVersion: workload.engine_version,
      });
      return;
    }

    const qualifies = workloadQualifies(workload);
    const bookkeeping = { lastEvaluatedAt: workload.evaluated_at, engineVersion: workload.engine_version };

    if (!qualifies) {
      await writeState(userId, { ...state, ...bookkeeping, wasQualifying: false });
      return;
    }

    if (state.wasQualifying) {
      await writeState(userId, { ...state, ...bookkeeping });
      return;
    }

    const cooldownMs = parseTimestampMs(state.cooldownUntil);
    if (cooldownMs !== null && Date.now() < cooldownMs) {
      // Oscillation guard: this crossing is spent silently, without ever
      // having alerted for it.
      await writeState(userId, { ...state, ...bookkeeping, wasQualifying: true });
      return;
    }

    if (!permissionGranted) {
      // Never consume the transition without permission — the next check
      // (including the one fired right after a grant) must still be able
      // to alert for this same, still-unconsumed crossing.
      await writeState(userId, { ...state, ...bookkeeping });
      return;
    }

    const fired = await fireNotification(userId, workload.evaluated_at);
    if (!fired) {
      // Silent failure — same non-consuming behavior as the no-permission
      // branch above, so the next check retries.
      await writeState(userId, { ...state, ...bookkeeping });
      return;
    }

    await writeState(userId, {
      ...bookkeeping,
      wasQualifying: true,
      cooldownUntil: new Date(Date.now() + COOLDOWN_MS).toISOString(),
    });
  });
}
