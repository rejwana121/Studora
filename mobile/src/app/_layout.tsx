import * as Notifications from 'expo-notifications';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { SessionProvider, useSession } from '@/features/auth/session-context';
import { color } from '@/design-system/tokens';

SplashScreen.preventAutoHideAsync().catch(() => {});

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

  useEffect(() => {
    if (!isLoading) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [isLoading]);

  // Native keeps the OS splash screen visible for this whole window (hidden
  // above once isLoading flips false), so this only ever paints on web —
  // where there is no native splash, and this is also the moment the
  // client is parsing a possible email-confirmation redirect from the URL.
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
