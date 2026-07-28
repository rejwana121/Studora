import * as Notifications from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import { listSessions } from '@/api/sessions';
import { useSession } from '@/features/auth/session-context';

import {
  cancelAllBreakNotifications,
  getFocusBreakPermissionStatus,
  isFocusBreakNotificationData,
  reconcileBreakNotificationSchedule,
  requestFocusBreakPermission,
  type FocusBreakNotificationData,
  type FocusBreakPermissionStatus,
} from './schedule-break-notification';

const FOCUS_HREF = '/focus' as Href;

interface NotificationCoordinatorValue {
  permissionStatus: FocusBreakPermissionStatus | 'loading';
  requestPermission: () => Promise<void>;
  /** Bumped once per foreground-received or tapped focus-break
   * notification whose ownership was verified against the current
   * authenticated user's actual session. The Focus screen watches this —
   * not the raw OS listeners, which this provider alone registers — so
   * it can consume exactly one fresh reconcile per intent, including an
   * intent that fired before Focus itself had mounted. */
  focusBreakIntentVersion: number;
}

const NotificationCoordinatorContext = createContext<NotificationCoordinatorValue | null>(null);

export function useNotificationCoordinator(): NotificationCoordinatorValue {
  const value = useContext(NotificationCoordinatorContext);
  if (!value) {
    throw new Error('useNotificationCoordinator must be used within a NotificationCoordinatorProvider');
  }
  return value;
}

function notificationEventKey(data: FocusBreakNotificationData): string {
  return `${data.session_id}:${data.eligible_at}`;
}

// The foreground presentation handler (`setNotificationHandler`) is
// registered in the root layout (`app/_layout.tsx`), not here — it must
// exist before auth resolves, so a signed-out foreground notification is
// still presented rather than silently dropped. This provider owns only
// the authenticated, token-dependent concerns: listeners, schedule
// access, navigation, and sign-out/account-switch cleanup.

export function NotificationCoordinatorProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const token = session?.access_token ?? null;
  const userId = session?.user.id ?? null;
  const [permissionStatus, setPermissionStatus] = useState<FocusBreakPermissionStatus | 'loading'>('loading');
  const [focusBreakIntentVersion, setFocusBreakIntentVersion] = useState(0);

  // Tracks which user id the cold-start sweep has already run for, so a
  // mere access-token refresh (same user) doesn't re-trigger it, while a
  // genuine identity change does.
  const sweptForUserIdRef = useRef<string | null>(null);
  const prevUserIdRef = useRef<string | null>(null);
  // Bumped on every real identity change (including to/from signed-out)
  // AND synchronously on unmount. Any in-flight async work (sweep or a
  // listener's ownership check) captures this value at start and must
  // re-check it after every `await` before doing anything observable —
  // this is what makes a stale response from a previous
  // token/user/unmounted provider impossible to act on.
  const sweepGenerationRef = useRef(0);
  // Set synchronously and FIRST in the unmount cleanup, before the
  // generation bump or the fire-and-forget cancel-all — see the
  // dedicated disposal effect below for why ordering matters here.
  const disposedRef = useRef(false);
  // Single-slot "most recently handled notification" key, shared between
  // the cold-start sweep and the live listeners, so a notification that
  // arrives through both paths (e.g. a cold-start tap is both retrievable
  // via `getLastNotificationResponseAsync` AND re-delivered to
  // `addNotificationResponseReceivedListener`) is only ever acted on
  // once — never a duplicate ownership check, never a duplicate
  // navigation/intent.
  const lastHandledNotificationKeyRef = useRef<string | null>(null);
  // Always-current mirrors of `token`/`userId` for use inside listener
  // closures, which are registered once (stable deps) and would
  // otherwise capture a stale value forever.
  const tokenRef = useRef(token);
  const userIdRef = useRef(userId);
  tokenRef.current = token;
  userIdRef.current = userId;

  const registerIntent = useCallback(() => {
    setFocusBreakIntentVersion((v) => v + 1);
    router.push(FOCUS_HREF);
  }, []);

  function claimNotificationEvent(key: string): boolean {
    if (lastHandledNotificationKeyRef.current === key) return false; // duplicate — already handled/in flight
    lastHandledNotificationKeyRef.current = key;
    return true;
  }

  useEffect(() => {
    let isMounted = true;
    getFocusBreakPermissionStatus().then((status) => {
      if (isMounted) setPermissionStatus(status);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const requestPermission = useCallback(async () => {
    const status = await requestFocusBreakPermission();
    setPermissionStatus(status);
  }, []);

  // Ownership-verified intent emission for the LIVE listeners below. A
  // listener only has the notification's own data payload — it cannot
  // synchronously know whether that payload still belongs to the
  // currently authenticated user (a stale schedule from a previous
  // account could theoretically still be in flight for a brief window),
  // so it performs the same authenticated `listSessions` truth check the
  // cold-start sweep uses, guarded by the same disposed/generation/user
  // checks after the awaited call.
  const verifyOwnershipAndRegisterIntent = useCallback(async (data: FocusBreakNotificationData) => {
    if (!claimNotificationEvent(notificationEventKey(data))) return; // duplicate received+response for the same notification

    const checkToken = tokenRef.current;
    const checkUserId = userIdRef.current;
    const gen = sweepGenerationRef.current;
    if (disposedRef.current || !checkToken || !checkUserId) return;

    const result = await listSessions(checkToken, { limit: 1 });

    if (disposedRef.current) return; // provider unmounted while this was in flight
    if (sweepGenerationRef.current !== gen) return; // a newer identity has since taken over
    if (userIdRef.current !== checkUserId) return; // defensive: identity changed without a generation bump

    if (!result.ok) return;
    const row = result.data[0] ?? null;
    const unfinished = row && (row.status === 'Active' || row.status === 'Paused') ? row : null;
    if (unfinished && unfinished.id === data.session_id) {
      registerIntent();
    }
    // No match: this notification does not belong to the current user's
    // actual current session — never navigate, never emit an intent.
  }, [registerIntent]);

  // Sole registrant of both listeners in the app — Focus consumes their
  // effect only through `focusBreakIntentVersion`, never by registering a
  // second listener of its own.
  useEffect(() => {
    const receivedSub = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data;
      if (isFocusBreakNotificationData(data)) {
        void verifyOwnershipAndRegisterIntent(data);
      }
    });
    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (isFocusBreakNotificationData(data)) {
        void verifyOwnershipAndRegisterIntent(data);
      }
    });
    return () => {
      receivedSub.remove();
      responseSub.remove();
    };
  }, [verifyOwnershipAndRegisterIntent]);

  // Cold-start sweep + account-switch guard, keyed on user identity (not
  // raw token — an access-token refresh for the SAME user must not
  // re-trigger any of this). This effect cannot run until the user has
  // actually signed in (this provider only exists while authenticated;
  // see `(app)/_layout.tsx`), which is what makes "don't consume a
  // signed-out cold-start tap" correct for free — nothing here ever
  // reads or clears a pending response while signed out.
  useEffect(() => {
    const prevUserId = prevUserIdRef.current;
    prevUserIdRef.current = userId;

    if (prevUserId !== userId) {
      // A real identity change (including a fresh sign-in, where
      // prevUserId is `null`) — invalidate any sweep/ownership-check
      // still in flight for the previous identity before anything else
      // runs.
      sweepGenerationRef.current += 1;
      if (prevUserId !== null) {
        // Defensive account-switch cleanup: normal sign-out already
        // unmounts this provider (see the dedicated disposal effect
        // below), which is the primary path. This covers the case where
        // a different user's session replaces the current one without
        // this provider ever unmounting — User A's pending schedule
        // must never survive into User B's session.
        void cancelAllBreakNotifications();
      }
    }

    if (!token || !userId) return;
    if (sweptForUserIdRef.current === userId) return; // already swept for this identity
    sweptForUserIdRef.current = userId;
    const gen = sweepGenerationRef.current;
    const capturedUserId = userId;

    (async () => {
      if (disposedRef.current || sweepGenerationRef.current !== gen) return;

      const lastResponse = await Notifications.getLastNotificationResponseAsync();
      if (disposedRef.current || sweepGenerationRef.current !== gen || userIdRef.current !== capturedUserId) return;

      const status = await getFocusBreakPermissionStatus();
      if (disposedRef.current || sweepGenerationRef.current !== gen || userIdRef.current !== capturedUserId) return;

      // Fetch the current authenticated truth ONCE and use it for both
      // ownership verification (below) and schedule reconciliation — no
      // second redundant fetch.
      const result = await listSessions(token, { limit: 1 });
      if (disposedRef.current || sweepGenerationRef.current !== gen || userIdRef.current !== capturedUserId) return;

      const row = result.ok ? (result.data[0] ?? null) : null;
      const unfinished = row && (row.status === 'Active' || row.status === 'Paused') ? row : null;

      const responseData = lastResponse?.notification.request.content.data;
      if (lastResponse && isFocusBreakNotificationData(responseData)) {
        if (claimNotificationEvent(notificationEventKey(responseData))) {
          // Ownership rule: only emit an intent/navigate if this
          // response's session_id exactly matches the CURRENT user's
          // actual current unfinished session — never trust the payload
          // alone (it may be a stale response left over from a
          // previous account on a shared/reused device).
          if (unfinished && unfinished.id === responseData.session_id) {
            registerIntent();
          }
        }
        // Consumed exactly once either way — a response that doesn't
        // belong to this user is still cleared so it can never be
        // reprocessed (by this user or a future one), it just never
        // triggers navigation.
        await Notifications.clearLastNotificationResponseAsync();
        if (disposedRef.current || sweepGenerationRef.current !== gen || userIdRef.current !== capturedUserId) return;
      }

      // Restart-safe schedule reconciliation from the fetch above —
      // never trust in-memory schedule state alone across a cold start.
      // Runs regardless of whether a response was owned/consumed above,
      // per "still reconcile/cancel schedules for the actual current
      // user."
      await reconcileBreakNotificationSchedule(unfinished, status === 'granted', { force: true });
    })();
  }, [token, userId, registerIntent]);

  // Disposal — the primary sign-out path: this provider unmounts
  // entirely when `(app)/_layout.tsx` redirects on `!session`. Ordering
  // here is load-bearing (see the failure scenario this fixes): without
  // synchronously invalidating in-flight work FIRST, a sweep or
  // ownership check that was mid-`await` when unmount happened could
  // still see its captured generation as current, and enqueue a
  // schedule/navigation AFTER the cancel-all that was meant to be the
  // last word — reviving a stale user's notification. So:
  //   1. mark disposed (every in-flight check's post-await guard reads
  //      this first and bails immediately, before even checking
  //      generation);
  //   2. bump the generation (belt-and-suspenders — also fails any
  //      generation-keyed check independently of `disposedRef`);
  //   3. drop any claimed-but-incomplete notification-event key, so a
  //      genuinely new event after a future re-mount is never mistaken
  //      for a duplicate of one that never finished;
  //   4. only THEN fire-and-forget the actual OS cancel-all — by this
  //      point nothing still in flight can act after it completes.
  useEffect(() => {
    disposedRef.current = false; // explicit — this is a fresh mount's ref, but stated for clarity/robustness
    return () => {
      disposedRef.current = true;
      sweepGenerationRef.current += 1;
      lastHandledNotificationKeyRef.current = null;
      void cancelAllBreakNotifications();
    };
  }, []);

  return (
    <NotificationCoordinatorContext.Provider
      value={{ permissionStatus, requestPermission, focusBreakIntentVersion }}
    >
      {children}
    </NotificationCoordinatorContext.Provider>
  );
}
