import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getProfile } from '@/api/profile';
import { Banner } from '@/components/banner';
import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { signOut } from '@/features/auth/auth-service';
import { useSession } from '@/features/auth/session-context';
import type { Profile } from '@/types/api';
import { color, radius, space, type as typeTokens } from '@/design-system/tokens';

export default function AuthenticatedHome() {
  const { session } = useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    if (!session) return;

    let isMounted = true;
    setIsLoading(true);
    getProfile(session.access_token).then((result) => {
      if (!isMounted) return;
      if (result.ok) {
        setProfile(result.data);
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <ThemedText type="default" style={styles.title}>
          Studora
        </ThemedText>
        <ThemedText type="default" style={styles.status}>
          Phase 3 — Authentication
        </ThemedText>

        {isLoading && <ActivityIndicator color={color.primary.violet} />}
        {loadError && <Banner variant="error" message={loadError} />}

        {profile && (
          <View style={styles.card}>
            <InfoRow label="Signed in as" value={session?.user.email ?? 'Unknown'} />
            <InfoRow label="Display name" value={profile.display_name ?? '—'} />
            <InfoRow label="Timezone" value={profile.timezone} />
          </View>
        )}

        <Button label="Sign Out" variant="secondary" onPress={handleSignOut} loading={isSigningOut} />
      </View>
    </SafeAreaView>
  );
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
  safeArea: {
    flex: 1,
    backgroundColor: color.background.main,
  },
  content: {
    flex: 1,
    padding: space.lg,
    gap: space.md,
  },
  title: {
    fontSize: typeTokens.display.fontSize,
    lineHeight: typeTokens.display.lineHeight,
    fontWeight: '700',
    color: color.primary.violet,
  },
  status: {
    fontSize: typeTokens.caption.fontSize,
    color: color.text.secondary,
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: color.background.card,
    borderRadius: radius.card,
    padding: space.md,
    gap: space.sm,
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
