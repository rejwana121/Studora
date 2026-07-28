import * as Notifications from 'expo-notifications';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

import { SessionProvider, useSession } from '@/features/auth/session-context';

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

  if (isLoading) return null;

  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  return (
    <SessionProvider>
      <RootNavigator />
    </SessionProvider>
  );
}
