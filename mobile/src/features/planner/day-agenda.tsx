import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { Banner } from '@/components/banner';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import {
  color,
  elevation,
  priorityBadgeTone,
  radius,
  shadowStyle,
  space,
  taskTypeIcon,
  touchTarget,
  type as typeTokens,
} from '@/design-system/tokens';
import type { PlannerTaskItem, StudyBlockRead } from '@/types/api';

/** Only rendered once the timezone-alignment gate has confirmed
 * Profile.timezone === device timezone, so displaying these UTC instants
 * via the device's locale/timezone formatting is safe and matches what
 * Profile.timezone-based bucketing already decided. */
function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function formatTimeRange(startsAt: string, endsAt: string): string {
  return `${formatTime(startsAt)} – ${formatTime(endsAt)}`;
}

/** Real, derived from the same two real fields already sent to/from the
 * API (`starts_at`/`ends_at`) — not a stored or invented field. */
function formatDurationMinutes(startsAt: string, endsAt: string): string {
  const minutes = Math.round((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60000);
  if (minutes < 60 || minutes % 60 !== 0) return `${minutes} min`;
  const hours = minutes / 60;
  return `${hours} hr${hours === 1 ? '' : 's'}`;
}

interface AgendaSectionProps {
  tasks: PlannerTaskItem[];
  studyBlocks: StudyBlockRead[];
  onSelectBlock: (block: StudyBlockRead) => void;
  onSelectTask: (task: PlannerTaskItem) => void;
  compact?: boolean;
  emptyMessage?: string;
}

export function AgendaSection({
  tasks,
  studyBlocks,
  onSelectBlock,
  onSelectTask,
  compact,
  emptyMessage = 'Nothing scheduled',
}: AgendaSectionProps) {
  if (tasks.length === 0 && studyBlocks.length === 0) {
    return (
      <ThemedText type="default" style={compact ? styles.compactEmpty : styles.fullEmpty}>
        {emptyMessage}
      </ThemedText>
    );
  }

  return (
    <View style={styles.sectionGroup}>
      {studyBlocks.length > 0 && (
        <View style={styles.subsection}>
          {!compact && (
            <ThemedText type="default" style={styles.subsectionHeader}>
              Study blocks
            </ThemedText>
          )}
          {studyBlocks.map((block) => {
            const title = block.task ? block.task.title : 'Study block';
            const icon = block.task ? taskTypeIcon[block.task.type] : 'layers-outline';
            return (
              <Pressable
                key={block.id}
                accessibilityRole="button"
                accessibilityLabel={`${title}, ${formatTimeRange(block.starts_at, block.ends_at)}, ${formatDurationMinutes(block.starts_at, block.ends_at)}${
                  block.task?.subject ? `, ${block.task.subject.name}` : ''
                }`}
                onPress={() => onSelectBlock(block)}
                style={({ pressed }) => [styles.itemCard, compact && styles.itemCardCompact, pressed && styles.itemCardPressed]}
              >
                <View style={styles.accentBar} />
                <View style={[styles.iconBadge, styles.blockIconBadge]}>
                  <Icon name={icon} size="sm" color={color.secondary.tealStrong} />
                </View>
                <View style={styles.itemContent}>
                  <ThemedText type="default" style={styles.itemTitle} numberOfLines={1}>
                    {title}
                  </ThemedText>
                  {block.task?.subject && !compact && (
                    <ThemedText type="default" style={styles.itemSubject} numberOfLines={1}>
                      {block.task.subject.name}
                      {block.task.subject.archived ? ' (archived)' : ''}
                    </ThemedText>
                  )}
                  <View style={styles.metaRow}>
                    <Icon name="time-outline" size="sm" color={color.text.secondary} />
                    <ThemedText type="default" style={styles.metaText} numberOfLines={1}>
                      {formatTimeRange(block.starts_at, block.ends_at)}
                    </ThemedText>
                  </View>
                </View>
                {!compact && (
                  <View style={styles.durationBadge}>
                    <ThemedText type="default" style={styles.durationBadgeText}>
                      {formatDurationMinutes(block.starts_at, block.ends_at)}
                    </ThemedText>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      )}

      {tasks.length > 0 && (
        <View style={styles.subsection}>
          {!compact && (
            <ThemedText type="default" style={styles.subsectionHeader}>
              Tasks due
            </ThemedText>
          )}
          {tasks.map((task) => {
            const priorityTone = priorityBadgeTone[task.priority];
            return (
              <Pressable
                key={task.id}
                accessibilityRole="button"
                accessibilityLabel={`${task.title}${task.subject ? `, ${task.subject.name}` : ''}, due ${formatTime(task.deadline)}, ${task.priority} priority`}
                onPress={() => onSelectTask(task)}
                style={({ pressed }) => [styles.itemCard, compact && styles.itemCardCompact, pressed && styles.itemCardPressed]}
              >
                <View style={[styles.accentBar, styles.accentBarCoral]} />
                <View style={[styles.iconBadge, styles.taskIconBadge]}>
                  <Icon name={taskTypeIcon[task.type]} size="sm" color={color.risk.high.text} />
                </View>
                <View style={styles.itemContent}>
                  <ThemedText type="default" style={styles.itemTitle} numberOfLines={1}>
                    {task.title}
                  </ThemedText>
                  {task.subject && !compact && (
                    <ThemedText type="default" style={styles.itemSubject} numberOfLines={1}>
                      {task.subject.name}
                      {task.subject.archived ? ' (archived)' : ''}
                    </ThemedText>
                  )}
                  <View style={styles.metaRow}>
                    <Icon name="calendar-outline" size="sm" color={color.text.secondary} />
                    <ThemedText type="default" style={styles.metaText} numberOfLines={1}>
                      Due {formatTime(task.deadline)}
                    </ThemedText>
                  </View>
                </View>
                {!compact && (
                  <View style={[styles.priorityBadge, { backgroundColor: priorityTone.bg }]}>
                    <Icon name="flag-outline" size="sm" color={priorityTone.text} />
                    <ThemedText type="default" style={[styles.priorityBadgeText, { color: priorityTone.text }]}>
                      {task.priority}
                    </ThemedText>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

interface DayAgendaProps {
  tasks: PlannerTaskItem[];
  studyBlocks: StudyBlockRead[];
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  onSelectBlock: (block: StudyBlockRead) => void;
  onSelectTask: (task: PlannerTaskItem) => void;
}

export function DayAgenda({
  tasks,
  studyBlocks,
  isLoading,
  error,
  onRetry,
  onRefresh,
  isRefreshing,
  onSelectBlock,
  onSelectTask,
}: DayAgendaProps) {
  if (isLoading) {
    return <ActivityIndicator color={color.primary.violet} style={styles.loadingSpacer} />;
  }

  if (error) {
    return (
      <View style={styles.errorBlock}>
        <Banner variant="error" message={error} />
        <Button label="Retry" variant="secondary" onPress={onRetry} />
      </View>
    );
  }

  if (tasks.length === 0 && studyBlocks.length === 0) {
    return (
      <ScrollView
        contentContainerStyle={styles.emptyScroll}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
      >
        <EmptyState message="No study blocks or tasks due on this day" />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
    >
      <AgendaSection tasks={tasks} studyBlocks={studyBlocks} onSelectBlock={onSelectBlock} onSelectTask={onSelectTask} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loadingSpacer: {
    marginTop: space.lg,
  },
  errorBlock: {
    gap: space.sm,
  },
  emptyScroll: {
    flexGrow: 1,
  },
  scrollContent: {
    paddingBottom: space.xxl,
    gap: space.md,
  },
  sectionGroup: {
    gap: space.md,
  },
  subsection: {
    gap: space.xs,
  },
  subsectionHeader: {
    fontSize: typeTokens.label.fontSize,
    lineHeight: typeTokens.label.lineHeight,
    fontWeight: '700',
    color: color.text.primary,
  },
  fullEmpty: {
    fontSize: typeTokens.body.fontSize,
    color: color.text.secondary,
    textAlign: 'center',
    paddingVertical: space.md,
  },
  compactEmpty: {
    fontSize: typeTokens.caption.fontSize,
    lineHeight: typeTokens.caption.lineHeight,
    color: color.text.disabled,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: touchTarget.min,
    backgroundColor: color.background.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.border.divider,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    overflow: 'hidden',
    ...shadowStyle(elevation.card),
  },
  itemCardCompact: {
    paddingVertical: space.xs,
    ...shadowStyle({ shadowColor: 'transparent', offsetY: 0, blur: 0 }, 0),
  },
  itemCardPressed: {
    opacity: 0.7,
  },
  accentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: color.secondary.teal,
  },
  accentBarCoral: {
    backgroundColor: color.accent.coral,
  },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blockIconBadge: {
    backgroundColor: color.info.bg,
  },
  taskIconBadge: {
    backgroundColor: color.risk.high.bg,
  },
  itemContent: {
    flex: 1,
    gap: 2,
  },
  itemTitle: {
    fontSize: typeTokens.body.fontSize,
    fontWeight: '600',
    color: color.text.primary,
  },
  itemSubject: {
    fontSize: typeTokens.caption.fontSize,
    color: color.text.secondary,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: typeTokens.caption.fontSize,
    color: color.text.secondary,
  },
  durationBadge: {
    backgroundColor: color.info.bg,
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: 4,
  },
  durationBadgeText: {
    fontSize: typeTokens.caption.fontSize,
    fontWeight: '700',
    color: color.secondary.tealStrong,
  },
  priorityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: 4,
  },
  priorityBadgeText: {
    fontSize: typeTokens.caption.fontSize,
    fontWeight: '700',
  },
});
