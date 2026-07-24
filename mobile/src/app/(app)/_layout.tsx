import { Redirect, Stack } from 'expo-router';

import { useSession } from '@/features/auth/session-context';

export default function AppLayout() {
  const { session } = useSession();

  if (!session) return <Redirect href="/(auth)/welcome" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
