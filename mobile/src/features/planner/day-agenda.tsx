import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { Banner } from '@/components/banner';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { ThemedText } from '@/components/themed-text';
import {
  color,
  priorityColor,
  radius,
  space,
  subjectColor,
  taskTypeColor,
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

interface AgendaSectionProps {
  tasks: PlannerTaskItem[];
  studyBlocks: StudyBlockRead[];
  onSelectBlock: (block: StudyBlockRead) => void;
  compact?: boolean;
  emptyMessage?: string;
}

export function AgendaSection({
  tasks,
  studyBlocks,
  onSelectBlock,
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
      {tasks.length > 0 && (
        <View style={styles.subsection}>
          {!compact && (
            <ThemedText type="default" style={styles.subsectionHeader}>
              Deadlines
            </ThemedText>
          )}
          {tasks.map((task) => (
            <View key={task.id} style={styles.deadlineRow}>
              <View style={[styles.typeDot, { backgroundColor: taskTypeColor[task.type] }]} />
              <View style={styles.rowContent}>
                <ThemedText type="default" style={styles.rowTitle} numberOfLines={1}>
                  {task.title}
                </ThemedText>
                <View style={styles.metaRow}>
                  {task.subject && (
                    <View style={styles.subjectChip}>
                      <View
                        style={[
                          styles.subjectDot,
                          { backgroundColor: subjectColor[task.subject.color_token] },
                        ]}
                      />
                      <ThemedText type="default" style={styles.metaText}>
                        {task.subject.name}
                        {task.subject.archived ? ' (archived)' : ''}
                      </ThemedText>
                    </View>
                  )}
                  <ThemedText type="default" style={styles.metaText}>
                    Due {formatTime(task.deadline)}
                  </ThemedText>
                </View>
              </View>
              <View style={[styles.priorityDot, { backgroundColor: priorityColor[task.priority] }]} />
            </View>
          ))}
        </View>
      )}

      {studyBlocks.length > 0 && (
        <View style={styles.subsection}>
          {!compact && (
            <ThemedText type="default" style={styles.subsectionHeader}>
              Study blocks
            </ThemedText>
          )}
          {studyBlocks.map((block) => (
            <Pressable
              key={block.id}
              accessibilityRole="button"
              accessibilityLabel={`Study block ${formatTimeRange(block.starts_at, block.ends_at)}${
                block.task ? `, linked to ${block.task.title}` : ''
              }`}
              onPress={() => onSelectBlock(block)}
              style={({ pressed }) => [styles.blockRow, pressed && styles.rowPressed]}
            >
              <View style={styles.rowContent}>
                <ThemedText type="default" style={styles.rowTitle} numberOfLines={1}>
                  {block.task ? block.task.title : 'Study block'}
                </ThemedText>
                <View style={styles.metaRow}>
                  {block.task?.subject && (
                    <View style={styles.subjectChip}>
                      <View
                        style={[
                          styles.subjectDot,
                          { backgroundColor: subjectColor[block.task.subject.color_token] },
                        ]}
                      />
                      <ThemedText type="default" style={styles.metaText}>
                        {block.task.subject.name}
                        {block.task.subject.archived ? ' (archived)' : ''}
                      </ThemedText>
                    </View>
                  )}
                  <ThemedText type="default" style={styles.metaText}>
                    {formatTimeRange(block.starts_at, block.ends_at)}
                  </ThemedText>
                </View>
              </View>
            </Pressable>
          ))}
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
        <EmptyState message="No tasks or study blocks on this day" />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
    >
      <AgendaSection tasks={tasks} studyBlocks={studyBlocks} onSelectBlock={onSelectBlock} />
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
    fontWeight: '600',
    color: color.text.secondary,
    textTransform: 'uppercase',
  },
  fullEmpty: {
    fontSize: typeTokens.body.fontSize,
    color: color.text.secondary,
    textAlign: 'center',
    paddingVertical: space.md,
  },
  compactEmpty: {
    fontSize: typeTokens.caption.fontSize,
    color: color.text.disabled,
  },
  deadlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: color.background.card,
    borderRadius: radius.card,
    padding: space.md,
  },
  blockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: touchTarget.min,
    backgroundColor: color.background.card,
    borderRadius: radius.card,
    padding: space.md,
  },
  rowPressed: {
    opacity: 0.7,
  },
  typeDot: {
    width: 10,
    height: 10,
    borderRadius: radius.pill,
  },
  rowContent: {
    flex: 1,
    gap: space.xs,
  },
  rowTitle: {
    fontSize: typeTokens.body.fontSize,
    fontWeight: '600',
    color: color.text.primary,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    flexWrap: 'wrap',
  },
  metaText: {
    fontSize: typeTokens.caption.fontSize,
    color: color.text.secondary,
  },
  subjectChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  subjectDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
  },
  priorityDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
  },
});
