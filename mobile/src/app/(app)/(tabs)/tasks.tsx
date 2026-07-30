import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { listTasks } from '@/api/tasks';
import { Banner } from '@/components/banner';
import { EmptyState } from '@/components/empty-state';
import { Fab } from '@/components/fab';
import { Screen } from '@/components/screen';
import { TaskRow } from '@/components/task-row';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { useSession } from '@/features/auth/session-context';
import { color, radius, space, type as typeTokens } from '@/design-system/tokens';
import type { Task } from '@/types/api';

type Segment = 'all' | 'upcoming' | 'overdue' | 'completed';

const SEGMENTS: { key: Segment; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'completed', label: 'Completed' },
];

function matchesSegment(task: Task, segment: Segment, now: number): boolean {
  const isActive = task.status === 'Pending' || task.status === 'InProgress';
  const deadlineMs = new Date(task.deadline).getTime();
  switch (segment) {
    case 'all':
      return true;
    case 'upcoming':
      return isActive && deadlineMs >= now;
    case 'overdue':
      return isActive && deadlineMs < now;
    case 'completed':
      return task.status === 'Completed';
  }
}

export default function TasksScreen() {
  const { session } = useSession();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [segment, setSegment] = useState<Segment>('all');
  const [search, setSearch] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const isFetchingRef = useRef(false);

  const load = useCallback(
    (isRefresh = false) => {
      if (!session || isFetchingRef.current) return;
      isFetchingRef.current = true;
      if (isRefresh) setIsRefreshing(true);
      else setIsLoading(true);
      listTasks(session.access_token, { sort: 'deadline_asc', limit: 100 }).then((result) => {
        isFetchingRef.current = false;
        if (result.ok) {
          setTasks(result.data);
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

  const filtered = useMemo(() => {
    if (!tasks) return [];
    const now = Date.now();
    const query = search.trim().toLowerCase();
    return tasks.filter(
      (task) => matchesSegment(task, segment, now) && (!query || task.title.toLowerCase().includes(query))
    );
  }, [tasks, segment, search]);

  return (
    <Screen style={styles.screen}>
      <ThemedText type="default" style={styles.title}>
        Tasks
      </ThemedText>

      <TextField label="Search" value={search} onChangeText={setSearch} placeholder="Search tasks" />

      <View style={styles.segmentRow}>
        {SEGMENTS.map((s) => {
          const selected = s.key === segment;
          return (
            <Pressable
              key={s.key}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => setSegment(s.key)}
              style={[styles.segment, selected && styles.segmentSelected]}
            >
              <ThemedText
                type="default"
                style={[styles.segmentLabel, selected && styles.segmentLabelSelected]}
              >
                {s.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      {isLoading && <ActivityIndicator color={color.primary.violet} />}
      {!isLoading && loadError && <Banner variant="error" message={loadError} />}

      {!isLoading && !loadError && tasks && tasks.length === 0 && (
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

      {!isLoading && !loadError && tasks && tasks.length > 0 && filtered.length === 0 && (
        <ScrollView
          contentContainerStyle={styles.emptyScroll}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => load(true)} />}
        >
          <EmptyState message={`No ${segment === 'all' ? '' : segment} tasks`} />
        </ScrollView>
      )}

      {!isLoading && !loadError && filtered.length > 0 && (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TaskRow task={item} onPress={() => router.push(`/tasks/${item.id}` as Href)} />
          )}
          ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
          style={styles.listFlex}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => load(true)} />}
        />
      )}

      <Fab accessibilityLabel="Add task" onPress={() => router.push('/tasks/new' as Href)} />
    </Screen>
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
  segmentRow: {
    flexDirection: 'row',
    gap: space.xs,
  },
  segment: {
    flex: 1,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    alignItems: 'center',
    backgroundColor: color.background.card,
  },
  segmentSelected: {
    backgroundColor: color.primary.violet,
  },
  segmentLabel: {
    fontSize: typeTokens.caption.fontSize,
    color: color.text.secondary,
    fontWeight: '600',
  },
  segmentLabelSelected: {
    color: color.text.onFill,
  },
  listFlex: {
    flex: 1,
  },
  emptyScroll: {
    flexGrow: 1,
  },
  list: {
    paddingBottom: space.xxl,
  },
});
