import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

import NativeAlarmModule from 'workload-alarm';

export interface WorkloadAlarmStartResult {
  ok: boolean;
  /** User-facing fallback copy — only set when `ok` is false. */
  message?: string;
}

const START_FAILURE_MESSAGE =
  "Couldn't start the alarm sound on this device — you'll still get the usual workload notification.";

/** The /workload screen checks for this exact param to know it was opened
 * via the alarm notification's "Take a Break" action, and stops the alarm
 * there — see workload.tsx. Native no longer stops the alarm itself for
 * that action (a notification action that launches an Activity via an
 * intermediary Service is blocked as a "trampoline" on Android 12+), so
 * this is how cleanup still happens for it. */
export const TAKE_A_BREAK_PARAM = 'fromAlarm';

/** Android + a custom dev/preview/production build only. `false` on iOS,
 * web, and inside Expo Go (no custom native code there — the module simply
 * doesn't exist, so `WorkloadAlarmNativeModule` is `null`). */
export function isWorkloadAlarmSupported(): boolean {
  return Platform.OS === 'android' && NativeAlarmModule != null;
}

/** Idempotent — safe to call repeatedly while already active; the native
 * service ignores a duplicate start rather than creating a second
 * MediaPlayer/wake lock. Always resolves (never throws) so a startup
 * failure can never break the caller's own workflow (workload
 * refresh/mutations, the dev test screen, etc). */
export async function startWorkloadAlarm(): Promise<WorkloadAlarmStartResult> {
  if (!isWorkloadAlarmSupported() || NativeAlarmModule == null) {
    return { ok: false, message: START_FAILURE_MESSAGE };
  }
  try {
    const deepLinkUrl = Linking.createURL('/workload', { queryParams: { [TAKE_A_BREAK_PARAM]: '1' } });
    await NativeAlarmModule.start(deepLinkUrl);
    return { ok: true };
  } catch {
    return { ok: false, message: START_FAILURE_MESSAGE };
  }
}

/** Idempotent — safe to call repeatedly, or when nothing is active (the
 * native module no-ops rather than throwing). Best-effort/silent-failure,
 * matching dismissWorkloadAlert's contract: nothing downstream depends on
 * this succeeding. */
export async function stopWorkloadAlarm(): Promise<void> {
  if (NativeAlarmModule == null) return;
  try {
    await NativeAlarmModule.stop();
  } catch {
    // Best-effort by design — see doc comment above.
  }
}
