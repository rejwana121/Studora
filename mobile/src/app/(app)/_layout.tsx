import { Redirect, Stack } from 'expo-router';

import { useSession } from '@/features/auth/session-context';
import { NotificationCoordinatorProvider } from '@/features/notifications/notification-coordinator';

export default function AppLayout() {
  const { session } = useSession();

  if (!session) return <Redirect href="/(auth)/welcome" />;

  return (
    <NotificationCoordinatorProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        {/* Tasks-only: 'fullScreenModal' instead of the other modal routes'
         * 'modal' (iOS page-sheet — rounded corners, dimmed page peeking
         * around the edges), per the approved Tasks reference's full-screen
         * presentation. Every other modal route below is deliberately left
         * on 'modal' — this does not change their presentation. */}
        <Stack.Screen name="tasks/new" options={{ presentation: 'fullScreenModal' }} />
        <Stack.Screen name="tasks/[id]/index" />
        <Stack.Screen name="tasks/[id]/edit" options={{ presentation: 'fullScreenModal' }} />
        <Stack.Screen name="subjects/new" options={{ presentation: 'modal' }} />
        <Stack.Screen name="subjects/[id]/edit" options={{ presentation: 'modal' }} />
        <Stack.Screen name="planner/blocks/new" options={{ presentation: 'modal' }} />
        <Stack.Screen name="planner/blocks/[id]/edit" options={{ presentation: 'modal' }} />
        <Stack.Screen name="profile/subjects/index" />
        <Stack.Screen name="profile/plans-billing" />
        <Stack.Screen name="workload" />
      </Stack>
    </NotificationCoordinatorProvider>
  );
}
