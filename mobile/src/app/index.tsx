import { Redirect } from 'expo-router';

import { useSession } from '@/features/auth/session-context';

export default function Index() {
  const { session } = useSession();

  return <Redirect href={session ? '/(app)/(tabs)' : '/(auth)/welcome'} />;
}
