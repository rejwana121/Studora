import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { useEffect, useRef } from 'react';

import type { FocusBreakPermissionStatus } from '@/features/notifications/schedule-break-notification';
import type { StudySessionRead } from '@/types/api';

const CUE_SOURCE = require('../../../assets/audio/focus-break-cue.wav');

interface UseFocusBreakCueParams {
  session: StudySessionRead | null;
  permissionStatus: FocusBreakPermissionStatus | 'loading';
  isAppActive: boolean;
}

/** Plays the approved 528Hz swell cue exactly once per server-confirmed
 * `break_eligible` false-to-true transition, foreground-only, and only
 * when OS notification permission is denied/undetermined — granted
 * permission relies solely on the OS notification's own sound (see
 * `schedule-break-notification.ts`); this hook never plays in that case.
 * Reacts only to `session`, which is already generation-guarded upstream
 * in `useFocusSession` — adds no polling or listener of its own. */
export function useFocusBreakCue({ session, permissionStatus, isAppActive }: UseFocusBreakCueParams): void {
  const player = useAudioPlayer(CUE_SOURCE);

  // `null` = no proven baseline yet (mount, session change, or just
  // entered/left Active) — a transition requires two real observations,
  // so an already-true first snapshot is never assumed to have "just
  // happened." A real observed `false` arms the next `true` to fire.
  const priorSessionIdRef = useRef<string | null>(null);
  const priorBreakEligibleRef = useRef<boolean | null>(null);

  useEffect(() => {
    void setAudioModeAsync({
      playsInSilentMode: false,
      shouldPlayInBackground: false,
      interruptionMode: 'mixWithOthers',
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const activeId = session && session.status === 'Active' ? session.id : null;

    if (priorSessionIdRef.current !== activeId) {
      priorSessionIdRef.current = activeId;
      priorBreakEligibleRef.current = null;
    }

    if (activeId === null) {
      priorBreakEligibleRef.current = null;
      return;
    }

    const current = session!.break_eligible;
    const prior = priorBreakEligibleRef.current;
    priorBreakEligibleRef.current = current;

    if (prior !== false || current !== true) return; // not a confirmed false->true edge
    if (permissionStatus === 'granted' || permissionStatus === 'loading') return; // OS sound covers granted; never play while unresolved
    if (!isAppActive) return; // foreground-only, per locked scope

    async function playCue() {
      try {
        if (!player.isLoaded) return;
        await player.seekTo(0);
        player.play();
      } catch {
        // Playback failure must never affect timer/session/modal/navigation
        // state, and is never retried — the next opportunity is only the
        // next genuine false->true transition.
      }
    }
    void playCue();
    // `player` is intentionally omitted: it is a single stable instance
    // for this hook's lifetime and must not retrigger this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, permissionStatus, isAppActive]);
}
