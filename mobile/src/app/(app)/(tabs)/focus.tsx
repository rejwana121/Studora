import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Banner } from '@/components/banner';
import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { useSession } from '@/features/auth/session-context';
import { SessionCard } from '@/features/focus/session-card';
import { SessionHistory } from '@/features/focus/session-history';
import { useFocusSession } from '@/features/focus/use-focus-session';
import { useNotificationCoordinator } from '@/features/notifications/notification-coordinator';
import { color, radius, space, type as typeTokens } from '@/design-system/tokens';

export default function FocusScreen() {
  const { session } = useSession();
  const token = session?.access_token ?? null;
  const focus = useFocusSession(token);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const { permissionStatus, requestPermission, focusBreakIntentVersion } = useNotificationCoordinator();
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  // `null` never equals a real intent version, so the first effect run
  // after mount always compares against whatever version is already
  // present — this is what makes an intent that fired before Focus
  // mounted still get consumed exactly once.
  const consumedIntentRef = useRef<number | null>(null);
  // Same "never equals a real version" convention as consumedIntentRef —
  // makes a finish that completed before this effect first ran still get
  // consumed exactly once, and keeps the 0 sentinel from ever triggering
  // a spurious history refresh on mount.
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

  // Semantically separate from finishedElsewhereMessage above — this is
  // specifically a finish completed on THIS device, never re-using the
  // "elsewhere" copy/signal for a same-device event.
  useEffect(() => {
    if (consumedFinishRef.current === focus.finishedJustNowVersion) return;
    consumedFinishRef.current = focus.finishedJustNowVersion;
    if (focus.finishedJustNowVersion === 0) return; // 0 = no local finish has happened yet
    setHistoryRefreshKey((k) => k + 1);
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

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="default" style={styles.title}>
          Focus
        </ThemedText>

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

        <SessionCard token={token} focus={focus} />
        <SessionHistory token={token} refreshKey={historyRefreshKey} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: space.md,
    paddingBottom: space.xxl,
  },
  title: {
    fontSize: typeTokens.display.fontSize,
    lineHeight: typeTokens.display.lineHeight,
    fontWeight: '700',
    color: color.primary.violet,
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
