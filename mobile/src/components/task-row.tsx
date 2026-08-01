import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from './themed-text';
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
import type { Task, TaskStatus } from '@/types/api';

const STATUS_GLYPH: Record<TaskStatus, string> = {
  Pending: '○',
  InProgress: '◐',
  Completed: '✓',
  Cancelled: '✕',
};

function formatDeadline(iso: string): string {
  const date = new Date(iso);
  return `${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${date.toLocaleTimeString(
    undefined,
    { hour: 'numeric', minute: '2-digit' }
  )}`;
}

interface TaskRowProps {
  task: Task;
  onPress: () => void;
  /** "card" (default): standalone row with its own background/radius —
   * unchanged behavior for every existing caller (e.g. Today). "grouped":
   * a simplified hierarchy for use inside an external bounded container
   * that owns the shared background/radius/dividers (e.g. the Tasks
   * list) — one priority accent (left), one status glyph (right); no
   * type dot, no subject dot. */
  variant?: 'card' | 'grouped';
}

export function TaskRow({ task, onPress, variant = 'card' }: TaskRowProps) {
  if (variant === 'grouped') {
    return <GroupedTaskRow task={task} onPress={onPress} />;
  }

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={[styles.typeDot, { backgroundColor: taskTypeColor[task.type] }]} />
      <View style={styles.content}>
        <ThemedText type="default" style={styles.title} numberOfLines={1}>
          {task.title}
        </ThemedText>
        <View style={styles.metaRow}>
          {task.subject && (
            <View style={styles.subjectChip}>
              <View
                style={[styles.subjectDot, { backgroundColor: subjectColor[task.subject.color_token] }]}
              />
              <ThemedText type="default" style={styles.metaText}>
                {task.subject.name}
              </ThemedText>
            </View>
          )}
          <ThemedText type="default" style={styles.metaText}>
            {formatDeadline(task.deadline)}
          </ThemedText>
        </View>
      </View>
      <View style={styles.trailing}>
        <View style={[styles.priorityDot, { backgroundColor: priorityColor[task.priority] }]} />
        <ThemedText type="default" style={styles.statusGlyph}>
          {STATUS_GLYPH[task.status]}
        </ThemedText>
      </View>
    </Pressable>
  );
}

/** Simplified hierarchy for the grouped Tasks-list presentation: one
 * priority accent (left, existing priority colors, same dot convention
 * already used elsewhere in the app) plus title/subject/priority+deadline
 * stacked (primary/secondary/tertiary), and one status glyph (right, the
 * existing circle/check meaning) — no type dot, no subject dot. Priority
 * is never color-only: the accent is paired with a full readable label
 * ("High priority", never an abbreviation) on the tertiary line. Overdue
 * reuses the exact active+past-deadline condition the segment filter
 * already applies, surfaced as a readable "Overdue" word (not just a
 * color change) using the existing risk/high color; completed tasks mute
 * and strike through the title, mirroring the subtask-completion
 * treatment already used on the task detail screen. */
function GroupedTaskRow({ task, onPress }: { task: Task; onPress: () => void }) {
  const isActive = task.status === 'Pending' || task.status === 'InProgress';
  const isOverdue = isActive && new Date(task.deadline).getTime() < Date.now();
  const isCompleted = task.status === 'Completed';
  const priorityLabel = `${task.priority} priority`;
  const deadlineLabel = isOverdue ? 'Overdue' : formatDeadline(task.deadline);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.groupedRow, pressed && styles.pressed]}
    >
      <View style={[styles.priorityAccent, { backgroundColor: priorityColor[task.priority] }]} />
      <View style={styles.groupedContent}>
        <ThemedText
          type="default"
          style={[styles.title, isCompleted && styles.titleCompleted]}
          numberOfLines={1}
        >
          {task.title}
        </ThemedText>
        {task.subject && (
          <ThemedText type="default" style={styles.metaText} numberOfLines={1}>
            {task.subject.name}
          </ThemedText>
        )}
        <ThemedText
          type="default"
          style={[styles.metaText, isOverdue && styles.metaTextOverdue]}
          numberOfLines={1}
        >
          {priorityLabel} · {deadlineLabel}
        </ThemedText>
      </View>
      <ThemedText type="default" style={styles.statusGlyph}>
        {STATUS_GLYPH[task.status]}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: color.background.card,
    borderRadius: radius.card,
    padding: space.md,
  },
  groupedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    minHeight: touchTarget.min,
  },
  pressed: {
    opacity: 0.7,
  },
  typeDot: {
    width: 10,
    height: 10,
    borderRadius: radius.pill,
  },
  priorityAccent: {
    width: 10,
    height: 10,
    borderRadius: radius.pill,
  },
  content: {
    flex: 1,
    gap: space.xs,
  },
  groupedContent: {
    flex: 1,
    gap: space.xs,
  },
  title: {
    fontSize: typeTokens.body.fontSize,
    fontWeight: '600',
    color: color.text.primary,
  },
  titleCompleted: {
    textDecorationLine: 'line-through',
    color: color.text.secondary,
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
  metaTextOverdue: {
    color: color.risk.high.text,
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
  trailing: {
    alignItems: 'center',
    gap: space.xs,
  },
  priorityDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
  },
  statusGlyph: {
    fontSize: typeTokens.caption.fontSize,
    color: color.text.secondary,
  },
});
