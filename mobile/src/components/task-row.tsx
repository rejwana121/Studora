import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Icon } from './icon';
import { ThemedText } from './themed-text';
import {
  color,
  elevation,
  priorityBadgeTone,
  priorityColor,
  radius,
  shadowStyle,
  space,
  subjectColor,
  taskTypeColor,
  taskTypeIcon,
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

function formatDueBadge(iso: string): string {
  const date = new Date(iso);
  return `Due ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

interface TaskRowProps {
  task: Task;
  onPress: () => void;
  /** "card" (default): standalone row with its own background/radius —
   * unchanged behavior for every existing caller (Today does not import
   * this component at all — its own TodayTaskRow is independent — so this
   * variant currently has no live caller; kept as-is regardless). "grouped":
   * the Tasks-list card presentation used below. */
  variant?: 'card' | 'grouped';
  /** "grouped" only. Toggles complete/reopen directly from the list —
   * reuses the exact same `updateTask(..., { status })` call Task Detail's
   * own Complete/Reopen button already makes; this only wires a second
   * entry point to it, no new API behavior. Omit to render the completion
   * control as a non-interactive (disabled) indicator. */
  onToggleComplete?: () => void;
  /** "grouped" only. True while this row's own toggle request is in
   * flight — disables the control and shows a spinner in place of the
   * glyph, preventing a duplicate tap from firing a second request. */
  isTogglingComplete?: boolean;
}

export function TaskRow({ task, onPress, variant = 'card', onToggleComplete, isTogglingComplete }: TaskRowProps) {
  if (variant === 'grouped') {
    return (
      <GroupedTaskRow
        task={task}
        onPress={onPress}
        onToggleComplete={onToggleComplete}
        isTogglingComplete={isTogglingComplete}
      />
    );
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

/** Tasks-list card: type icon badge (left), title/subject/deadline+priority
 * badges (center), large completion control (right) — matching the
 * approved Tasks reference. A coral left accent marks an active,
 * past-deadline task (same `isActive && deadline < now` condition the
 * segment filter and Today's own row already use — no new "overdue" rule
 * invented here). Overdue is never colour-only: the deadline badge itself
 * swaps its text to the word "Overdue", not just its tint — stricter than
 * the reference image (which relies on the badge's coral tint alone), kept
 * this way to match this app's existing "never colour alone" convention
 * (see Today's TodayTaskRow doc comment). */
function GroupedTaskRow({
  task,
  onPress,
  onToggleComplete,
  isTogglingComplete,
}: {
  task: Task;
  onPress: () => void;
  onToggleComplete?: () => void;
  isTogglingComplete?: boolean;
}) {
  const isActive = task.status === 'Pending' || task.status === 'InProgress';
  const isOverdue = isActive && new Date(task.deadline).getTime() < Date.now();
  const isCompleted = task.status === 'Completed';
  const deadlineLabel = isOverdue ? 'Overdue' : formatDueBadge(task.deadline);
  const deadlineTone = isOverdue
    ? { bg: color.risk.high.bg, text: color.risk.high.text }
    : { bg: color.accent.lavender, text: color.primary.violet };
  const priorityTone = priorityBadgeTone[task.priority];
  const subjectLabel = task.subject
    ? `${task.subject.name}${task.subject.archived ? ' (archived)' : ''}`
    : null;
  const rowAccessibilityLabel = `${task.title}${subjectLabel ? `, ${subjectLabel}` : ''}, ${task.priority} priority, ${deadlineLabel}${isCompleted ? ', completed' : ''}`;
  const toggleDisabled = !onToggleComplete || isTogglingComplete;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={rowAccessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [styles.cardOuter, pressed && styles.pressed]}
    >
      <View style={styles.cardInner}>
        {isOverdue && <View style={styles.accentBar} />}
        <View style={styles.typeBadge}>
          <Icon name={taskTypeIcon[task.type]} size="md" color={color.primary.violet} />
        </View>
        <View style={styles.cardBody}>
          <ThemedText
            type="default"
            style={[styles.title, isCompleted && styles.titleCompleted]}
            numberOfLines={1}
          >
            {task.title}
          </ThemedText>
          {subjectLabel && (
            <ThemedText type="default" style={styles.subject} numberOfLines={1}>
              {subjectLabel}
            </ThemedText>
          )}
          <View style={styles.badgeRow}>
            <View style={[styles.badge, { backgroundColor: deadlineTone.bg }]}>
              <Icon name="calendar-outline" size="sm" color={deadlineTone.text} />
              <ThemedText type="default" style={[styles.badgeText, { color: deadlineTone.text }]} numberOfLines={1}>
                {deadlineLabel}
              </ThemedText>
            </View>
            <View style={[styles.badge, { backgroundColor: priorityTone.bg }]}>
              <Icon name="flag-outline" size="sm" color={priorityTone.text} />
              <ThemedText type="default" style={[styles.badgeText, { color: priorityTone.text }]} numberOfLines={1}>
                {task.priority}
              </ThemedText>
            </View>
          </View>
        </View>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: isCompleted, disabled: toggleDisabled }}
          accessibilityLabel={isCompleted ? `Mark ${task.title} incomplete` : `Mark ${task.title} complete`}
          disabled={toggleDisabled}
          hitSlop={space.xs}
          onPress={(event) => {
            event.stopPropagation();
            onToggleComplete?.();
          }}
          style={styles.completionControl}
        >
          {isTogglingComplete ? (
            <ActivityIndicator size="small" color={color.primary.violet} />
          ) : (
            <Icon
              name={isCompleted ? 'checkmark-circle' : 'ellipse-outline'}
              size="lg"
              color={isCompleted ? color.primary.violet : color.text.secondary}
            />
          )}
        </Pressable>
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
  // --- "grouped" (Tasks-list card) styles ---
  // Shadow lives on the outer Pressable, never on `cardInner` — `cardInner`
  // needs `overflow: hidden` so the accent bar's square corners get
  // clipped to the card's own rounded corners, and overflow:hidden on the
  // same view as a shadow clips the shadow too (see Avatar's identical
  // two-layer split).
  cardOuter: {
    borderRadius: radius.card,
    ...shadowStyle(elevation.card),
  },
  cardInner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    backgroundColor: color.background.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.border.divider,
    padding: space.md,
    overflow: 'hidden',
  },
  accentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: color.accent.coral,
  },
  typeBadge: {
    width: 44,
    height: 44,
    borderRadius: radius.control,
    backgroundColor: color.accent.lavender,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    flex: 1,
    gap: space.xs,
  },
  subject: {
    fontSize: typeTokens.caption.fontSize,
    color: color.text.secondary,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
    marginTop: 2,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: space.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  badgeText: {
    fontSize: typeTokens.caption.fontSize,
    fontWeight: '600',
  },
  completionControl: {
    minWidth: touchTarget.min,
    minHeight: touchTarget.min,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
