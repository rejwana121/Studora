import { Redirect, Stack } from 'expo-router';

import { useSession } from '@/features/auth/session-context';

export default function AuthLayout() {
  const { session } = useSession();

  if (session) return <Redirect href="/(app)/(tabs)" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
