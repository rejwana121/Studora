import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { getDay } from '@/api/planner';
import { getTasksToday, updateTask } from '@/api/tasks';
import { Avatar } from '@/components/avatar';
import { Banner } from '@/components/banner';
import { EmptyState } from '@/components/empty-state';
import { Icon } from '@/components/icon';
import { SectionCard } from '@/components/section-card';
import { StatRow, StatTile } from '@/components/stat-tile';
import { ThemedText } from '@/components/themed-text';
import { useSession } from '@/features/auth/session-context';
import { useNotificationCoordinator } from '@/features/notifications/notification-coordinator';
import { toZonedDateString } from '@/lib/date';
import {
  color,
  priorityBadgeTone,
  radius,
  space,
  taskTypeIcon,
  touchTarget,
  type as typeTokens,
} from '@/design-system/tokens';
import type { StudyBlockRead, Task, TaskTodayView } from '@/types/api';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function formatBlockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function formatDueShort(iso: string): string {
  return `Due ${new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

export default function TodayScreen() {
  const { session, profile, avatarSignedUrl } = useSession();
  const { requestDeadlineReconcile, requestWorkloadCheck } = useNotificationCoordinator();
  const insets = useSafeAreaInsets();
  const [view, setView] = useState<TaskTodayView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [nextBlock, setNextBlock] = useState<StudyBlockRead | null>(null);
  const isFetchingRef = useRef(false);
  const isBlockFetchingRef = useRef(false);

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

  // Bonus card only — deliberately silent (no banner, no toggling flag)
  // on any failure or timezone misalignment: falls back to simply not
  // rendering the section, per "omit cleanly, never fake it." Reuses the
  // same Planner `getDay` endpoint and the same timezone-alignment
  // precondition Planner's own day view already requires (Profile.timezone
  // read from the shared session context — no second profile fetch).
  const loadNextBlock = useCallback(() => {
    const deviceTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const isAligned = profile !== null && profile.timezone === deviceTimezone;
    if (!session || !profile || !isAligned || isBlockFetchingRef.current) {
      if (!isAligned) setNextBlock(null);
      return;
    }
    isBlockFetchingRef.current = true;
    const today = toZonedDateString(new Date(), profile.timezone);
    getDay(session.access_token, today).then((result) => {
      isBlockFetchingRef.current = false;
      if (!result.ok) {
        setNextBlock(null);
        return;
      }
      const now = Date.now();
      const upcoming = result.data.study_blocks
        .filter((block) => new Date(block.ends_at).getTime() > now)
        .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
      setNextBlock(upcoming[0] ?? null);
    });
  }, [session, profile]);

  useFocusEffect(
    useCallback(() => {
      load();
      loadNextBlock();
    }, [load, loadNextBlock])
  );

  // One-task-one-placement: each task_id renders in exactly one section,
  // by precedence Overdue → Due Soon → High Priority → Pending — the
  // backend's four groups are intentionally overlapping (a task can
  // belong to several), so without this a task would render once per
  // matching group. Filters (never mutates) each source group's own
  // array, so within-group order from the API is preserved.
  const sections = useMemo(() => {
    if (!view) return null;
    const seen = new Set<string>();
    function placeInto(tasks: Task[]): Task[] {
      const placed = tasks.filter((task) => !seen.has(task.id));
      for (const task of placed) seen.add(task.id);
      return placed;
    }
    return {
      overdue: placeInto(view.overdue),
      dueSoon: placeInto(view.due_soon),
      highPriority: placeInto(view.high_priority),
      pending: placeInto(view.pending),
    };
  }, [view]);

  const isEmpty =
    sections !== null &&
    sections.overdue.length === 0 &&
    sections.dueSoon.length === 0 &&
    sections.highPriority.length === 0 &&
    sections.pending.length === 0;

  // Pure read of `sections`' already-deduplicated, precedence-ordered
  // output — same Overdue → Due soon → High priority → Pending order,
  // just capped to the top 3 for the compact "Priority tasks" card list
  // instead of rendering every group in full.
  const priorityTasks = useMemo(() => {
    if (!sections) return [];
    return [...sections.overdue, ...sections.dueSoon, ...sections.highPriority, ...sections.pending].slice(0, 3);
  }, [sections]);

  // Pure read of `sections`' already-deduplicated output — does not alter
  // the precedence/dedup memo above. "Focus today" is deliberately not
  // shown: Today never fetches session data, so no such number exists
  // without a new network call; "Due soon" (already computed) stands in.
  const stats = useMemo(() => {
    if (!sections) return null;
    return {
      active: sections.overdue.length + sections.dueSoon.length + sections.highPriority.length + sections.pending.length,
      overdue: sections.overdue.length,
      dueSoon: sections.dueSoon.length,
    };
  }, [sections]);

  const showHero = stats !== null && !isEmpty;
  const overdueCount = stats?.overdue ?? 0;
  const activeCount = stats?.active ?? 0;
  const dueSoonCount = stats?.dueSoon ?? 0;

  // Reuses the exact same call Task Detail's own Complete button and the
  // Tasks list's row toggle already make (`updateTask` with only `status`
  // in the payload), then removes the task from every bucket of local
  // `view` state so `sections`/`priorityTasks` immediately stop showing
  // it — same "workload/deadline reconciliation" side effects Tasks'
  // toggle already triggers, no new mutation behavior invented.
  async function handleToggleComplete(task: Task) {
    if (!session || togglingId) return;
    setTogglingId(task.id);
    const result = await updateTask(session.access_token, task.id, { status: 'Completed' });
    setTogglingId(null);
    if (result.ok) {
      setView((prev) => {
        if (!prev) return prev;
        const remove = (tasks: Task[]) => tasks.filter((t) => t.id !== task.id);
        return {
          overdue: remove(prev.overdue),
          due_soon: remove(prev.due_soon),
          high_priority: remove(prev.high_priority),
          pending: remove(prev.pending),
        };
      });
      requestDeadlineReconcile();
      requestWorkloadCheck();
    } else {
      Alert.alert('Could not update task', result.error.message);
    }
  }

  function handleRefresh() {
    load(true);
    loadNextBlock();
  }

  const blockTitle = nextBlock?.task ? nextBlock.task.title : 'Study block';
  const blockSubject = nextBlock?.task?.subject?.name ?? null;
  const blockTimeRange = nextBlock ? `${formatBlockTime(nextBlock.starts_at)} – ${formatBlockTime(nextBlock.ends_at)}` : '';
  const blockIcon = nextBlock?.task ? taskTypeIcon[nextBlock.task.type] : 'layers-outline';

  return (
    // Not <Screen> — Screen's SafeAreaView hardcodes background.main on
    // itself (outside the View that its own `style` prop reaches), which
    // is exactly what produced the lavender seam below Today's canvas.
    // Composing the same SafeAreaView locally, with `surface.canvas`
    // instead, fixes that without touching the shared component (which
    // every other screen still relies on).
    //
    // `edges` excludes 'top' deliberately: SafeAreaView's own background
    // (canvas) would otherwise paint the top safe-area/status-bar strip,
    // producing a second seam — this time canvas-above-periwinkle — right
    // above `headerSurface`. Instead `headerSurface` itself absorbs
    // `insets.top` into its own paddingTop below, so its periwinkle
    // background extends continuously through the status bar. This moves
    // the same inset from one element to another; it does not add a
    // second one, and the header's visible height/content position is
    // unchanged.
    <SafeAreaView style={styles.outerSafeArea} edges={['left', 'right', 'bottom']}>
      <View style={[styles.headerSurface, { paddingTop: insets.top + space.xs }]}>
        <View style={styles.headerTopRow}>
          <View style={styles.headerTextGroup}>
            <ThemedText type="default" style={styles.greeting}>
              {getGreeting()}
            </ThemedText>
            <ThemedText type="default" style={styles.headerSubtitle}>
              Here&apos;s your study plan.
            </ThemedText>
          </View>
          {session?.user.email && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open profile"
              onPress={() => router.push('/profile' as Href)}
              style={({ pressed }) => [styles.avatarButton, pressed && styles.pressedFade]}
            >
              <Avatar
                label={profile?.display_name ?? session.user.email}
                uri={avatarSignedUrl}
                size={50}
                shape="circle"
              />
            </Pressable>
          )}
        </View>

        <View style={styles.dateChip}>
          <Icon name="calendar-outline" size="sm" color={color.primary.violet} />
          <ThemedText type="default" style={styles.date}>
            {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
          </ThemedText>
        </View>
      </View>

      <View style={styles.bodyColumn}>
        <View style={styles.heroSlot}>
          {showHero ? (
            <SectionCard variant="emphasis" style={styles.hero}>
              <View style={styles.heroHeadlineRow}>
                <View
                  style={[
                    styles.heroIconBadge,
                    { backgroundColor: overdueCount > 0 ? color.risk.high.bg : color.accent.mint },
                  ]}
                >
                  <Icon
                    name={overdueCount > 0 ? 'warning' : 'checkmark-circle-outline'}
                    size="sm"
                    color={overdueCount > 0 ? color.risk.high.text : color.success.strong}
                  />
                </View>
                <ThemedText type="default" style={styles.heroHeadline}>
                  {overdueCount > 0
                    ? `${overdueCount} task${overdueCount === 1 ? '' : 's'} need${overdueCount === 1 ? 's' : ''} attention`
                    : "You're on track today"}
                </ThemedText>
              </View>

              {overdueCount > 0 && (
                <ThemedText type="default" style={styles.heroSupporting}>
                  Start with the most urgent deadline.
                </ThemedText>
              )}

              <StatRow>
                <StatTile icon="time-outline" label="Overdue" value={overdueCount} tone="attention" />
                <StatTile icon="list-outline" label="Active" value={activeCount} tone="violet" />
                <StatTile icon="calendar-outline" label="Due soon" value={dueSoonCount} tone="neutral" />
              </StatRow>

              <View style={styles.heroDivider} />
              <WorkloadAction />
            </SectionCard>
          ) : (
            <SectionCard variant="default" style={styles.hero}>
              <WorkloadAction />
            </SectionCard>
          )}
        </View>

        {isLoading && <ActivityIndicator color={color.primary.violet} />}
        {!isLoading && loadError && <Banner variant="error" message={loadError} />}

        {!isLoading && !loadError && isEmpty && (
          <ScrollView
            contentContainerStyle={styles.emptyScroll}
            refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
          >
            <EmptyState
              message="No tasks yet"
              actionLabel="Add your first task"
              onAction={() => router.push('/tasks/new' as Href)}
            />
          </ScrollView>
        )}

        {!isLoading && !loadError && sections && !isEmpty && (
          <ScrollView
            contentContainerStyle={styles.sections}
            refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
          >
            <View style={styles.priorityHeaderRow}>
              <ThemedText type="default" style={styles.priorityTitle}>
                Priority tasks
              </ThemedText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="View all tasks"
                onPress={() => router.push('/tasks' as Href)}
                style={({ pressed }) => [styles.viewAllRow, pressed && styles.pressedFade]}
              >
                <ThemedText type="default" style={styles.viewAllText}>
                  View all
                </ThemedText>
                <Icon name="chevron-forward" size="sm" color={color.primary.violet} />
              </Pressable>
            </View>

            <View style={styles.priorityList}>
              {priorityTasks.map((task) => (
                <PriorityTaskRow
                  key={task.id}
                  task={task}
                  onPress={() => router.push(`/tasks/${task.id}` as Href)}
                  onToggleComplete={() => handleToggleComplete(task)}
                  isToggling={togglingId === task.id}
                />
              ))}
            </View>

            {nextBlock ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Next study block, ${blockTitle}${blockSubject ? `, ${blockSubject}` : ''}, ${blockTimeRange}. Opens Planner.`}
                onPress={() => router.push('/planner' as Href)}
                style={({ pressed }) => pressed && styles.pressedFade}
              >
                <SectionCard variant="default" style={styles.blockCard}>
                  <View style={styles.blockLabelRow}>
                    <Icon name="calendar-outline" size="sm" color={color.primary.violet} />
                    <ThemedText type="default" style={styles.blockLabel}>
                      Next study block
                    </ThemedText>
                  </View>
                  <View style={styles.blockRow}>
                    <View style={styles.blockIconBadge}>
                      <Icon name={blockIcon} size="sm" color={color.primary.violet} />
                    </View>
                    <View style={styles.blockInfo}>
                      <ThemedText type="default" style={styles.blockTitle} numberOfLines={1}>
                        {blockTitle}
                      </ThemedText>
                      {blockSubject && (
                        <ThemedText type="default" style={styles.blockSubject} numberOfLines={1}>
                          {blockSubject}
                        </ThemedText>
                      )}
                      <View style={styles.blockTimeRow}>
                        <Icon name="time-outline" size="sm" color={color.text.secondary} />
                        <ThemedText type="default" style={styles.blockTime}>
                          {blockTimeRange}
                        </ThemedText>
                      </View>
                    </View>
                  </View>
                </SectionCard>
              </Pressable>
            ) : (
              // Same position/footprint as the real card above — never a
              // blank gap. "No study block scheduled" covers every reason
              // `nextBlock` is null (no block today, timezone misaligned,
              // fetch failed): Today has no genuine block to show in any
              // of those cases, so the same honest empty copy applies to
              // all of them rather than inventing a distinct message per
              // cause. The action is a real route (Planner), never a
              // fabricated one.
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="No study block scheduled. Plan a block in Planner."
                onPress={() => router.push('/planner' as Href)}
                style={({ pressed }) => pressed && styles.pressedFade}
              >
                <SectionCard variant="default" style={styles.blockCard}>
                  <View style={styles.blockLabelRow}>
                    <Icon name="calendar-outline" size="sm" color={color.primary.violet} />
                    <ThemedText type="default" style={styles.blockLabel}>
                      Next study block
                    </ThemedText>
                  </View>
                  <View style={styles.blockEmptyRow}>
                    <ThemedText type="default" style={styles.blockEmptyMessage}>
                      No study block scheduled
                    </ThemedText>
                    <View style={styles.blockEmptyAction}>
                      <ThemedText type="default" style={styles.blockEmptyActionText}>
                        Plan a block
                      </ThemedText>
                      <Icon name="chevron-forward" size="sm" color={color.primary.violet} />
                    </View>
                  </View>
                </SectionCard>
              </Pressable>
            )}
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}

/** Shared by both the hero's bottom row and the standalone fallback card
 * (loading/error/empty) — same route, same accessibility label, in both
 * places, so there is exactly one entry point to keep in sync. */
function WorkloadAction() {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Check your workload"
      onPress={() => router.push('/workload' as Href)}
      style={({ pressed }) => [styles.workloadAction, pressed && styles.pressedFade]}
    >
      <View style={styles.workloadActionLeft}>
        <View style={styles.workloadIconBadge}>
          <Icon name="bar-chart-outline" size="sm" color={color.primary.violet} />
        </View>
        <ThemedText type="default" style={styles.workloadActionText}>
          View workload
        </ThemedText>
      </View>
      <Icon name="chevron-forward" size="sm" color={color.primary.violet} />
    </Pressable>
  );
}

/** Today-specific compact card — deliberately NOT the Tasks-list
 * `TaskRow` `variant="grouped"` (that card's two stacked pill-badge rows
 * make it too tall for three of these to fit a normal phone viewport
 * above the fold), but reproduces the approved reference's own column
 * layout: icon badge, title/subject/overdue-badge, due-date + priority
 * pill, completion circle. Priority renders in exactly one place (the
 * pill on the right) — the left column's "Overdue" badge is a distinct
 * signal (deadline state, not priority), so "High" is never duplicated.
 * Completion control/behavior is identical to Tasks' own row: same
 * `updateTask` call, same accessibility contract. */
function PriorityTaskRow({
  task,
  onPress,
  onToggleComplete,
  isToggling,
}: {
  task: Task;
  onPress: () => void;
  onToggleComplete: () => void;
  isToggling: boolean;
}) {
  const isActive = task.status === 'Pending' || task.status === 'InProgress';
  const isOverdue = isActive && new Date(task.deadline).getTime() < Date.now();
  const dueDateLabel = formatDueShort(task.deadline);
  const dueTone = isOverdue ? color.risk.high.text : color.primary.violet;
  const priorityTone = priorityBadgeTone[task.priority];
  const accessibilityLabel = `${task.title}${task.subject ? `, ${task.subject.name}` : ''}, ${task.priority} priority, ${isOverdue ? 'Overdue, ' : ''}${dueDateLabel}`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [styles.priorityRow, pressed && styles.pressedFade]}
    >
      <View style={styles.priorityIconBadge}>
        <Icon name={taskTypeIcon[task.type]} size="sm" color={color.primary.violet} />
      </View>
      <View style={styles.priorityContent}>
        <ThemedText type="default" style={styles.priorityTaskTitle} numberOfLines={1}>
          {task.title}
        </ThemedText>
        {task.subject && (
          <ThemedText type="default" style={styles.prioritySubject} numberOfLines={1}>
            {task.subject.name}
          </ThemedText>
        )}
        {isOverdue && (
          <View style={styles.overdueBadge}>
            <ThemedText type="default" style={styles.overdueBadgeText}>
              Overdue
            </ThemedText>
          </View>
        )}
      </View>
      <View style={styles.priorityRight}>
        <View style={styles.dueRow}>
          <Icon name="calendar-outline" size="sm" color={dueTone} />
          <ThemedText type="default" style={[styles.dueText, { color: dueTone }]} numberOfLines={1}>
            {dueDateLabel}
          </ThemedText>
        </View>
        <View style={[styles.priorityBadge, { backgroundColor: priorityTone.bg }]}>
          <ThemedText type="default" style={[styles.priorityBadgeText, { color: priorityTone.text }]}>
            {task.priority}
          </ThemedText>
        </View>
      </View>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: false, disabled: isToggling }}
        accessibilityLabel={`Mark ${task.title} complete`}
        disabled={isToggling}
        hitSlop={space.xs}
        onPress={(event) => {
          event.stopPropagation();
          onToggleComplete();
        }}
        style={styles.priorityCompletionControl}
      >
        {isToggling ? (
          <ActivityIndicator size="small" color={color.primary.violet} />
        ) : (
          <Icon name="ellipse-outline" size="lg" color={color.text.secondary} />
        )}
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  outerSafeArea: {
    flex: 1,
    backgroundColor: color.surface.canvas,
  },
  // Full-bleed banner — deliberately outside `bodyColumn`'s horizontal
  // padding so it reaches both screen edges, per the "compact full-width
  // header surface" requirement.
  headerSurface: {
    backgroundColor: color.surface.headerSoft,
    paddingHorizontal: space.lg,
    // paddingTop is set inline (insets.top + space.xs) — see the render's
    // comment on why the SafeAreaView above excludes the 'top' edge.
    paddingBottom: space.md,
    borderBottomLeftRadius: radius.card,
    borderBottomRightRadius: radius.card,
    gap: space.xs,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headerTextGroup: {
    flex: 1,
    gap: 2,
    paddingRight: space.sm,
  },
  greeting: {
    fontSize: typeTokens.heading.fontSize,
    lineHeight: typeTokens.heading.lineHeight,
    fontWeight: '700',
    color: color.text.primary,
  },
  headerSubtitle: {
    fontSize: typeTokens.body.fontSize,
    lineHeight: 18,
    color: color.text.secondary,
  },
  dateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: space.xs,
    backgroundColor: color.background.card,
    borderWidth: 1,
    borderColor: color.border.divider,
    borderRadius: radius.control,
    paddingHorizontal: space.md,
    paddingVertical: 6,
  },
  date: {
    fontSize: typeTokens.caption.fontSize,
    lineHeight: typeTokens.caption.lineHeight,
    fontWeight: '600',
    color: color.text.primary,
  },
  avatarButton: {
    minWidth: touchTarget.min,
    minHeight: touchTarget.min,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressedFade: {
    opacity: 0.7,
  },
  bodyColumn: {
    flex: 1,
    paddingHorizontal: space.lg,
    paddingBottom: space.lg,
    gap: space.sm,
  },
  // Pulls the hero/fallback card up to overlap the header's rounded
  // bottom edge by ~12px — both are Screen-level siblings (not children
  // of `headerSurface`), so the hero's own shadow paints on top of the
  // header uncropped, never clipped.
  heroSlot: {
    marginTop: -12,
  },
  hero: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    gap: space.xs,
  },
  heroHeadlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  heroIconBadge: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroHeadline: {
    flex: 1,
    fontSize: typeTokens.body.fontSize,
    lineHeight: 20,
    fontWeight: '600',
    color: color.text.primary,
  },
  heroSupporting: {
    fontSize: typeTokens.caption.fontSize,
    lineHeight: typeTokens.caption.lineHeight,
    color: color.text.secondary,
  },
  heroDivider: {
    height: 1,
    backgroundColor: color.border.divider,
  },
  workloadAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 50,
  },
  workloadActionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  workloadIconBadge: {
    width: 32,
    height: 32,
    borderRadius: radius.control,
    backgroundColor: color.accent.lavender,
    alignItems: 'center',
    justifyContent: 'center',
  },
  workloadActionText: {
    fontSize: typeTokens.body.fontSize,
    lineHeight: typeTokens.body.lineHeight,
    fontWeight: '600',
    color: color.primary.violet,
  },
  emptyScroll: {
    flexGrow: 1,
  },
  sections: {
    gap: space.sm,
    paddingBottom: space.xxl,
  },
  priorityHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  priorityTitle: {
    fontSize: typeTokens.subheading.fontSize,
    lineHeight: typeTokens.subheading.lineHeight,
    fontWeight: '700',
    color: color.text.primary,
  },
  viewAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minHeight: touchTarget.min,
  },
  viewAllText: {
    fontSize: typeTokens.label.fontSize,
    lineHeight: typeTokens.label.lineHeight,
    fontWeight: '600',
    color: color.primary.violet,
  },
  priorityList: {
    gap: space.xs,
  },
  priorityRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    backgroundColor: color.background.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.border.divider,
    paddingHorizontal: space.md,
    paddingVertical: 10,
  },
  priorityIconBadge: {
    width: 42,
    height: 42,
    borderRadius: radius.control,
    backgroundColor: color.accent.lavender,
    alignItems: 'center',
    justifyContent: 'center',
  },
  priorityContent: {
    flex: 1,
    gap: 2,
  },
  priorityTaskTitle: {
    fontSize: typeTokens.body.fontSize,
    lineHeight: 20,
    fontWeight: '600',
    color: color.text.primary,
  },
  prioritySubject: {
    fontSize: 12,
    lineHeight: 16,
    color: color.text.secondary,
  },
  overdueBadge: {
    alignSelf: 'flex-start',
    backgroundColor: color.risk.high.bg,
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    marginTop: 2,
  },
  overdueBadgeText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    color: color.risk.high.text,
  },
  priorityRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  dueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dueText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  priorityBadge: {
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
  },
  priorityBadgeText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
  },
  priorityCompletionControl: {
    alignSelf: 'center',
    minWidth: touchTarget.min,
    minHeight: touchTarget.min,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blockCard: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    gap: space.xs,
  },
  blockLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  blockLabel: {
    fontSize: typeTokens.label.fontSize,
    lineHeight: typeTokens.label.lineHeight,
    fontWeight: '600',
    color: color.primary.violet,
  },
  blockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  blockIconBadge: {
    width: 40,
    height: 40,
    borderRadius: radius.control,
    backgroundColor: color.accent.lavender,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blockInfo: {
    flex: 1,
    gap: 2,
  },
  blockTitle: {
    fontSize: typeTokens.body.fontSize,
    lineHeight: 20,
    fontWeight: '600',
    color: color.text.primary,
  },
  blockSubject: {
    fontSize: 12,
    lineHeight: 16,
    color: color.text.secondary,
  },
  blockTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  blockTime: {
    fontSize: 12,
    lineHeight: 16,
    color: color.text.secondary,
  },
  blockEmptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  blockEmptyMessage: {
    fontSize: typeTokens.body.fontSize,
    lineHeight: 20,
    color: color.text.secondary,
  },
  blockEmptyAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  blockEmptyActionText: {
    fontSize: typeTokens.label.fontSize,
    lineHeight: typeTokens.label.lineHeight,
    fontWeight: '600',
    color: color.primary.violet,
  },
});
