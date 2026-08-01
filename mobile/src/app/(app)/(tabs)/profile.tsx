import Constants from 'expo-constants';
import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, View } from 'react-native';

import { getProfile, updateProfile } from '@/api/profile';
import { Banner } from '@/components/banner';
import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { requestPasswordReset, signOut } from '@/features/auth/auth-service';
import { useSession } from '@/features/auth/session-context';
import { useNotificationCoordinator } from '@/features/notifications/notification-coordinator';
import type { Profile } from '@/types/api';
import { color, radius, space, touchTarget, type as typeTokens } from '@/design-system/tokens';

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

export default function ProfileScreen() {
  const { session } = useSession();
  const { permissionStatus, requestPermission } = useNotificationCoordinator();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isRequestingNotifications, setIsRequestingNotifications] = useState(false);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [resetFeedback, setResetFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  useEffect(() => {
    if (!session) return;

    let isMounted = true;
    setIsLoading(true);
    getProfile(session.access_token).then(async (result) => {
      if (!isMounted) return;
      if (result.ok) {
        let nextProfile = result.data;
        const deviceTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (deviceTimezone && deviceTimezone !== nextProfile.timezone) {
          const syncResult = await updateProfile(session.access_token, { timezone: deviceTimezone });
          if (!isMounted) return;
          if (syncResult.ok) nextProfile = syncResult.data;
        }
        setProfile(nextProfile);
        setLoadError(null);
      } else {
        setLoadError(result.error.message);
      }
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
    };
  }, [session]);

  async function confirmSignOut() {
    setIsSigningOut(true);
    await signOut();
    setIsSigningOut(false);
    router.replace('/(auth)/welcome');
  }

  function handleSignOut() {
    Alert.alert('Sign out?', "You'll need to sign in again to access your Studora account.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', onPress: confirmSignOut },
    ]);
  }

  async function handleNotificationsPress() {
    setNotificationsError(null);
    if (permissionStatus === 'undetermined') {
      setIsRequestingNotifications(true);
      try {
        await requestPermission();
      } catch {
        setNotificationsError('Could not update notification settings.');
      }
      setIsRequestingNotifications(false);
    } else if (permissionStatus === 'denied') {
      try {
        await Linking.openSettings();
      } catch {
        setNotificationsError('Could not open Settings.');
      }
    }
  }

  async function handleResetPassword() {
    const email = session?.user.email;
    if (!email || isSendingReset) return;
    setIsSendingReset(true);
    setResetFeedback(null);
    const result = await requestPasswordReset(email);
    setIsSendingReset(false);
    setResetFeedback(
      result.ok
        ? { type: 'success', message: 'Reset link sent to your email.' }
        : { type: 'error', message: result.message ?? 'Could not send reset link.' }
    );
  }

  const email = session?.user.email ?? null;
  const initials = getInitials(profile?.display_name ?? null, email);

  const notificationsActionable = permissionStatus === 'undetermined' || permissionStatus === 'denied';
  const notificationsLabel = isRequestingNotifications
    ? '…'
    : permissionStatus === 'granted'
      ? 'On'
      : permissionStatus === 'denied'
        ? 'Off — Open Settings'
        : permissionStatus === 'undetermined'
          ? 'Enable'
          : '…';

  return (
    <Screen>
      <ThemedText type="default" style={styles.title}>
        Profile
      </ThemedText>

      {isLoading && <ActivityIndicator color={color.primary.violet} />}
      {loadError && <Banner variant="error" message={loadError} />}

      {profile && (
        <>
          <View style={styles.identityHeader}>
            <View style={styles.avatar}>
              <ThemedText type="default" style={styles.avatarText}>
                {initials}
              </ThemedText>
            </View>
            <View style={styles.identityText}>
              <ThemedText type="default" style={styles.displayName} numberOfLines={1}>
                {profile.display_name ?? email ?? 'Studora User'}
              </ThemedText>
              {profile.display_name && email && (
                <ThemedText type="default" style={styles.email} numberOfLines={1}>
                  {email}
                </ThemedText>
              )}
            </View>
          </View>

          <ThemedText type="default" style={styles.sectionHeader}>
            Academic
          </ThemedText>
          <View style={styles.group}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Manage Subjects"
              onPress={() => router.push('/profile/subjects' as Href)}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            >
              <ThemedText type="default" style={styles.rowLabel}>
                Manage Subjects
              </ThemedText>
              <ThemedText type="default" style={styles.chevron}>
                ›
              </ThemedText>
            </Pressable>
          </View>

          <ThemedText type="default" style={styles.sectionHeader}>
            Preferences
          </ThemedText>
          <View style={styles.group}>
            <View style={styles.row}>
              <ThemedText type="default" style={styles.rowLabel}>
                Timezone
              </ThemedText>
              <ThemedText type="default" style={styles.rowValue} numberOfLines={1}>
                {profile.timezone}
              </ThemedText>
            </View>
            <View style={styles.divider} />
            {notificationsActionable ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Notifications: ${notificationsLabel}`}
                onPress={handleNotificationsPress}
                disabled={isRequestingNotifications}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              >
                <ThemedText type="default" style={styles.rowLabel}>
                  Notifications
                </ThemedText>
                <ThemedText type="default" style={[styles.rowValue, styles.rowValueAction]} numberOfLines={1}>
                  {notificationsLabel}
                </ThemedText>
              </Pressable>
            ) : (
              <View style={styles.row}>
                <ThemedText type="default" style={styles.rowLabel}>
                  Notifications
                </ThemedText>
                <ThemedText type="default" style={styles.rowValue} numberOfLines={1}>
                  {notificationsLabel}
                </ThemedText>
              </View>
            )}
            {notificationsError && (
              <ThemedText type="default" style={styles.inlineError}>
                {notificationsError}
              </ThemedText>
            )}
          </View>

          <ThemedText type="default" style={styles.sectionHeader}>
            Security
          </ThemedText>
          <View style={styles.group}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Reset Password"
              onPress={handleResetPassword}
              disabled={isSendingReset}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            >
              <ThemedText type="default" style={styles.rowLabelAction}>
                {isSendingReset ? 'Sending…' : 'Reset Password'}
              </ThemedText>
            </Pressable>
            {resetFeedback && (
              <ThemedText
                type="default"
                style={resetFeedback.type === 'success' ? styles.inlineSuccess : styles.inlineError}
              >
                {resetFeedback.message}
              </ThemedText>
            )}
          </View>

          <View style={styles.signOutBlock}>
            <Button label="Sign Out" variant="text" onPress={handleSignOut} loading={isSigningOut} />
          </View>

          <ThemedText type="default" style={styles.footer}>
            Studora v{APP_VERSION}
          </ThemedText>
        </>
      )}
    </Screen>
  );
}

function getInitials(displayName: string | null, email: string | null): string {
  const source = (displayName && displayName.trim()) || email || 'Studora User';
  const words = source.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

const styles = StyleSheet.create({
  title: {
    fontSize: typeTokens.display.fontSize,
    lineHeight: typeTokens.display.lineHeight,
    fontWeight: '700',
    color: color.primary.violet,
  },
  identityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginTop: space.lg,
    marginBottom: space.lg,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: color.primary.violet,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: color.text.onFill,
    fontSize: typeTokens.heading.fontSize,
    fontWeight: '700',
  },
  identityText: {
    flex: 1,
    gap: space.xs,
  },
  displayName: {
    color: color.text.primary,
    fontSize: typeTokens.subheading.fontSize,
    lineHeight: typeTokens.subheading.lineHeight,
    fontWeight: '600',
  },
  email: {
    color: color.text.secondary,
    fontSize: typeTokens.caption.fontSize,
  },
  sectionHeader: {
    fontSize: typeTokens.label.fontSize,
    fontWeight: '600',
    color: color.text.secondary,
    textTransform: 'uppercase',
    marginTop: space.md,
    marginBottom: space.xs,
  },
  group: {
    backgroundColor: color.background.card,
    borderRadius: radius.card,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: touchTarget.min,
    paddingHorizontal: space.md,
    gap: space.sm,
  },
  rowPressed: {
    opacity: 0.7,
  },
  divider: {
    height: 1,
    backgroundColor: color.border.divider,
    marginHorizontal: space.md,
  },
  rowLabel: {
    fontSize: typeTokens.body.fontSize,
    color: color.text.primary,
    flexShrink: 1,
  },
  rowLabelAction: {
    fontSize: typeTokens.body.fontSize,
    fontWeight: '600',
    color: color.primary.violet,
  },
  rowValue: {
    fontSize: typeTokens.body.fontSize,
    color: color.text.secondary,
    flexShrink: 1,
    textAlign: 'right',
  },
  rowValueAction: {
    color: color.primary.violet,
    fontWeight: '600',
  },
  chevron: {
    fontSize: typeTokens.heading.fontSize,
    color: color.text.secondary,
  },
  inlineError: {
    fontSize: typeTokens.caption.fontSize,
    color: color.risk.high.text,
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
  },
  inlineSuccess: {
    fontSize: typeTokens.caption.fontSize,
    color: color.text.secondary,
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
  },
  signOutBlock: {
    alignItems: 'center',
    marginTop: space.xl,
  },
  footer: {
    fontSize: typeTokens.caption.fontSize,
    color: color.text.secondary,
    textAlign: 'center',
    marginTop: space.md,
    marginBottom: space.lg,
  },
});
