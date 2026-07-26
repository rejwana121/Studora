import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from './themed-text';
import {
  color,
  priorityColor,
  radius,
  space,
  subjectColor,
  taskTypeColor,
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
}

export function TaskRow({ task, onPress }: TaskRowProps) {
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

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: color.background.card,
    borderRadius: radius.card,
    padding: space.md,
  },
  pressed: {
    opacity: 0.7,
  },
  typeDot: {
    width: 10,
    height: 10,
    borderRadius: radius.pill,
  },
  content: {
    flex: 1,
    gap: space.xs,
  },
  title: {
    fontSize: typeTokens.body.fontSize,
    fontWeight: '600',
    color: color.text.primary,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
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
