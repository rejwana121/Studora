import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import {
  finishSession,
  listSessions,
  pauseSession,
  recordBreakAction,
  resumeSession,
  startSession,
} from '@/api/sessions';
import type { ApiResult, BreakAction, StudySessionCreate, StudySessionRead } from '@/types/api';

const RECONCILE_INTERVAL_MS = 30_000;
export const STALE_WARNING_MS = 60_000;

export type FocusPhase = 'loading' | 'no-session' | 'active' | 'paused';

/** Outcome of a break action (TakeBreak/Snooze/Dismiss). Break actions
 * are append-only on the server (no idempotency guard, unlike
 * pause/resume/finish) — an ambiguous network failure is never resolved
 * by blindly resending. See `performBreakAction` below. */
export type BreakOutcome = 'ok' | 'retry-eligible' | 'resolved-no-retry' | 'superseded';

interface Snapshot {
  activeDurationSeconds: number;
  anchorMonotonicMs: number;
}

export interface UseFocusSessionResult {
  phase: FocusPhase;
  session: StudySessionRead | null;
  displaySeconds: number;
  lastSyncedAtMs: number | null;
  reconcileError: string | null;
  isMutating: boolean;
  mutationError: string | null;
  finishedElsewhereMessage: string | null;
  dismissFinishedElsewhereMessage: () => void;
  /** Mutation-priority-safe reconciliation trigger. Call this — never a
   * raw "GET /sessions" — from mount/focus, AppState-active, and the
   * internal 30s interval alike, so an in-flight mutation is never
   * superseded by a poll. */
  reconcile: () => void;
  start: (taskId: string | null) => Promise<string | null>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  finish: () => Promise<void>;
  takeBreak: (durationMinutes: number) => Promise<BreakOutcome>;
  snooze: () => Promise<BreakOutcome>;
  dismiss: () => Promise<BreakOutcome>;
}

export function useFocusSession(token: string | null): UseFocusSessionResult {
  const [phase, setPhase] = useState<FocusPhase>('loading');
  const [session, setSession] = useState<StudySessionRead | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [displaySeconds, setDisplaySeconds] = useState(0);
  const [lastSyncedAtMs, setLastSyncedAtMs] = useState<number | null>(null);
  const [isMutating, setIsMutating] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [reconcileError, setReconcileError] = useState<string | null>(null);
  const [finishedElsewhereMessage, setFinishedElsewhereMessage] = useState<string | null>(null);
  const [isAppActive, setIsAppActive] = useState(AppState.currentState === 'active');

  // `generationRef` is bumped at the SEND of every poll or mutation — a
  // response is applied only if the ref still matches what was captured
  // at send-time. `isMutatingRef` mirrors `isMutating` synchronously
  // (state is async/batched) so `reconcile()` can gate on it the instant
  // a mutation starts, not after a re-render. `pendingReconcileRef`
  // queues at most one reconciliation requested while a mutation is in
  // flight, run once the mutation settles.
  const generationRef = useRef(0);
  const isMutatingRef = useRef(false);
  const pendingReconcileRef = useRef(false);
  const knownSessionIdRef = useRef<string | null>(null);
  const appStateRef = useRef(AppState.currentState);

  const applySnapshot = useCallback((row: StudySessionRead | null) => {
    knownSessionIdRef.current = row ? row.id : null;
    setSession(row);
    setPhase(row ? (row.status === 'Active' ? 'active' : 'paused') : 'no-session');
    setSnapshot(
      row && row.status === 'Active'
        ? { activeDurationSeconds: row.active_duration_seconds, anchorMonotonicMs: performance.now() }
        : null
    );
    setDisplaySeconds(row ? row.active_duration_seconds : 0);
    setLastSyncedAtMs(Date.now());
  }, []);

  // --- reconciliation: GET /sessions?limit=1 (no status filter) -------
  // Provably sufficient: the DB's partial unique index guarantees at
  // most one unfinished (Active/Paused) session per user, and starting a
  // new one requires the prior one to already be finished — so an
  // unfinished session, if one exists, always has the most recent
  // `started_at` of any of the user's sessions, and is therefore always
  // the single row `limit=1` (sorted started_at DESC) returns. One
  // request covers both Active and Paused, including a cross-device
  // Pause, with no need for two parallel status-filtered queries.
  const reconcileNow = useCallback(async (): Promise<StudySessionRead | null> => {
    if (!token) return null;
    const gen = ++generationRef.current;
    const result = await listSessions(token, { limit: 1 });
    if (generationRef.current !== gen) return null; // superseded by a mutation or a later reconcile
    if (!result.ok) {
      setReconcileError(result.error.message);
      return null;
    }
    setReconcileError(null);
    const row = result.data[0] ?? null;
    const isUnfinished = row !== null && (row.status === 'Active' || row.status === 'Paused');
    const resolved = isUnfinished ? row : null;

    const wasKnown = knownSessionIdRef.current !== null;
    applySnapshot(resolved);

    if (wasKnown && resolved === null) {
      setFinishedElsewhereMessage('This focus session was finished elsewhere.');
    }
    return resolved;
  }, [token, applySnapshot]);

  // Public, mutation-priority-safe entry point: a reconciliation trigger
  // that fires while a mutation is pending is queued (at most one), not
  // dropped and not run immediately — it runs exactly once, after the
  // mutation settles, via `runMutation` below.
  const reconcile = useCallback(() => {
    if (isMutatingRef.current) {
      pendingReconcileRef.current = true;
      return;
    }
    void reconcileNow();
  }, [reconcileNow]);

  // --- mutation wrapper -------------------------------------------------
  // Bumps generation and sets isMutating BEFORE the network call — this
  // is what makes a mutation immediately supersede any reconciliation
  // already in flight (its response, on arrival, fails the generation
  // check above) and prevents a NEW poll from starting at all while this
  // is pending (`reconcile()` checks `isMutatingRef` first).
  const runMutation = useCallback(
    async <T,>(
      fn: () => Promise<ApiResult<T>>,
      onSuccess: (data: T) => void
    ): Promise<ApiResult<T> | null> => {
      const gen = ++generationRef.current;
      isMutatingRef.current = true;
      setIsMutating(true);
      setMutationError(null);

      const result = await fn();

      if (generationRef.current !== gen) {
        // A newer mutation started after this one — it alone may still
        // apply a result; this one's outcome is moot.
        return null;
      }

      isMutatingRef.current = false;
      setIsMutating(false);

      if (result.ok) onSuccess(result.data);

      // Apply the mutation's own result FIRST (above), then run exactly
      // one queued reconciliation if one was requested while this was
      // pending — never before the mutation's own result is applied.
      if (pendingReconcileRef.current) {
        pendingReconcileRef.current = false;
        void reconcileNow();
      }

      return result;
    },
    [reconcileNow]
  );

  // --- lifecycle actions (pause/resume/finish are server-idempotent —
  // safe to just reconcile on failure to find the true state; no
  // ambiguous-retry handling needed, unlike break actions below) -------

  const start = useCallback(
    async (taskId: string | null): Promise<string | null> => {
      if (!token) return 'Not signed in';
      const data: StudySessionCreate = { task_id: taskId };
      const result = await runMutation(() => startSession(token, data), applySnapshot);
      if (!result) return null;
      if (result.ok) return null;
      if (result.status === 409) {
        // Another start won the race (or a double-tap slipped through) —
        // recover gracefully by loading whatever now exists instead of
        // surfacing a raw conflict error.
        await reconcileNow();
        return null;
      }
      return result.error.message;
    },
    [token, runMutation, applySnapshot, reconcileNow]
  );

  const pause = useCallback(async () => {
    if (!token || !session) return;
    const result = await runMutation(() => pauseSession(token, session.id), applySnapshot);
    if (result && !result.ok) {
      setMutationError(result.error.message);
      await reconcileNow();
    }
  }, [token, session, runMutation, applySnapshot, reconcileNow]);

  const resume = useCallback(async () => {
    if (!token || !session) return;
    const result = await runMutation(() => resumeSession(token, session.id), applySnapshot);
    if (result && !result.ok) {
      setMutationError(result.error.message);
      await reconcileNow();
    }
  }, [token, session, runMutation, applySnapshot, reconcileNow]);

  const finish = useCallback(async () => {
    if (!token || !session) return;
    const result = await runMutation(() => finishSession(token, session.id), applySnapshot);
    if (result && !result.ok) {
      setMutationError(result.error.message);
      await reconcileNow();
    }
  }, [token, session, runMutation, applySnapshot, reconcileNow]);

  // --- break actions: NOT idempotent server-side (append-only event
  // log, no dedup) — an ambiguous network failure must never be resolved
  // by resending the same POST. Reconcile and let the server's own
  // resulting state answer whether the original attempt landed. ---------

  const performBreakAction = useCallback(
    async (action: BreakAction, durationMinutes?: number): Promise<BreakOutcome> => {
      if (!token || !session) return 'superseded';
      const data = durationMinutes !== undefined ? { action, duration_minutes: durationMinutes } : { action };

      const result = await runMutation(
        () => recordBreakAction(token, session.id, data),
        (payload) => applySnapshot(payload.session)
      );

      if (!result) return 'superseded'; // a newer mutation started; this attempt's outcome no longer matters
      if (result.ok) return 'ok';

      // Ambiguous failure: we do not know whether the POST landed before
      // the error. Do NOT resend — reconcile and classify from the
      // server's own resulting truth instead of guessing.
      const reconciled = await reconcileNow();

      if (action === 'TakeBreak') {
        if (reconciled === null || reconciled.status !== 'Active') {
          // No unfinished session, or it's now Paused — TakeBreak's own
          // pause-and-record effect evidently landed. Nothing to retry.
          return 'resolved-no-retry';
        }
        if (reconciled.break_eligible) {
          // Still Active AND still eligible — nothing absorbed this
          // attempt server-side. Safe, and necessary, to let the user
          // explicitly retry rather than resending automatically.
          return 'retry-eligible';
        }
        // Still Active but no longer eligible — an ambiguous outcome
        // (e.g. a Snooze/Dismiss landed from elsewhere). Reflect the
        // reconciled truth without claiming success or forcing a retry.
        return 'resolved-no-retry';
      }

      // Snooze / Dismiss
      if (reconciled !== null && reconciled.status === 'Active') {
        return reconciled.break_eligible ? 'retry-eligible' : 'resolved-no-retry';
      }
      return 'resolved-no-retry'; // session no longer Active/unfinished — moot either way
    },
    [token, session, runMutation, applySnapshot, reconcileNow]
  );

  const takeBreak = useCallback(
    (durationMinutes: number) => performBreakAction('TakeBreak', durationMinutes),
    [performBreakAction]
  );
  const snooze = useCallback(() => performBreakAction('Snooze'), [performBreakAction]);
  const dismiss = useCallback(() => performBreakAction('Dismiss'), [performBreakAction]);

  const dismissFinishedElsewhereMessage = useCallback(() => setFinishedElsewhereMessage(null), []);

  // --- AppState: stop the interval while not Active; on foreground
  // return, do NOT trust performance.now() across the suspension as
  // authoritative — reconcile first, then a fresh anchor is created by
  // applySnapshot inside reconcileNow before interpolation resumes. -----
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      const prev = appStateRef.current;
      appStateRef.current = next;
      const nowActive = next === 'active';
      setIsAppActive(nowActive);
      if (prev.match(/inactive|background/) && nowActive) {
        reconcile();
      }
    });
    return () => subscription.remove();
  }, [reconcile]);

  // --- 30s reconciliation while locally Active AND the app is
  // foregrounded — stopped entirely otherwise, restarted automatically
  // once both conditions hold again. -------------------------------------
  useEffect(() => {
    if (phase !== 'active' || !isAppActive) return;
    const id = setInterval(reconcile, RECONCILE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [phase, isAppActive, reconcile]);

  // --- local display tick: monotonic interpolation only, 1/second,
  // only while Active and foregrounded (no point ticking while
  // suspended or Paused). -------------------------------------------------
  useEffect(() => {
    if (phase !== 'active' || !snapshot || !isAppActive) return;
    const tick = () => {
      setDisplaySeconds(snapshot.activeDurationSeconds + (performance.now() - snapshot.anchorMonotonicMs) / 1000);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [phase, snapshot, isAppActive]);

  return {
    phase,
    session,
    displaySeconds,
    lastSyncedAtMs,
    reconcileError,
    isMutating,
    mutationError,
    finishedElsewhereMessage,
    dismissFinishedElsewhereMessage,
    reconcile,
    start,
    pause,
    resume,
    finish,
    takeBreak,
    snooze,
    dismiss,
  };
}
