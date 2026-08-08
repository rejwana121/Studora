import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Banner } from '@/components/banner';
import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { color, radius, space, type as typeTokens } from '@/design-system/tokens';
import { useSession } from '@/features/auth/session-context';
import { SessionCard } from '@/features/focus/session-card';
import { SessionHistory } from '@/features/focus/session-history';
import { useFocusSession } from '@/features/focus/use-focus-session';
import { useNotificationCoordinator } from '@/features/notifications/notification-coordinator';

// Very subtle, professional canvas — soft lavender at the top fading
// through near-white (matches surface.canvas) to a very light mint tint
// near the bottom. Alpha-blended rather than solid tokens so it reads as
// a tint, not a harsh color band; Idle/Active only — Complete owns its
// own dedicated top mint surface instead (see completeTopInsetFill below).
const FOCUS_GRADIENT_COLORS = [
  'rgba(228, 217, 250, 0.55)',
  'rgba(247, 247, 251, 1)',
  'rgba(223, 245, 236, 0.4)',
] as const;
const FOCUS_GRADIENT_LOCATIONS = [0, 0.55, 1] as const;

export default function FocusScreen() {
  const { session, profile } = useSession();
  const token = session?.access_token ?? null;
  const focus = useFocusSession(token);
  const insets = useSafeAreaInsets();
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const { permissionStatus, requestPermission, focusBreakIntentVersion } = useNotificationCoordinator();
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  /** Profile timezone from the shared SessionContext — forwarded to
   *  SessionCard and SessionHistory for timezone-aware display. No fetch
   *  needed here or in either child: SessionContext loads the profile once
   *  at sign-in and keeps it current app-wide. */
  const timezone = profile?.timezone ?? null;
  /** True while the Session Complete panel should be shown in SessionCard.
   *  Cleared by the Done button (onDismissComplete). Lifted here because
   *  the signal originates from finishedJustNowVersion in this component. */
  const [showComplete, setShowComplete] = useState(false);

  // `null` never equals a real intent version — see original comment.
  const consumedIntentRef = useRef<number | null>(null);
  // Reuses the existing consumedFinishRef pattern from the original file.
  // The only addition: setShowComplete(true) alongside the existing
  // historyRefreshKey bump, in the same effect body.
  const consumedFinishRef = useRef<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      focus.reconcile();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  useEffect(() => {
    if (focus.finishedElsewhereMessage) setHistoryRefreshKey((k) => k + 1);
  }, [focus.finishedElsewhereMessage]);

  // Same logic as the original file, with one addition: reveal the
  // Session Complete panel in SessionCard alongside the history refresh.
  useEffect(() => {
    if (consumedFinishRef.current === focus.finishedJustNowVersion) return;
    consumedFinishRef.current = focus.finishedJustNowVersion;
    if (focus.finishedJustNowVersion === 0) return; // 0 = sentinel, no local finish yet
    setHistoryRefreshKey((k) => k + 1);
    setShowComplete(true);
  }, [focus.finishedJustNowVersion]);

  useEffect(() => {
    if (consumedIntentRef.current === focusBreakIntentVersion) return;
    consumedIntentRef.current = focusBreakIntentVersion;
    if (focusBreakIntentVersion === 0) return; // 0 = no notification intent has ever fired
    focus.reconcile({ force: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusBreakIntentVersion]);

  async function handleEnableReminders() {
    setIsRequestingPermission(true);
    await requestPermission();
    setIsRequestingPermission(false);
  }

  if (!token) return null;

  // Single source of truth for both the outer "Focus" header and
  // SessionHistory's presentation, so the two can never disagree about
  // which state is showing. "loading" (before a session is known either
  // way) buckets with "idle" — the original idle-shaped layout is the
  // safe default while that resolves.
  const isComplete = showComplete && focus.phase === 'no-session';
  const isInSession = focus.phase === 'active' || focus.phase === 'paused';
  const historyMode: 'idle' | 'in-session' | 'complete' = isComplete
    ? 'complete'
    : isInSession
      ? 'in-session'
      : 'idle';
  // Active/paused shows its own compact "Focus session" header instead
  // (see SessionCard); Complete hides any large header entirely.
  const showAppHeader = historyMode === 'idle';

  // Focus-only SafeAreaView shell: using surface.canvas (#F7F7FB) as the
  // base so the status-bar region reads as near-white by default. Screen's
  // style prop only reaches the inner View, so it cannot be used here — we
  // use our own SafeAreaView instead of editing the shared screen.tsx
  // component. Dark status-bar content is scoped to this screen only —
  // reverts to whatever the app-wide default is once Focus unmounts;
  // nothing global is touched.
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />

      {historyMode !== 'complete' && (
        // Subtle Idle/Active canvas — behind all content, never intercepts
        // touches/scroll.
        <LinearGradient
          colors={FOCUS_GRADIENT_COLORS}
          locations={FOCUS_GRADIENT_LOCATIONS}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />
      )}
      {historyMode === 'complete' && (
        // Bounded to exactly the safe-area inset height (not flex:1) so it
        // only paints the true status-bar strip — SessionCard's own
        // completeMintSurface (opaque, zero-gap via contentComplete's
        // paddingTop: 0 below) continues the same color seamlessly from
        // there, and nothing further down the screen is tinted.
        <View
          style={[styles.completeTopInsetFill, { height: insets.top }]}
          pointerEvents="none"
        />
      )}

      <ScrollView
        contentContainerStyle={[
          styles.content,
          historyMode === 'in-session' && styles.contentInSession,
          historyMode === 'complete' && styles.contentComplete,
        ]}
      >
        {showAppHeader && (
          <View style={styles.header}>
            <ThemedText type="default" style={styles.title}>
              Focus
            </ThemedText>
            <ThemedText type="default" style={styles.subtitle}>
              One session at a time.
            </ThemedText>
          </View>
        )}

        {focus.finishedElsewhereMessage && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${focus.finishedElsewhereMessage} Tap to dismiss.`}
            onPress={focus.dismissFinishedElsewhereMessage}
          >
            <Banner variant="info" message={focus.finishedElsewhereMessage} />
          </Pressable>
        )}

        {permissionStatus === 'undetermined' && (
          <View style={styles.permissionCard}>
            <ThemedText type="default" style={styles.permissionText}>
              Get a notification when it&apos;s time for a break.
            </ThemedText>
            <Button
              label="Enable break reminders"
              variant="secondary"
              onPress={handleEnableReminders}
              loading={isRequestingPermission}
            />
          </View>
        )}

        {focus.notificationScheduleError && (
          <View style={styles.notificationErrorRow}>
            <Banner variant="warning" message="Break reminder could not be scheduled. Focus timer still works." />
            <Button label="Retry" variant="text" onPress={focus.retryNotificationSchedule} />
          </View>
        )}

        {permissionStatus === 'denied' && (
          <View style={styles.permissionCard}>
            <ThemedText type="default" style={styles.permissionText}>
              Break reminders are off. Enable notifications for Studora in Settings to get them.
            </ThemedText>
            <Button label="Open Settings" variant="secondary" onPress={() => Linking.openSettings()} />
          </View>
        )}

        <SessionCard
          token={token}
          focus={focus}
          timezone={timezone}
          showComplete={showComplete}
          onDismissComplete={() => setShowComplete(false)}
        />
        <SessionHistory token={token} refreshKey={historyRefreshKey} timezone={timezone} mode={historyMode} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // Focus-only canvas shell — surface.canvas replaces the global lavender
  // background.main so violet reads as a controlled brand accent here.
  safeArea: {
    flex: 1,
    backgroundColor: color.surface.canvas,
  },
  // Mirrors Screen's horizontal/bottom padding (space.lg / xxl so content
  // clears the tab bar); top padding is deliberately tighter than the
  // horizontal padding — the full space.lg top inset read as excess
  // safe-area space above the header.
  content: {
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.xxl,
  },
  // Active/Paused only — lets the content column grow to fill any slack
  // viewport height and center within it (normal flex alignment, not a
  // fixed spacer or absolute positioning) instead of clustering at the
  // top with empty space below. Still scrolls normally if content is
  // taller than the viewport, since flexGrow only ever adds slack, never
  // shrinks content.
  contentInSession: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  // Complete only — removes the small top gap so completeMintSurface
  // (rendered inside SessionCard) starts flush against the safe-area
  // inset, continuing completeTopInsetFill's color with no seam.
  contentComplete: {
    paddingTop: 0,
  },
  // Complete only — bounded strictly to the safe-area inset height (see
  // the height override where this is used), never flex:1, so it never
  // bleeds mint into any gap further down the screen.
  completeTopInsetFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: color.accent.mint,
  },
  header: {
    gap: 2,
  },
  // Dark-text at display size (~28/34) per the approved reference — the
  // previous heading-size (20/26) title read as too small. Still
  // deliberately text.primary rather than primary.violet, which is what
  // made the earlier display-sized version read as oversized/branded.
  title: {
    fontSize: typeTokens.display.fontSize,
    lineHeight: typeTokens.display.lineHeight,
    fontWeight: '700',
    color: color.text.primary,
  },
  subtitle: {
    fontSize: typeTokens.caption.fontSize,
    lineHeight: typeTokens.caption.lineHeight,
    color: color.text.secondary,
  },
  permissionCard: {
    gap: space.sm,
    backgroundColor: color.background.card,
    borderRadius: radius.card,
    padding: space.md,
  },
  permissionText: {
    fontSize: typeTokens.body.fontSize,
    color: color.text.secondary,
  },
  notificationErrorRow: {
    gap: space.xs,
  },
});
