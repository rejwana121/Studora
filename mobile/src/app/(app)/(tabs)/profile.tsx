import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { getProfile, updateProfile } from '@/api/profile';
import { Banner } from '@/components/banner';
import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { signOut } from '@/features/auth/auth-service';
import { useSession } from '@/features/auth/session-context';
import type { Profile } from '@/types/api';
import { color, radius, space, touchTarget, type as typeTokens } from '@/design-system/tokens';

export default function ProfileScreen() {
  const { session } = useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningOut, setIsSigningOut] = useState(false);

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

  async function handleSignOut() {
    setIsSigningOut(true);
    await signOut();
    setIsSigningOut(false);
    router.replace('/(auth)/welcome');
  }

  const email = session?.user.email ?? null;
  const initials = getInitials(profile?.display_name ?? null, email);

  return (
    <Screen>
      <ThemedText type="default" style={styles.title}>
        Profile
      </ThemedText>

      {isLoading && <ActivityIndicator color={color.primary.violet} />}
      {loadError && <Banner variant="error" message={loadError} />}

      {profile && (
        <>
          <View style={styles.headerCard}>
            <View style={styles.avatar}>
              <ThemedText type="default" style={styles.avatarText}>
                {initials}
              </ThemedText>
            </View>
            <View style={styles.headerText}>
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

          <View style={styles.infoCard}>
            <InfoRow label="Account status" value="Signed in" />
            <View style={styles.infoDivider} />
            <InfoRow label="Timezone" value={profile.timezone} />
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Manage Subjects"
            onPress={() => router.push('/profile/subjects' as Href)}
            style={({ pressed }) => [styles.manageRow, pressed && styles.manageRowPressed]}
          >
            <ThemedText type="default" style={styles.manageRowLabel}>
              Manage Subjects
            </ThemedText>
            <ThemedText type="default" style={styles.manageRowChevron}>
              ›
            </ThemedText>
          </Pressable>

          <View style={styles.signOutSection}>
            <Button label="Sign Out" variant="secondary" onPress={handleSignOut} loading={isSigningOut} />
          </View>
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

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <ThemedText type="default" style={styles.infoLabel}>
        {label}
      </ThemedText>
      <ThemedText type="default" style={styles.infoValue}>
        {value}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: typeTokens.display.fontSize,
    lineHeight: typeTokens.display.lineHeight,
    fontWeight: '700',
    color: color.primary.violet,
  },
  headerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: color.background.card,
    borderRadius: radius.card,
    padding: space.md,
    marginTop: space.md,
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
  headerText: {
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
  infoCard: {
    backgroundColor: color.background.card,
    borderRadius: radius.card,
    padding: space.md,
    marginTop: space.md,
  },
  infoDivider: {
    height: 1,
    backgroundColor: color.border.divider,
    marginVertical: space.sm,
  },
  manageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: touchTarget.min,
    backgroundColor: color.background.card,
    borderRadius: radius.card,
    paddingHorizontal: space.md,
    marginTop: space.md,
  },
  manageRowPressed: {
    opacity: 0.7,
  },
  manageRowLabel: {
    fontSize: typeTokens.body.fontSize,
    fontWeight: '600',
    color: color.text.primary,
  },
  manageRowChevron: {
    fontSize: typeTokens.heading.fontSize,
    color: color.text.secondary,
  },
  signOutSection: {
    marginTop: space.xl,
    paddingTop: space.md,
    borderTopWidth: 1,
    borderTopColor: color.border.divider,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  infoLabel: {
    color: color.text.secondary,
    fontSize: typeTokens.body.fontSize,
  },
  infoValue: {
    color: color.text.primary,
    fontSize: typeTokens.body.fontSize,
    fontWeight: '600',
  },
});
