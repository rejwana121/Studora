import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { Banner } from '@/components/banner';
import { Button } from '@/components/button';
import { DeadlinePicker } from '@/components/deadline-picker';
import { ThemedText } from '@/components/themed-text';
import {
  color,
  radius,
  space,
  subjectColor,
  touchTarget,
  type as typeTokens,
} from '@/design-system/tokens';

import { TaskPickerModal, type PickerTaskSummary } from './task-picker';

export interface StudyBlockFormValues {
  task_id: string | null;
  starts_at: string;
  ends_at: string;
}

export interface StudyBlockFormInitial {
  taskId: string | null;
  taskSnapshot: PickerTaskSummary | null;
  startsAt: Date;
  endsAt: Date;
}

interface StudyBlockFormProps {
  token: string;
  initial: StudyBlockFormInitial;
  submitLabel: string;
  onSubmit: (values: StudyBlockFormValues) => Promise<string | null>;
  isSubmitting: boolean;
  onDelete?: () => void;
  isDeleting?: boolean;
}

export function StudyBlockForm({
  token,
  initial,
  submitLabel,
  onSubmit,
  isSubmitting,
  onDelete,
  isDeleting,
}: StudyBlockFormProps) {
  const [taskId, setTaskId] = useState<string | null>(initial.taskId);
  const [taskSnapshot, setTaskSnapshot] = useState<PickerTaskSummary | null>(initial.taskSnapshot);
  const [startsAt, setStartsAt] = useState<Date>(initial.startsAt);
  const [endsAt, setEndsAt] = useState<Date>(initial.endsAt);
  const [isPickerVisible, setIsPickerVisible] = useState(false);
  const [dateError, setDateError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  function handleSelectTask(task: PickerTaskSummary | null) {
    setTaskId(task ? task.id : null);
    setTaskSnapshot(task);
  }

  async function handleSubmit() {
    setServerError(null);
    if (endsAt.getTime() <= startsAt.getTime()) {
      setDateError('End must be after start');
      return;
    }
    setDateError(null);

    const error = await onSubmit({
      task_id: taskId,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
    });
    if (error) setServerError(error);
  }

  function handleDeletePress() {
    Alert.alert('Delete study block?', 'This study block will be permanently deleted.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: onDelete },
    ]);
  }

  return (
    <View style={styles.form}>
      {serverError && <Banner variant="error" message={serverError} />}

      <View style={styles.taskFieldContainer}>
        <ThemedText type="default" style={styles.label}>
          Task
        </ThemedText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={taskSnapshot ? `Linked task: ${taskSnapshot.title}` : 'No task linked'}
          onPress={() => setIsPickerVisible(true)}
          style={({ pressed }) => [styles.taskField, pressed && styles.taskFieldPressed]}
        >
          <View style={styles.taskFieldContent}>
            <ThemedText type="default" style={styles.taskFieldTitle} numberOfLines={1}>
              {taskSnapshot ? taskSnapshot.title : 'No task'}
            </ThemedText>
            {taskSnapshot?.subject && (
              <View style={styles.subjectChip}>
                <View
                  style={[
                    styles.subjectDot,
                    { backgroundColor: subjectColor[taskSnapshot.subject.color_token] },
                  ]}
                />
                <ThemedText type="default" style={styles.metaText}>
                  {taskSnapshot.subject.name}
                  {taskSnapshot.subject.archived ? ' (archived)' : ''}
                </ThemedText>
              </View>
            )}
          </View>
          <ThemedText type="default" style={styles.changeLabel}>
            Change
          </ThemedText>
        </Pressable>
      </View>

      <DeadlinePicker label="Start" value={startsAt} onChange={setStartsAt} />
      <DeadlinePicker label="End" value={endsAt} onChange={setEndsAt} error={dateError} />

      <Button label={submitLabel} onPress={handleSubmit} loading={isSubmitting} />
      {onDelete && (
        <Button label="Delete" variant="secondary" onPress={handleDeletePress} loading={isDeleting} />
      )}

      <TaskPickerModal
        visible={isPickerVisible}
        token={token}
        currentTask={taskSnapshot}
        onSelect={handleSelectTask}
        onClose={() => setIsPickerVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: space.md,
  },
  label: {
    color: color.text.secondary,
    fontSize: typeTokens.label.fontSize,
    lineHeight: typeTokens.label.lineHeight,
    fontWeight: typeTokens.label.fontWeight,
  },
  taskFieldContainer: {
    gap: space.xs,
  },
  taskField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: touchTarget.min,
    borderRadius: radius.control,
    borderWidth: 1.5,
    borderColor: color.border.divider,
    backgroundColor: color.background.card,
    paddingHorizontal: space.md,
  },
  taskFieldPressed: {
    opacity: 0.7,
  },
  taskFieldContent: {
    flex: 1,
    gap: space.xs,
    paddingVertical: space.sm,
  },
  taskFieldTitle: {
    fontSize: typeTokens.body.fontSize,
    color: color.text.primary,
    fontWeight: '600',
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
  metaText: {
    fontSize: typeTokens.caption.fontSize,
    color: color.text.secondary,
  },
  changeLabel: {
    color: color.primary.violet,
    fontSize: typeTokens.label.fontSize,
    fontWeight: '600',
  },
});
