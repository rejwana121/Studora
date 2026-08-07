import { router, useFocusEffect, type Href } from 'expo-router';
import { Fragment, useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getTasksToday } from '@/api/tasks';
import { Avatar } from '@/components/avatar';
import { Banner } from '@/components/banner';
import { EmptyState } from '@/components/empty-state';
import { Icon } from '@/components/icon';
import { SectionCard } from '@/components/section-card';
import { StatRow, StatTile } from '@/components/stat-tile';
import { ThemedText } from '@/components/themed-text';
import { useSession } from '@/features/auth/session-context';
import { color, radius, space, touchTarget, type as typeTokens } from '@/design-system/tokens';
import type { Task, TaskTodayView } from '@/types/api';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function TodayScreen() {
  const { session, profile, avatarSignedUrl } = useSession();
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

  return (
    // Not <Screen> — Screen's SafeAreaView hardcodes background.main on
    // itself (outside the View that its own `style` prop reaches), which
    // is exactly what produced the lavender seam below Today's canvas.
    // Composing the same SafeAreaView locally, with `surface.canvas`
    // instead, fixes that without touching the shared component (which
    // every other screen still relies on).
    <SafeAreaView style={styles.outerSafeArea}>
      <View style={styles.headerSurface}>
        <View style={[styles.headerDecor, styles.headerDecorB]} pointerEvents="none" />

        <View style={styles.headerTopRow}>
          <ThemedText type="default" style={styles.eyebrow}>
            Today
          </ThemedText>
          {session?.user.email && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open profile"
              onPress={() => router.push('/profile' as Href)}
              style={({ pressed }) => [styles.avatarButton, pressed && styles.pressedFade]}
            >
              <Avatar label={profile?.display_name ?? session.user.email} uri={avatarSignedUrl} size={40} />
            </Pressable>
          )}
        </View>

        <ThemedText type="default" style={styles.greeting}>
          {getGreeting()}
        </ThemedText>
        <ThemedText type="default" style={styles.headerSubtitle}>
          Here&apos;s your study plan.
        </ThemedText>
        <View style={styles.dateRow}>
          <Icon name="calendar-outline" size="sm" color={color.text.secondary} />
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
                <Icon
                  name={overdueCount > 0 ? 'alert-circle' : 'checkmark-circle-outline'}
                  size="md"
                  color={overdueCount > 0 ? color.risk.high.text : color.primary.violetStrong}
                />
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
                <StatTile icon="list-outline" label="Active" value={activeCount} tone="violet" />
                <StatTile icon="alert-circle-outline" label="Overdue" value={overdueCount} tone="attention" />
                <StatTile icon="time-outline" label="Due soon" value={dueSoonCount} tone="neutral" />
              </StatRow>

              <View style={styles.heroDivider} />
              <WorkloadAction />
            </SectionCard>
          ) : (
            <SectionCard variant="default">
              <WorkloadAction />
            </SectionCard>
          )}
        </View>

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

        {!isLoading && !loadError && sections && !isEmpty && (
          <ScrollView
            contentContainerStyle={styles.sections}
            refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => load(true)} />}
          >
            <Section title="Overdue" tasks={sections.overdue} />
            <Section title="Due soon (72h)" tasks={sections.dueSoon} />
            <Section title="High priority" tasks={sections.highPriority} />
            <Section title="Pending" tasks={sections.pending} />
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
      <ThemedText type="default" style={styles.workloadActionText}>
        View workload
      </ThemedText>
      <Icon name="chevron-forward" size="sm" color={color.primary.violet} />
    </Pressable>
  );
}

function Section({ title, tasks }: { title: string; tasks: Task[] }) {
  if (tasks.length === 0) return null;
  return (
    <View style={styles.section}>
      <ThemedText type="default" style={styles.sectionHeader}>
        {title.toUpperCase()}{' '}
        <ThemedText type="default" style={styles.sectionCount}>
          {tasks.length}
        </ThemedText>
      </ThemedText>
      <SectionCard padded={false}>
        {tasks.map((task, index) => (
          <Fragment key={task.id}>
            <TodayTaskRow task={task} onPress={() => router.push(`/tasks/${task.id}` as Href)} />
            {index < tasks.length - 1 && <View style={styles.divider} />}
          </Fragment>
        ))}
      </SectionCard>
    </View>
  );
}

/** Today-specific compact row — deliberately not a change to the shared
 * `TaskRow` (which the Tasks screen also renders). Structure: title,
 * then "subject · deadline" in `text.secondary` only (no colour there,
 * no repeated "High priority"/"Overdue" pairing), plus one small trailing
 * coral dot — present only when overdue, never for priority alone, so
 * coral stays reserved for genuine overdue meaning. The dot is a bonus
 * accent, not the sole signal: the row's own meta text already spells
 * out the word "Overdue" wherever it applies. Full meaning (subject,
 * priority, deadline/overdue) is preserved in the accessibility label
 * even where it's been dropped from the compact visible text. */
function TodayTaskRow({ task, onPress }: { task: Task; onPress: () => void }) {
  const isActive = task.status === 'Pending' || task.status === 'InProgress';
  const isOverdue = isActive && new Date(task.deadline).getTime() < Date.now();
  const deadlineLabel = isOverdue ? 'Overdue' : formatDeadline(task.deadline);
  const metaLine = [task.subject?.name, deadlineLabel].filter(Boolean).join(' · ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${task.title}${task.subject ? `, ${task.subject.name}` : ''}, ${task.priority} priority, ${deadlineLabel}`}
      onPress={onPress}
      style={({ pressed }) => [styles.todayTaskRow, pressed && styles.pressedFade]}
    >
      <View style={styles.todayTaskContent}>
        <ThemedText type="default" style={styles.todayTaskTitle} numberOfLines={1}>
          {task.title}
        </ThemedText>
        <ThemedText type="default" style={styles.todayTaskMeta} numberOfLines={1}>
          {metaLine}
        </ThemedText>
      </View>
      {isOverdue && <View style={styles.todayTaskOverdueDot} />}
    </Pressable>
  );
}

function formatDeadline(iso: string): string {
  const date = new Date(iso);
  return `${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${date.toLocaleTimeString(
    undefined,
    { hour: 'numeric', minute: '2-digit' }
  )}`;
}

const styles = StyleSheet.create({
  outerSafeArea: {
    flex: 1,
    backgroundColor: color.surface.canvas,
  },
  // Full-bleed banner — deliberately outside `bodyColumn`'s horizontal
  // padding so it reaches both screen edges, per the "compact full-width
  // header surface" requirement. `overflow: hidden` contains the two
  // decorative circles within its own rounded-bottom bounds.
  headerSurface: {
    backgroundColor: color.surface.headerSoft,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.xl,
    borderBottomLeftRadius: radius.card,
    borderBottomRightRadius: radius.card,
    overflow: 'hidden',
    position: 'relative',
    gap: 4,
  },
  // One subtle decorative shape only (existing `accent.mint` token at
  // reduced opacity, the same restrained treatment AuthShell already
  // uses) — decorative, non-interactive, never conveys information. The
  // former top-right lavender circle was removed: it sat directly behind
  // the avatar and made the initials read as floating decoration rather
  // than a control.
  headerDecor: {
    position: 'absolute',
    borderRadius: radius.pill,
  },
  headerDecorB: {
    width: 100,
    height: 100,
    bottom: -40,
    left: -30,
    backgroundColor: color.accent.mint,
    opacity: 0.45,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eyebrow: {
    fontSize: typeTokens.caption.fontSize,
    fontWeight: '700',
    color: color.primary.violet,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  greeting: {
    fontSize: typeTokens.heading.fontSize,
    lineHeight: typeTokens.heading.lineHeight,
    fontWeight: '700',
    color: color.text.primary,
  },
  headerSubtitle: {
    fontSize: typeTokens.body.fontSize,
    color: color.text.secondary,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    marginTop: 2,
  },
  date: {
    fontSize: typeTokens.caption.fontSize,
    color: color.text.secondary,
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
    gap: space.md,
  },
  // Pulls the hero/fallback card up to overlap the header's rounded
  // bottom edge by ~12px — both are Screen-level siblings (not children
  // of `headerSurface`'s `overflow: hidden` box), so the hero's own
  // shadow paints on top of the header uncropped, never clipped.
  heroSlot: {
    marginTop: -12,
  },
  hero: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  heroHeadlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  heroHeadline: {
    flex: 1,
    fontSize: typeTokens.subheading.fontSize,
    lineHeight: typeTokens.subheading.lineHeight,
    fontWeight: '600',
    color: color.text.primary,
  },
  heroSupporting: {
    fontSize: typeTokens.caption.fontSize,
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
    minHeight: touchTarget.min,
  },
  workloadActionText: {
    fontSize: typeTokens.body.fontSize,
    fontWeight: '600',
    color: color.primary.violet,
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
  sectionCount: {
    fontSize: typeTokens.label.fontSize,
    fontWeight: '400',
    color: color.text.secondary,
    opacity: 0.75,
  },
  divider: {
    height: 1,
    backgroundColor: color.border.divider,
    marginHorizontal: space.md,
  },
  todayTaskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    minHeight: touchTarget.min,
  },
  todayTaskContent: {
    flex: 1,
    gap: 2,
  },
  todayTaskTitle: {
    fontSize: typeTokens.body.fontSize,
    fontWeight: '600',
    color: color.text.primary,
  },
  todayTaskMeta: {
    fontSize: typeTokens.caption.fontSize,
    color: color.text.secondary,
  },
  todayTaskOverdueDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: color.accent.coral,
  },
});
