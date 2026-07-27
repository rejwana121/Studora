import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { Banner } from '@/components/banner';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { useSession } from '@/features/auth/session-context';
import { SessionCard } from '@/features/focus/session-card';
import { SessionHistory } from '@/features/focus/session-history';
import { useFocusSession } from '@/features/focus/use-focus-session';
import { color, space, type as typeTokens } from '@/design-system/tokens';

export default function FocusScreen() {
  const { session } = useSession();
  const token = session?.access_token ?? null;
  const focus = useFocusSession(token);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  useFocusEffect(
    useCallback(() => {
      focus.reconcile();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  useEffect(() => {
    if (focus.finishedElsewhereMessage) setHistoryRefreshKey((k) => k + 1);
  }, [focus.finishedElsewhereMessage]);

  if (!token) return null;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="default" style={styles.title}>
          Focus
        </ThemedText>

        {focus.finishedElsewhereMessage && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${focus.finishedElsewhereMessage} Tap to dismiss.`}
            onPress={focus.dismissFinishedElsewhereMessage}
          >
            <Banner variant="info" message={focus.finishedElsewhereMessage} />
          </Pressable>
        )}

        <SessionCard token={token} focus={focus} />
        <SessionHistory token={token} refreshKey={historyRefreshKey} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: space.md,
    paddingBottom: space.xxl,
  },
  title: {
    fontSize: typeTokens.display.fontSize,
    lineHeight: typeTokens.display.lineHeight,
    fontWeight: '700',
    color: color.primary.violet,
  },
});
