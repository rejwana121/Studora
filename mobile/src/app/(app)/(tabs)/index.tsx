import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { getTasksToday } from '@/api/tasks';
import { Banner } from '@/components/banner';
import { EmptyState } from '@/components/empty-state';
import { Fab } from '@/components/fab';
import { Screen } from '@/components/screen';
import { TaskRow } from '@/components/task-row';
import { ThemedText } from '@/components/themed-text';
import { useSession } from '@/features/auth/session-context';
import { color, space, type as typeTokens } from '@/design-system/tokens';
import type { Task, TaskTodayView } from '@/types/api';

export default function TodayScreen() {
  const { session } = useSession();
  const [view, setView] = useState<TaskTodayView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(() => {
    if (!session) return;
    setIsLoading(true);
    getTasksToday(session.access_token).then((result) => {
      if (result.ok) {
        setView(result.data);
        setLoadError(null);
      } else {
        setLoadError(result.error.message);
      }
      setIsLoading(false);
    });
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const isEmpty = view && view.pending.length === 0;

  return (
    <Screen style={styles.screen}>
      <ThemedText type="default" style={styles.title}>
        Today
      </ThemedText>
      <ThemedText type="default" style={styles.date}>
        {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
      </ThemedText>

      {isLoading && <ActivityIndicator color={color.primary.violet} />}
      {!isLoading && loadError && <Banner variant="error" message={loadError} />}

      {!isLoading && !loadError && isEmpty && (
        <EmptyState
          message="No tasks yet"
          actionLabel="Add your first task"
          onAction={() => router.push('/tasks/new' as Href)}
        />
      )}

      {!isLoading && !loadError && view && !isEmpty && (
        <ScrollView contentContainerStyle={styles.sections}>
          <Section title="Overdue" tasks={view.overdue} />
          <Section title="Due soon (72h)" tasks={view.due_soon} />
          <Section title="High priority" tasks={view.high_priority} />
          <Section title="Pending" tasks={view.pending} />
        </ScrollView>
      )}

      <Fab accessibilityLabel="Add task" onPress={() => router.push('/tasks/new' as Href)} />
    </Screen>
  );
}

function Section({ title, tasks }: { title: string; tasks: Task[] }) {
  if (tasks.length === 0) return null;
  return (
    <View style={styles.section}>
      <ThemedText type="default" style={styles.sectionHeader}>
        {title}
      </ThemedText>
      <View style={{ gap: space.sm }}>
        {tasks.map((task) => (
          <TaskRow key={task.id} task={task} onPress={() => router.push(`/tasks/${task.id}` as Href)} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    position: 'relative',
  },
  title: {
    fontSize: typeTokens.display.fontSize,
    lineHeight: typeTokens.display.lineHeight,
    fontWeight: '700',
    color: color.primary.violet,
  },
  date: {
    fontSize: typeTokens.caption.fontSize,
    color: color.text.secondary,
    textTransform: 'uppercase',
  },
  sections: {
    gap: space.lg,
    paddingBottom: space.xxl,
  },
  section: {
    gap: space.xs,
  },
  sectionHeader: {
    fontSize: typeTokens.label.fontSize,
    fontWeight: '600',
    color: color.text.secondary,
    textTransform: 'uppercase',
  },
});
