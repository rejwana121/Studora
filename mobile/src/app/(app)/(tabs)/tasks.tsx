import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { listTasks, updateTask } from '@/api/tasks';
import { Banner } from '@/components/banner';
import { EmptyState } from '@/components/empty-state';
import { Fab } from '@/components/fab';
import { Icon } from '@/components/icon';
import { TaskRow } from '@/components/task-row';
import { ThemedText } from '@/components/themed-text';
import { useSession } from '@/features/auth/session-context';
import { useNotificationCoordinator } from '@/features/notifications/notification-coordinator';
import { color, radius, space, touchTarget, type as typeTokens } from '@/design-system/tokens';
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
  const { requestDeadlineReconcile, requestWorkloadCheck } = useNotificationCoordinator();
  const insets = useSafeAreaInsets();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [segment, setSegment] = useState<Segment>('all');
  const [search, setSearch] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
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

  // Independent of the current segment/search selection — always a
  // whole-list overview. "Need attention" reuses the exact same
  // active+past-deadline condition the "Overdue" segment already applies
  // (no new/invented criterion). Split into two raw counts (rather than
  // the single joined summary string this used to produce) so the header
  // can render them as two separate stat cards, per the approved reference.
  const stats = useMemo(() => {
    if (!tasks) return null;
    let activeCount = 0;
    let attentionCount = 0;
    for (const task of tasks) {
      const isActive = task.status === 'Pending' || task.status === 'InProgress';
      if (!isActive) continue;
      activeCount += 1;
      if (new Date(task.deadline).getTime() < Date.now()) attentionCount += 1;
    }
    return { activeCount, attentionCount };
  }, [tasks]);

  async function handleToggleComplete(task: Task) {
    // Reuses the exact same call Task Detail's own Complete/Reopen button
    // makes (updateTask with only `status` in the payload) — this just
    // wires a second entry point to it from the list row.
    if (!session || togglingId) return;
    setTogglingId(task.id);
    const nextStatus = task.status === 'Completed' ? 'Pending' : 'Completed';
    const result = await updateTask(session.access_token, task.id, { status: nextStatus });
    setTogglingId(null);
    if (result.ok) {
      setTasks((prev) => (prev ? prev.map((t) => (t.id === task.id ? result.data : t)) : prev));
      requestDeadlineReconcile();
      requestWorkloadCheck();
    } else {
      Alert.alert('Could not update task', result.error.message);
    }
  }

  return (
    // `edges` excludes 'top': SafeAreaView's own canvas background would
    // otherwise paint the status-bar strip a different colour than
    // `headerSurface`'s periwinkle. `headerSurface` absorbs `insets.top`
    // into its own paddingTop instead, so the periwinkle extends
    // continuously through the status bar — same single inset, just
    // relocated onto the periwinkle element; header height/content
    // position is unchanged.
    <SafeAreaView style={styles.outerSafeArea} edges={['left', 'right', 'bottom']}>
      <View style={[styles.headerSurface, { paddingTop: insets.top + space.sm }]}>
        <ThemedText type="default" style={styles.headerTitle}>
          Tasks
        </ThemedText>

        {stats && (
          <View style={styles.summaryRow}>
            <SummaryStat icon="checkmark-circle" tone="teal" value={stats.activeCount} label="active" />
            <SummaryStat icon="alert-circle" tone="coral" value={stats.attentionCount} label="need attention" />
          </View>
        )}

        <View style={styles.searchField}>
          <Icon name="search-outline" size="sm" color={color.text.secondary} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search tasks"
            placeholderTextColor={color.text.disabled}
            accessibilityLabel="Search tasks"
            returnKeyType="search"
          />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.segmentRow}
        >
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
                  numberOfLines={1}
                >
                  {s.label}
                </ThemedText>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.bodyColumn}>
        {isLoading && <ActivityIndicator style={styles.loading} color={color.primary.violet} />}
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
              <TaskRow
                task={item}
                variant="grouped"
                onPress={() => router.push(`/tasks/${item.id}` as Href)}
                onToggleComplete={() => handleToggleComplete(item)}
                isTogglingComplete={togglingId === item.id}
              />
            )}
            ItemSeparatorComponent={() => <View style={styles.cardGap} />}
            ListFooterComponent={<View style={{ height: insets.bottom + 88 }} />}
            style={styles.listFlex}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => load(true)} />}
          />
        )}
      </View>

      <Fab
        accessibilityLabel="Add task"
        onPress={() => router.push('/tasks/new' as Href)}
        bottomOffset={insets.bottom + space.lg}
      />
    </SafeAreaView>
  );
}

const SUMMARY_TONE = {
  teal: { bg: color.secondary.teal },
  coral: { bg: color.accent.coral },
} as const;

function SummaryStat({
  icon,
  tone,
  value,
  label,
}: {
  icon: React.ComponentProps<typeof Icon>['name'];
  tone: keyof typeof SUMMARY_TONE;
  value: number;
  label: string;
}) {
  return (
    <View style={styles.summaryCard} accessible accessibilityLabel={`${value} ${label}`}>
      <View style={[styles.summaryIconCircle, { backgroundColor: SUMMARY_TONE[tone].bg }]}>
        <Icon name={icon} size="sm" color={color.text.onFill} />
      </View>
      <ThemedText type="default" style={styles.summaryText} numberOfLines={1}>
        {value} {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  outerSafeArea: {
    flex: 1,
    backgroundColor: color.surface.canvas,
  },
  headerSurface: {
    backgroundColor: color.surface.headerSoft,
    paddingHorizontal: space.lg,
    // paddingTop is set inline (insets.top + space.sm) — see the render's
    // comment on why the SafeAreaView above excludes the 'top' edge.
    paddingBottom: space.md,
    borderBottomLeftRadius: radius.card,
    borderBottomRightRadius: radius.card,
    gap: space.sm,
  },
  headerTitle: {
    fontSize: typeTokens.display.fontSize,
    lineHeight: typeTokens.display.lineHeight,
    fontWeight: '700',
    color: color.text.primary,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: space.sm,
  },
  summaryCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    backgroundColor: color.background.card,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: color.border.divider,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
  },
  summaryIconCircle: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryText: {
    flex: 1,
    fontSize: typeTokens.label.fontSize,
    fontWeight: '700',
    color: color.text.primary,
  },
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: touchTarget.min,
    backgroundColor: color.background.card,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: color.border.divider,
    paddingHorizontal: space.md,
  },
  searchInput: {
    flex: 1,
    fontSize: typeTokens.body.fontSize,
    color: color.text.primary,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: space.xs,
  },
  segment: {
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: color.border.divider,
    backgroundColor: color.background.card,
  },
  segmentSelected: {
    backgroundColor: color.primary.violet,
    borderColor: color.primary.violet,
  },
  segmentLabel: {
    fontSize: typeTokens.caption.fontSize,
    color: color.primary.violet,
    fontWeight: '600',
  },
  segmentLabelSelected: {
    color: color.text.onFill,
  },
  bodyColumn: {
    flex: 1,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
  },
  loading: {
    marginTop: space.lg,
  },
  listFlex: {
    flex: 1,
  },
  emptyScroll: {
    flexGrow: 1,
  },
  list: {
    paddingTop: 0,
  },
  cardGap: {
    height: space.sm,
  },
});
