// Imported from the top-level `expo` package (which re-exports the
// expo-modules-core API) rather than from `expo-modules-core` directly —
// expo-doctor flags a direct `expo-modules-core` dependency as something
// that should go through `expo` instead, and `expo` is already a normal
// dependency here.
import { requireOptionalNativeModule } from 'expo';

/**
 * Raw native surface. Android-only — `expo-module.config.json` declares no
 * `apple`/`web` platforms, so on any other platform (or inside Expo Go,
 * which has no custom native code) this native module simply doesn't
 * exist and every export below stays `null`/absent. Callers should go
 * through `@/features/notifications/workload-alarm-controller`, not this
 * file directly, for platform-safe fallback behavior.
 */
export interface WorkloadAlarmNativeModule {
  /** Synchronous — mirrors the foreground service's own running flag. */
  isActive(): boolean;
  /** Idempotent: a second call while already active does not create a
   * second MediaPlayer/wake lock, just reposts the same notification. */
  start(deepLinkUrl: string): Promise<void>;
  /** Idempotent: a no-op (native-side) when nothing is currently active. */
  stop(): Promise<void>;
}

const WorkloadAlarmNativeModule =
  requireOptionalNativeModule<WorkloadAlarmNativeModule>('WorkloadAlarm');

export default WorkloadAlarmNativeModule;
