import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { Fragment, useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { deleteTask, getTask, updateTask } from '@/api/tasks';
import { createSubtask, deleteSubtask, updateSubtask } from '@/api/subtasks';
import { Banner } from '@/components/banner';
import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { SectionCard } from '@/components/section-card';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { useSession } from '@/features/auth/session-context';
import { useNotificationCoordinator } from '@/features/notifications/notification-coordinator';
import { OptionSheet } from '@/features/tasks/option-sheet';
import {
  color,
  elevation,
  priorityBadgeTone,
  radius,
  shadowStyle,
  space,
  taskTypeIcon,
  taskTypeLabel,
  touchTarget,
  type as typeTokens,
} from '@/design-system/tokens';
import { formatEstimate } from '@/lib/format';
import type { Task, TaskStatus } from '@/types/api';

const STATUS_LABEL: Record<TaskStatus, string> = {
  Pending: 'Pending',
  InProgress: 'In Progress',
  Completed: 'Completed',
  Cancelled: 'Cancelled',
};

function formatDeadline(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function TaskDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const insets = useSafeAreaInsets();
  const { requestDeadlineReconcile, requestWorkloadCheck } = useNotificationCoordinator();
  const [task, setTask] = useState<Task | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const load = useCallback(() => {
    if (!session || !id) return;
    setIsLoading(true);
    getTask(session.access_token, id).then((result) => {
      if (result.ok) {
        setTask(result.data);
        setLoadError(null);
      } else {
        setLoadError(result.error.message);
      }
      setIsLoading(false);
    });
  }, [session, id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handleToggleComplete() {
    if (!session || !task) return;
    setIsBusy(true);
    const nextStatus = task.status === 'Completed' ? 'Pending' : 'Completed';
    const result = await updateTask(session.access_token, task.id, { status: nextStatus });
    setIsBusy(false);
    if (result.ok) {
      setTask(result.data);
      requestDeadlineReconcile();
      requestWorkloadCheck();
    } else {
      Alert.alert('Could not update task', result.error.message);
    }
  }

  function handleDeleteTask() {
    if (!task) return;
    setIsMenuOpen(false);
    Alert.alert('Delete task?', `"${task.title}" and its subtasks will be permanently deleted.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: confirmDeleteTask },
    ]);
  }

  async function confirmDeleteTask() {
    if (!session || !task) return;
    setIsBusy(true);
    const result = await deleteTask(session.access_token, task.id);
    setIsBusy(false);
    if (result.ok) {
      requestDeadlineReconcile();
      requestWorkloadCheck();
      router.back();
    } else {
      Alert.alert('Could not delete task', result.error.message);
    }
  }

  async function handleToggleSubtask(subtaskId: string, isComplete: boolean) {
    if (!session || !task) return;
    const result = await updateSubtask(session.access_token, task.id, subtaskId, {
      is_complete: isComplete,
    });
    if (result.ok) {
      load();
      requestWorkloadCheck();
    } else {
      Alert.alert('Could not update subtask', result.error.message);
    }
  }

  function handleDeleteSubtask(subtaskId: string, title: string) {
    Alert.alert('Delete subtask?', `"${title}" will be permanently deleted.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (!session || !task) return;
          const result = await deleteSubtask(session.access_token, task.id, subtaskId);
          if (result.ok) {
            load();
            requestWorkloadCheck();
          } else {
            Alert.alert('Could not delete subtask', result.error.message);
          }
        },
      },
    ]);
  }

  async function handleAddSubtask() {
    if (!session || !task) return;
    const title = newSubtaskTitle.trim();
    if (!title) return;
    const result = await createSubtask(session.access_token, task.id, { title });
    if (result.ok) {
      setNewSubtaskTitle('');
      load();
      requestWorkloadCheck();
    } else {
      Alert.alert('Could not add subtask', result.error.message);
    }
  }

  // Truthful, derived-only progress — never a stored/mock field. With
  // subtasks: completed/total, rounded. Without any subtasks: 100 only
  // once the task itself is Completed, 0 otherwise. Both branches read
  // only data already fetched for this screen.
  const progressPercent = useMemo(() => {
    if (!task) return 0;
    if (task.subtasks.length > 0) {
      const done = task.subtasks.filter((s) => s.is_complete).length;
      return Math.round((done / task.subtasks.length) * 100);
    }
    return task.status === 'Completed' ? 100 : 0;
  }, [task]);

  return (
    // `edges` excludes 'top': SafeAreaView's own canvas background would
    // otherwise paint the status-bar strip a different colour than
    // `headerSurface`'s periwinkle. `headerSurface` absorbs `insets.top`
    // into its own paddingTop instead, so the periwinkle extends
    // continuously through the status bar — same single inset, just
    // relocated onto the periwinkle element; header height/content
    // position is unchanged.
    //
    // `headerSurface` is a plain (non-absolute) sibling rendered before
    // the ScrollView below, so scrolled cards can never render behind or
    // through it — no z-index bug to begin with. The explicit `zIndex`
    // and shadow here are a deliberate, visible opaque boundary (belt-
    // and-suspenders against any future overlap), not a fix for an
    // existing translucency bug.
    <SafeAreaView style={styles.outerSafeArea} edges={['left', 'right', 'bottom']}>
      <View style={[styles.headerSurface, { paddingTop: insets.top + space.sm }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.headerCircleButton, pressed && styles.pressed]}
        >
          <Icon name="chevron-back" size="md" color={color.text.primary} />
        </Pressable>
        <ThemedText type="default" style={styles.headerTitle}>
          Task Details
        </ThemedText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="More actions"
          onPress={() => setIsMenuOpen(true)}
          disabled={!task}
          style={({ pressed }) => [styles.headerCircleButton, pressed && styles.pressed]}
        >
          <Icon name="ellipsis-horizontal" size="md" color={color.text.primary} />
        </Pressable>
      </View>

      {isLoading && <ActivityIndicator style={styles.loading} color={color.primary.violet} />}
      {!isLoading && (loadError || !task) && (
        <View style={styles.content}>
          <Banner variant="error" message={loadError ?? 'Task not found'} />
        </View>
      )}

      {!isLoading && task && (
        <ScrollView contentContainerStyle={styles.content}>
          <SectionCard style={styles.summaryCard}>
            <View style={styles.summaryTop}>
              <View style={styles.typeBadge}>
                <Icon name={taskTypeIcon[task.type]} size="lg" color={color.primary.violet} />
              </View>
              <View style={styles.summaryTextBlock}>
                <ThemedText type="default" style={styles.title}>
                  {task.title}
                </ThemedText>
                {task.subject && (
                  <ThemedText type="default" style={styles.subject} numberOfLines={1}>
                    {task.subject.name}
                    {task.subject.archived ? ' (archived)' : ''}
                  </ThemedText>
                )}
              </View>
            </View>

            <BadgeRow task={task} />

            {task.reschedule_count > 0 && (
              <ThemedText type="default" style={styles.rescheduleNote}>
                Rescheduled {task.reschedule_count}x
              </ThemedText>
            )}
          </SectionCard>

          <SectionCard style={styles.section} padded={false}>
            <DetailRow icon="calendar-outline" label="Deadline" value={formatDeadline(task.deadline)} />
            <View style={styles.divider} />
            <DetailRow icon="ellipse-outline" label="Status" value={STATUS_LABEL[task.status]} />
            {task.estimate_hours !== null && (
              <>
                <View style={styles.divider} />
                <DetailRow icon="time-outline" label="Estimated time" value={formatEstimate(task.estimate_hours)} />
              </>
            )}
          </SectionCard>

          {task.notes && (
            <SectionCard style={styles.section}>
              <ThemedText type="default" style={styles.groupLabel}>
                Notes
              </ThemedText>
              <ThemedText type="default" style={styles.notesText}>
                {task.notes}
              </ThemedText>
            </SectionCard>
          )}

          <SectionCard style={styles.section}>
            <View style={styles.progressHeaderRow}>
              <ThemedText type="default" style={styles.groupLabel}>
                Progress
              </ThemedText>
              <ThemedText type="default" style={styles.progressPercent}>
                {progressPercent}%
              </ThemedText>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
            </View>
          </SectionCard>

          <SectionCard style={styles.section} padded={false}>
            <View style={styles.subtasksHeaderRow}>
              <ThemedText type="default" style={styles.groupLabel}>
                Subtasks
              </ThemedText>
            </View>
            {task.subtasks.length === 0 ? (
              <ThemedText type="default" style={styles.noSubtasksText}>
                No subtasks yet
              </ThemedText>
            ) : (
              task.subtasks.map((subtask, index) => (
                <Fragment key={subtask.id}>
                  {index > 0 && <View style={styles.divider} />}
                  <View style={styles.subtaskRow}>
                    <Pressable
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: subtask.is_complete }}
                      accessibilityLabel={
                        subtask.is_complete
                          ? `Mark ${subtask.title} incomplete`
                          : `Mark ${subtask.title} complete`
                      }
                      onPress={() => handleToggleSubtask(subtask.id, !subtask.is_complete)}
                      style={styles.checkbox}
                    >
                      <Icon
                        name={subtask.is_complete ? 'checkbox' : 'square-outline'}
                        size="lg"
                        color={subtask.is_complete ? color.primary.violet : color.text.secondary}
                      />
                    </Pressable>
                    <ThemedText
                      type="default"
                      style={[styles.subtaskTitle, subtask.is_complete && styles.subtaskTitleDone]}
                    >
                      {subtask.title}
                    </ThemedText>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Delete ${subtask.title}`}
                      hitSlop={space.xs}
                      onPress={() => handleDeleteSubtask(subtask.id, subtask.title)}
                      style={styles.deleteSubtaskButton}
                    >
                      <Icon name="trash-outline" size="sm" color={color.risk.high.text} />
                    </Pressable>
                  </View>
                </Fragment>
              ))
            )}
            <View style={styles.divider} />
            <View style={styles.addSubtaskRow}>
              <View style={styles.addSubtaskInput}>
                <TextField
                  label="Add subtask"
                  value={newSubtaskTitle}
                  onChangeText={setNewSubtaskTitle}
                  onSubmitEditing={handleAddSubtask}
                  icon="add-circle"
                  placeholder="Add subtask"
                />
              </View>
              <Button label="Add" variant="secondary" onPress={handleAddSubtask} />
            </View>
          </SectionCard>

          <View style={styles.actions}>
            <IconActionButton
              icon="create-outline"
              label="Edit Task"
              variant="secondary"
              onPress={() => router.push(`/tasks/${task.id}/edit` as Href)}
            />
            <IconActionButton
              icon="checkmark-circle-outline"
              label={task.status === 'Completed' ? 'Reopen' : 'Mark Complete'}
              variant="primary"
              onPress={handleToggleComplete}
              loading={isBusy}
            />
          </View>
        </ScrollView>
      )}

      <OptionSheet
        visible={isMenuOpen}
        title="Task actions"
        options={[{ value: 'delete', label: 'Delete Task', destructive: true }]}
        value={null}
        onSelect={handleDeleteTask}
        onCancel={() => setIsMenuOpen(false)}
      />
    </SafeAreaView>
  );
}

function BadgeRow({ task }: { task: Task }) {
  const isActive = task.status === 'Pending' || task.status === 'InProgress';
  const isOverdue = isActive && new Date(task.deadline).getTime() < Date.now();
  const priorityTone = priorityBadgeTone[task.priority];

  return (
    <View style={styles.badgeRow}>
      {isOverdue && (
        <View style={[styles.badge, { backgroundColor: color.risk.high.bg }]}>
          <Icon name="alert-circle" size="sm" color={color.risk.high.text} />
          <ThemedText type="default" style={[styles.badgeText, { color: color.risk.high.text }]}>
            Overdue
          </ThemedText>
        </View>
      )}
      <View style={[styles.badge, { backgroundColor: priorityTone.bg }]}>
        <Icon name="flag-outline" size="sm" color={priorityTone.text} />
        <ThemedText type="default" style={[styles.badgeText, { color: priorityTone.text }]}>
          {task.priority} priority
        </ThemedText>
      </View>
      <View style={[styles.badge, { backgroundColor: color.accent.lavender }]}>
        <Icon name={taskTypeIcon[task.type]} size="sm" color={color.primary.violet} />
        <ThemedText type="default" style={[styles.badgeText, { color: color.primary.violet }]}>
          {taskTypeLabel[task.type]}
        </ThemedText>
      </View>
    </View>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ComponentProps<typeof Icon>['name'];
  label: string;
  value: string;
}) {
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailLabelRow}>
        <Icon name={icon} size="sm" color={color.text.secondary} />
        <ThemedText type="default" style={styles.detailLabel}>
          {label}
        </ThemedText>
      </View>
      <ThemedText type="default" style={styles.detailValue} numberOfLines={1}>
        {value}
      </ThemedText>
    </View>
  );
}

/** The shared `Button` component has no icon slot — same situation Profile
 * ran into for "Edit Profile", solved there with a bespoke icon+label
 * Pressable rather than adding an icon prop to the app-wide `Button`. This
 * follows that same precedent instead of touching the shared component. */
function IconActionButton({
  icon,
  label,
  variant,
  onPress,
  loading,
}: {
  icon: React.ComponentProps<typeof Icon>['name'];
  label: string;
  variant: 'primary' | 'secondary';
  onPress: () => void;
  loading?: boolean;
}) {
  const isPrimary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!loading, busy: !!loading }}
      disabled={loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        isPrimary ? styles.actionButtonPrimary : styles.actionButtonSecondary,
        pressed && styles.pressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={isPrimary ? color.text.onFill : color.primary.violet} />
      ) : (
        <>
          <Icon name={icon} size="sm" color={isPrimary ? color.text.onFill : color.primary.violet} />
          <ThemedText
            type="default"
            style={[styles.actionButtonLabel, { color: isPrimary ? color.text.onFill : color.primary.violet }]}
          >
            {label}
          </ThemedText>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  outerSafeArea: {
    flex: 1,
    backgroundColor: color.surface.canvas,
  },
  headerSurface: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: color.surface.headerSoft,
    paddingHorizontal: space.md,
    // paddingTop is set inline (insets.top + space.sm) — see the render's
    // comment on why the SafeAreaView above excludes the 'top' edge.
    paddingBottom: space.sm,
    borderBottomLeftRadius: radius.card,
    borderBottomRightRadius: radius.card,
    zIndex: 1,
    ...shadowStyle(elevation.card),
  },
  headerCircleButton: {
    width: touchTarget.min,
    height: touchTarget.min,
    borderRadius: radius.pill,
    backgroundColor: color.background.card,
    borderWidth: 1,
    borderColor: color.border.divider,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  headerTitle: {
    fontSize: typeTokens.heading.fontSize,
    lineHeight: typeTokens.heading.lineHeight,
    fontWeight: '700',
    color: color.text.primary,
  },
  loading: {
    marginTop: space.lg,
  },
  content: {
    padding: space.lg,
    gap: space.md,
    paddingBottom: space.xxl,
  },
  summaryCard: {
    gap: space.sm,
  },
  summaryTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  typeBadge: {
    width: 56,
    height: 56,
    borderRadius: radius.control,
    backgroundColor: color.accent.lavender,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryTextBlock: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: typeTokens.heading.fontSize,
    lineHeight: typeTokens.heading.lineHeight,
    fontWeight: '700',
    color: color.text.primary,
  },
  subject: {
    fontSize: typeTokens.body.fontSize,
    color: color.text.secondary,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
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
  rescheduleNote: {
    fontSize: typeTokens.caption.fontSize,
    color: color.text.secondary,
  },
  section: {
    gap: space.sm,
  },
  divider: {
    height: 1,
    backgroundColor: color.border.divider,
    marginHorizontal: space.md,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: touchTarget.min,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  detailLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  detailLabel: {
    fontSize: typeTokens.body.fontSize,
    color: color.text.secondary,
  },
  detailValue: {
    fontSize: typeTokens.body.fontSize,
    color: color.text.primary,
    fontWeight: '600',
  },
  groupLabel: {
    fontSize: typeTokens.subheading.fontSize,
    lineHeight: typeTokens.subheading.lineHeight,
    fontWeight: '700',
    color: color.text.primary,
  },
  notesText: {
    fontSize: typeTokens.body.fontSize,
    lineHeight: typeTokens.body.lineHeight,
    color: color.text.primary,
  },
  progressHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressPercent: {
    fontSize: typeTokens.body.fontSize,
    fontWeight: '700',
    color: color.text.primary,
  },
  progressTrack: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: color.border.divider,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: color.primary.violet,
  },
  subtasksHeaderRow: {
    paddingHorizontal: space.md,
    paddingTop: space.md,
    paddingBottom: space.xs,
  },
  noSubtasksText: {
    fontSize: typeTokens.body.fontSize,
    color: color.text.secondary,
    paddingHorizontal: space.md,
    paddingBottom: space.md,
  },
  subtaskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: touchTarget.min,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  checkbox: {
    minWidth: touchTarget.min,
    minHeight: touchTarget.min,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -space.sm,
  },
  subtaskTitle: {
    flex: 1,
    fontSize: typeTokens.body.fontSize,
    color: color.text.primary,
  },
  subtaskTitleDone: {
    textDecorationLine: 'line-through',
    color: color.text.secondary,
  },
  deleteSubtaskButton: {
    minWidth: touchTarget.min,
    minHeight: touchTarget.min,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -space.sm,
  },
  addSubtaskRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.sm,
    padding: space.md,
  },
  addSubtaskInput: {
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: space.sm,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    minHeight: touchTarget.min,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
  },
  actionButtonPrimary: {
    backgroundColor: color.primary.violet,
  },
  actionButtonSecondary: {
    backgroundColor: color.background.card,
    borderWidth: 1.5,
    borderColor: color.primary.violet,
  },
  actionButtonLabel: {
    fontSize: typeTokens.body.fontSize,
    fontWeight: '600',
  },
});
