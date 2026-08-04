import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { Fragment, useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { deleteTask, getTask, updateTask } from '@/api/tasks';
import { createSubtask, deleteSubtask, updateSubtask } from '@/api/subtasks';
import { Banner } from '@/components/banner';
import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { useSession } from '@/features/auth/session-context';
import { useNotificationCoordinator } from '@/features/notifications/notification-coordinator';
import {
  color,
  priorityColor,
  radius,
  space,
  subjectColor,
  taskTypeColor,
  taskTypeLabel,
  touchTarget,
  type as typeTokens,
} from '@/design-system/tokens';
import type { Task } from '@/types/api';

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
  const { requestDeadlineReconcile, requestWorkloadCheck } = useNotificationCoordinator();
  const [task, setTask] = useState<Task | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');

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

  if (isLoading) {
    return (
      <Screen>
        <BackRow />
        <ActivityIndicator color={color.primary.violet} />
      </Screen>
    );
  }

  if (loadError || !task) {
    return (
      <Screen>
        <BackRow />
        <Banner variant="error" message={loadError ?? 'Task not found'} />
      </Screen>
    );
  }

  // Only the fields that actually have a value become a row — this is
  // what makes "no divider gap for an omitted optional field" true by
  // construction (Estimate/Notes simply aren't in the array when absent),
  // rather than something rendered conditionally around a fixed divider
  // count. Notes is `stacked` since it can be long free text that must
  // wrap, unlike the other short single-line values.
  const detailRows: { key: string; label: string; value: string; dotColor?: string; stacked?: boolean }[] = [
    { key: 'type', label: 'Type', value: taskTypeLabel[task.type] },
    { key: 'deadline', label: 'Deadline', value: formatDeadline(task.deadline) },
    { key: 'priority', label: 'Priority', value: task.priority, dotColor: priorityColor[task.priority] },
    { key: 'status', label: 'Status', value: task.status },
    ...(task.estimate_hours !== null
      ? [{ key: 'estimate', label: 'Estimate', value: `${task.estimate_hours}h` }]
      : []),
    ...(task.notes ? [{ key: 'notes', label: 'Notes', value: task.notes, stacked: true }] : []),
  ];

  return (
    <Screen>
      <BackRow />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.typeDot, { backgroundColor: taskTypeColor[task.type] }]} />
        <ThemedText type="default" style={styles.title}>
          {task.title}
        </ThemedText>

        {task.subject && (
          <View style={styles.subjectChip}>
            <View
              style={[styles.subjectDot, { backgroundColor: subjectColor[task.subject.color_token] }]}
            />
            <ThemedText type="default" style={styles.metaText}>
              {task.subject.name}
              {task.subject.archived ? ' (archived)' : ''}
            </ThemedText>
          </View>
        )}

        <View style={styles.detailGroup}>
          {detailRows.map((row, index) => (
            <Fragment key={row.key}>
              <DetailRow label={row.label} value={row.value} dotColor={row.dotColor} stacked={row.stacked} />
              {index < detailRows.length - 1 && <View style={styles.divider} />}
            </Fragment>
          ))}
        </View>

        {task.reschedule_count > 0 && (
          <ThemedText type="default" style={styles.rescheduleNote}>
            Rescheduled {task.reschedule_count}x
          </ThemedText>
        )}

        <View style={styles.subtasksSection}>
          <ThemedText type="default" style={styles.sectionHeader}>
            Subtasks
          </ThemedText>
          {task.subtasks.length === 0 ? (
            <ThemedText type="default" style={styles.metaText}>
              No subtasks yet
            </ThemedText>
          ) : (
            <View style={styles.subtaskGroup}>
              {task.subtasks.map((subtask, index) => (
                <Fragment key={subtask.id}>
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
                      <Ionicons
                        name={subtask.is_complete ? 'checkbox' : 'square-outline'}
                        size={22}
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
                      onPress={() => handleDeleteSubtask(subtask.id, subtask.title)}
                    >
                      <ThemedText type="default" style={styles.deleteGlyph}>
                        ✕
                      </ThemedText>
                    </Pressable>
                  </View>
                  {index < task.subtasks.length - 1 && <View style={styles.divider} />}
                </Fragment>
              ))}
            </View>
          )}
          <View style={styles.addSubtaskRow}>
            <View style={styles.addSubtaskInput}>
              <TextField
                label="Add subtask"
                value={newSubtaskTitle}
                onChangeText={setNewSubtaskTitle}
                onSubmitEditing={handleAddSubtask}
              />
            </View>
            <Button label="Add" variant="secondary" onPress={handleAddSubtask} />
          </View>
        </View>

        <View style={styles.actions}>
          <Button
            label={task.status === 'Completed' ? 'Reopen' : 'Complete'}
            onPress={handleToggleComplete}
            loading={isBusy}
          />
          <Button label="Edit" variant="secondary" onPress={() => router.push(`/tasks/${task.id}/edit` as Href)} />
          <Button label="Delete" variant="destructive" onPress={handleDeleteTask} />
        </View>
      </ScrollView>
    </Screen>
  );
}

function BackRow() {
  return (
    <View style={styles.topBar}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        hitSlop={space.xs}
        onPress={() => router.back()}
        style={({ pressed }) => [styles.backControl, pressed && styles.backControlPressed]}
      >
        <Ionicons name="chevron-back" size={22} color={color.primary.violet} />
        <ThemedText type="default" style={styles.backLabel}>
          Back
        </ThemedText>
      </Pressable>
    </View>
  );
}

function DetailRow({
  label,
  value,
  dotColor,
  stacked,
}: {
  label: string;
  value: string;
  dotColor?: string;
  stacked?: boolean;
}) {
  // Notes uses the stacked layout (label above, value below, full width,
  // wraps naturally) since it can be arbitrarily long free text — the
  // inline label-left/value-right layout used for every short field
  // would either overflow or force an unusably narrow value column.
  if (stacked) {
    return (
      <View style={styles.detailRowStacked}>
        <ThemedText type="default" style={styles.detailLabel}>
          {label}
        </ThemedText>
        <ThemedText type="default" style={styles.detailValueStacked}>
          {value}
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.detailRow}>
      <ThemedText type="default" style={styles.detailLabel}>
        {label}
      </ThemedText>
      <View style={styles.detailValueRow}>
        {dotColor && <View style={[styles.priorityDot, { backgroundColor: dotColor }]} />}
        <ThemedText type="default" style={styles.detailValue} numberOfLines={1}>
          {value}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: space.sm,
    paddingBottom: space.xxl,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  backControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    minHeight: touchTarget.min,
    minWidth: touchTarget.min,
    paddingHorizontal: space.sm,
    marginLeft: -space.sm,
  },
  backControlPressed: {
    opacity: 0.6,
  },
  backLabel: {
    color: color.primary.violet,
    fontSize: typeTokens.body.fontSize,
    fontWeight: '600',
  },
  typeDot: {
    width: 12,
    height: 12,
    borderRadius: radius.pill,
  },
  title: {
    fontSize: typeTokens.heading.fontSize,
    lineHeight: typeTokens.heading.lineHeight,
    fontWeight: '700',
    color: color.text.primary,
  },
  subjectChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  subjectDot: {
    width: 10,
    height: 10,
    borderRadius: radius.pill,
  },
  metaText: {
    fontSize: typeTokens.caption.fontSize,
    color: color.text.secondary,
  },
  detailGroup: {
    backgroundColor: color.background.card,
    borderRadius: radius.card,
    overflow: 'hidden',
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
  detailRowStacked: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    gap: space.xs,
  },
  detailLabel: {
    fontSize: typeTokens.body.fontSize,
    color: color.text.secondary,
  },
  detailValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    flexShrink: 1,
  },
  detailValue: {
    fontSize: typeTokens.body.fontSize,
    color: color.text.primary,
    fontWeight: '600',
  },
  detailValueStacked: {
    fontSize: typeTokens.body.fontSize,
    color: color.text.primary,
    fontWeight: '600',
  },
  priorityDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
  },
  rescheduleNote: {
    fontSize: typeTokens.caption.fontSize,
    color: color.text.secondary,
    marginTop: space.xs,
  },
  subtasksSection: {
    marginTop: space.md,
    gap: space.xs,
  },
  subtaskGroup: {
    backgroundColor: color.background.card,
    borderRadius: radius.card,
    overflow: 'hidden',
  },
  sectionHeader: {
    fontSize: typeTokens.label.fontSize,
    fontWeight: '600',
    color: color.text.secondary,
    textTransform: 'uppercase',
  },
  subtaskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: touchTarget.min,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  checkbox: {
    minWidth: touchTarget.min,
    minHeight: touchTarget.min,
    alignItems: 'center',
    justifyContent: 'center',
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
  deleteGlyph: {
    color: color.risk.high.text,
    fontSize: typeTokens.body.fontSize,
    padding: space.xs,
  },
  addSubtaskRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.sm,
    marginTop: space.sm,
  },
  addSubtaskInput: {
    flex: 1,
  },
  actions: {
    marginTop: space.lg,
    gap: space.sm,
  },
});
