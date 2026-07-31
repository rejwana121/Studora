import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { getTasksToday } from '@/api/tasks';
import { Banner } from '@/components/banner';
import { EmptyState } from '@/components/empty-state';
import { Fab } from '@/components/fab';
import { Screen } from '@/components/screen';
import { TaskRow } from '@/components/task-row';
import { ThemedText } from '@/components/themed-text';
import { useSession } from '@/features/auth/session-context';
import { color, radius, space, type as typeTokens } from '@/design-system/tokens';
import type { Task, TaskTodayView } from '@/types/api';

export default function TodayScreen() {
  const { session } = useSession();
  const [view, setView] = useState<TaskTodayView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const isFetchingRef = useRef(false);

  const load = useCallback(
    (isRefresh = false) => {
      if (!session || isFetchingRef.current) return;
      isFetchingRef.current = true;
      if (isRefresh) setIsRefreshing(true);
      else setIsLoading(true);
      getTasksToday(session.access_token).then((result) => {
        isFetchingRef.current = false;
        if (result.ok) {
          setView(result.data);
          setLoadError(null);
        } else {
          setLoadError(result.error.message);
        }
        if (isRefresh) setIsRefreshing(false);
        else setIsLoading(false);
      });
    },
    [session]
  );

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

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Check your workload"
        onPress={() => router.push('/workload' as Href)}
        style={({ pressed }) => [styles.workloadEntry, pressed && styles.workloadEntryPressed]}
      >
        <ThemedText type="default" style={styles.workloadEntryText}>
          Check your workload
        </ThemedText>
        <ThemedText type="default" style={styles.workloadEntryChevron}>
          ›
        </ThemedText>
      </Pressable>

      {isLoading && <ActivityIndicator color={color.primary.violet} />}
      {!isLoading && loadError && <Banner variant="error" message={loadError} />}

      {!isLoading && !loadError && isEmpty && (
        <ScrollView
          contentContainerStyle={styles.emptyScroll}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => load(true)} />}
        >
          <EmptyState
            message="No tasks yet"
            actionLabel="Add your first task"
            onAction={() => router.push('/tasks/new' as Href)}
          />
        </ScrollView>
      )}

      {!isLoading && !loadError && view && !isEmpty && (
        <ScrollView
          contentContainerStyle={styles.sections}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => load(true)} />}
        >
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
  workloadEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: color.background.card,
    borderRadius: radius.card,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  workloadEntryPressed: {
    opacity: 0.7,
  },
  workloadEntryText: {
    fontSize: typeTokens.body.fontSize,
    fontWeight: '600',
    color: color.text.primary,
  },
  workloadEntryChevron: {
    fontSize: typeTokens.subheading.fontSize,
    color: color.text.secondary,
  },
  emptyScroll: {
    flexGrow: 1,
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
