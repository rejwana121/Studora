import { Redirect, Stack } from 'expo-router';

import { useSession } from '@/features/auth/session-context';

export default function AuthLayout() {
  const { session } = useSession();

  if (session) return <Redirect href="/(app)" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
