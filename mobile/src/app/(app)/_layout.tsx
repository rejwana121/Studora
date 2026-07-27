import { Redirect, Stack } from 'expo-router';

import { useSession } from '@/features/auth/session-context';

export default function AppLayout() {
  const { session } = useSession();

  if (!session) return <Redirect href="/(auth)/welcome" />;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="tasks/new" options={{ presentation: 'modal' }} />
      <Stack.Screen name="tasks/[id]/index" />
      <Stack.Screen name="tasks/[id]/edit" options={{ presentation: 'modal' }} />
      <Stack.Screen name="subjects/new" options={{ presentation: 'modal' }} />
      <Stack.Screen name="subjects/[id]/edit" options={{ presentation: 'modal' }} />
      <Stack.Screen name="planner/blocks/new" options={{ presentation: 'modal' }} />
      <Stack.Screen name="planner/blocks/[id]/edit" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
