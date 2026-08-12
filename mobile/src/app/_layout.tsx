import * as Notifications from 'expo-notifications';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { Asset } from 'expo-asset';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { SessionProvider, useSession } from '@/features/auth/session-context';
import { color } from '@/design-system/tokens';

SplashScreen.preventAutoHideAsync().catch(() => {});

// Preload all four auth hero images while the OS splash screen is still
// visible (i.e. before SplashScreen.hideAsync runs). Asset.loadAsync
// resolves only after the files are fully decoded into memory, so the
// first auth screen the user sees has its hero already ready —
// eliminating the blank-then-pop-in on physical iPhone.
async function preloadAuthAssets(): Promise<void> {
  await Asset.loadAsync([
    require('../../assets/images/studora-welcome-hero-crop-opt.png'),
    require('../../assets/images/studora-sign-in-hero-opt.jpg'),
    require('../../assets/images/studora-sign-up-hero-opt.jpg'),
    require('../../assets/images/studora-reset-password-hero-opt.jpg'),
  ]);
}

// Registered at module scope — before auth resolves, before any route
// renders — so foreground notification presentation works even for a
// signed-out user. `setNotificationHandler` has no unregister API and
// must exist before a notification could ever arrive; it must not depend
// on the authenticated NotificationCoordinator having mounted. This app
// only ever schedules focus-break local notifications in 9B, so the
// handler does not need to branch on notification type: always allow the
// banner/list/sound (locked rule: never risk silently dropping the
// alert) and never set a badge.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function RootNavigator() {
  const { isLoading } = useSession();
  const [assetsReady, setAssetsReady] = useState(false);

  // Start asset preload once on mount — runs while the session check is
  // also in flight so the two resolve in parallel, not sequentially.
  // A failure here never blocks the app: the slightly-larger originals
  // are still accessible via the same require() paths as a fallback.
  useEffect(() => {
    let cancelled = false;
    preloadAuthAssets()
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setAssetsReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // Keep the OS splash visible until both the session check and the
    // asset preload have resolved — eliminates hero pop-in on iPhone.
    if (!isLoading && assetsReady) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [isLoading, assetsReady]);

  // Native keeps the OS splash screen visible for this whole window (hidden
  // above once isLoading and assetsReady both flip true), so this only ever
  // paints on web — where there is no native splash, and this is also the
  // moment the client is parsing a possible email-confirmation redirect from
  // the URL.
  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={color.primary.violet} />
      </View>
    );
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  return (
    <SessionProvider>
      <RootNavigator />
    </SessionProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.background.card,
  },
});
