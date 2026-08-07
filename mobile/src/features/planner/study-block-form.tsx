import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Banner } from '@/components/banner';
import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { SectionCard } from '@/components/section-card';
import { ThemedText } from '@/components/themed-text';
import { color, radius, space, touchTarget, type as typeTokens } from '@/design-system/tokens';

import { TaskPickerModal, type PickerTaskSummary } from '@/features/tasks/task-picker';

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

const DURATION_PRESETS_MIN = [25, 45, 60];

/** Same light-surface fix `DeadlinePicker` applies to its own pickers —
 * duplicated locally (not imported: `deadline-picker.tsx` doesn't export
 * it, and this form deliberately never imports from that file — see
 * below) rather than shared, since it's 3 lines. */
const IOS_PICKER_PROPS =
  Platform.OS === 'ios'
    ? { themeVariant: 'light' as const, textColor: color.text.primary, accentColor: color.primary.violet }
    : {};

function mergeDatePart(base: Date, datePart: Date): Date {
  const next = new Date(base);
  next.setFullYear(datePart.getFullYear(), datePart.getMonth(), datePart.getDate());
  return next;
}

function mergeTimePart(base: Date, timePart: Date): Date {
  const next = new Date(base);
  next.setHours(timePart.getHours(), timePart.getMinutes(), 0, 0);
  return next;
}

function formatDate(value: Date): string {
  return value.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTime(value: Date): string {
  return value.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

type ActivePicker = 'date' | 'start' | 'end' | null;

/** Two grouped cards — "Study details" (subject + linked task) and
 * "Schedule" (date, start, duration presets, end) — matching the
 * approved reference's card grouping and row density. No "Planning"/
 * session-goal card: the real `StudyBlockCreate`/`StudyBlockUpdate`
 * model only has `task_id`, `starts_at`, `ends_at` (types/api.ts) — a
 * goal field would be display-only fiction with nothing to save it to.
 *
 * "Subject" is not a real field either — it's the linked task's own
 * `subject`, shown read-only for the reference's visual parity; both it
 * and the "Linked task" row open the same task picker, since picking a
 * task is the only real way to change either. No `subject_id` is ever
 * sent.
 *
 * This form intentionally does NOT import `DeadlinePicker` — that
 * component is shared with Tasks' own New/Edit Task form and must stay
 * pixel/behavior-identical there. The compact date/time rows below are a
 * separate, local implementation over the same underlying
 * `@react-native-community/datetimepicker`, so Tasks is never touched. */
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
  const [isTaskPickerVisible, setIsTaskPickerVisible] = useState(false);
  const [activePicker, setActivePicker] = useState<ActivePicker>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  function handleSelectTask(task: PickerTaskSummary | null) {
    setTaskId(task ? task.id : null);
    setTaskSnapshot(task);
  }

  // Editing Date or Start preserves the current duration (shifts `endsAt`
  // by the same delta) — matches the reference's implied Start+Duration
  // -> End model. A duration preset then overrides that duration
  // exactly. Editing End directly (still fully free-form, any time of
  // day) is the preserved "arbitrary end time" escape hatch — its date
  // stays locked to `startsAt`'s date, same as the presets already
  // assume; only end-of-day time is independently free, which covers
  // every real study-block case without reintroducing an independent,
  // cross-midnight end date.
  function handleDateChange(event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS !== 'ios') setActivePicker(null);
    if (event.type === 'dismissed' || !selected) return;
    const durationMs = endsAt.getTime() - startsAt.getTime();
    const nextStart = mergeDatePart(startsAt, selected);
    setStartsAt(nextStart);
    setEndsAt(new Date(nextStart.getTime() + durationMs));
  }

  function handleStartTimeChange(event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS !== 'ios') setActivePicker(null);
    if (event.type === 'dismissed' || !selected) return;
    const durationMs = endsAt.getTime() - startsAt.getTime();
    const nextStart = mergeTimePart(startsAt, selected);
    setStartsAt(nextStart);
    setEndsAt(new Date(nextStart.getTime() + durationMs));
  }

  function handleEndTimeChange(event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS !== 'ios') setActivePicker(null);
    if (event.type === 'dismissed' || !selected) return;
    setEndsAt(mergeTimePart(mergeDatePart(endsAt, startsAt), selected));
  }

  function applyDurationPreset(minutes: number) {
    setEndsAt(new Date(startsAt.getTime() + minutes * 60000));
  }

  const currentDurationMinutes = Math.round((endsAt.getTime() - startsAt.getTime()) / 60000);

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

      <SectionCard variant="default" style={styles.card}>
        <ThemedText type="default" style={styles.cardHeading}>
          Study details
        </ThemedText>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            taskSnapshot?.subject ? `Subject: ${taskSnapshot.subject.name}` : 'Subject: select through linked task'
          }
          onPress={() => setIsTaskPickerVisible(true)}
          style={({ pressed }) => [styles.fieldRow, pressed && styles.fieldRowPressed]}
        >
          <View style={styles.fieldIconBadge}>
            <Icon name="book-outline" size="sm" color={color.primary.violet} />
          </View>
          <ThemedText type="default" style={styles.fieldLabel}>
            Subject
          </ThemedText>
          <ThemedText type="default" style={styles.fieldValue} numberOfLines={1}>
            {taskSnapshot?.subject ? taskSnapshot.subject.name : 'Select through linked task'}
          </ThemedText>
          <Icon name="chevron-forward" size="sm" color={color.text.secondary} />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={taskSnapshot ? `Linked task: ${taskSnapshot.title}` : 'Linked task: none'}
          onPress={() => setIsTaskPickerVisible(true)}
          style={({ pressed }) => [styles.fieldRow, pressed && styles.fieldRowPressed]}
        >
          <View style={styles.fieldIconBadge}>
            <Icon name="link-outline" size="sm" color={color.primary.violet} />
          </View>
          <ThemedText type="default" style={styles.fieldLabel}>
            Linked task
          </ThemedText>
          <ThemedText type="default" style={styles.fieldValue} numberOfLines={1}>
            {taskSnapshot ? taskSnapshot.title : 'No linked task'}
          </ThemedText>
          <Icon name="chevron-forward" size="sm" color={color.text.secondary} />
        </Pressable>
      </SectionCard>

      <SectionCard variant="default" style={styles.card}>
        <ThemedText type="default" style={styles.cardHeading}>
          Schedule
        </ThemedText>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Date: ${formatDate(startsAt)}`}
          onPress={() => setActivePicker('date')}
          style={({ pressed }) => [styles.fieldRow, pressed && styles.fieldRowPressed]}
        >
          <View style={styles.fieldIconBadge}>
            <Icon name="calendar-outline" size="sm" color={color.primary.violet} />
          </View>
          <ThemedText type="default" style={styles.fieldLabel}>
            Date
          </ThemedText>
          <ThemedText type="default" style={styles.fieldValue} numberOfLines={1}>
            {formatDate(startsAt)}
          </ThemedText>
          <Icon name="chevron-forward" size="sm" color={color.text.secondary} />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Start: ${formatTime(startsAt)}`}
          onPress={() => setActivePicker('start')}
          style={({ pressed }) => [styles.fieldRow, pressed && styles.fieldRowPressed]}
        >
          <View style={styles.fieldIconBadge}>
            <Icon name="time-outline" size="sm" color={color.primary.violet} />
          </View>
          <ThemedText type="default" style={styles.fieldLabel}>
            Start
          </ThemedText>
          <ThemedText type="default" style={styles.fieldValue} numberOfLines={1}>
            {formatTime(startsAt)}
          </ThemedText>
          <Icon name="chevron-forward" size="sm" color={color.text.secondary} />
        </Pressable>

        <ThemedText type="default" style={styles.durationLabel}>
          Duration
        </ThemedText>
        <View style={styles.durationRow}>
          {DURATION_PRESETS_MIN.map((minutes) => {
            const selected = minutes === currentDurationMinutes;
            return (
              <Pressable
                key={minutes}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`${minutes} minutes`}
                onPress={() => applyDurationPreset(minutes)}
                style={[styles.durationButton, selected && styles.durationButtonSelected]}
              >
                <ThemedText
                  type="default"
                  style={[styles.durationButtonLabel, selected && styles.durationButtonLabelSelected]}
                >
                  {minutes} min
                </ThemedText>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`End: ${formatTime(endsAt)}`}
          onPress={() => setActivePicker('end')}
          style={({ pressed }) => [styles.fieldRow, pressed && styles.fieldRowPressed]}
        >
          <View style={styles.fieldIconBadge}>
            <Icon name="time-outline" size="sm" color={color.primary.violet} />
          </View>
          <ThemedText type="default" style={styles.fieldLabel}>
            End
          </ThemedText>
          <ThemedText type="default" style={styles.fieldValue} numberOfLines={1}>
            {formatTime(endsAt)}
          </ThemedText>
          <Icon name="chevron-forward" size="sm" color={color.text.secondary} />
        </Pressable>

        {!!dateError && (
          <ThemedText type="default" style={styles.errorText}>
            {dateError}
          </ThemedText>
        )}

        {activePicker === 'date' && (
          <View style={styles.pickerBlock}>
            <DateTimePicker
              value={startsAt}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              onChange={handleDateChange}
              {...IOS_PICKER_PROPS}
            />
            {Platform.OS === 'ios' && (
              <Button label="Done" variant="text" onPress={() => setActivePicker(null)} />
            )}
          </View>
        )}
        {activePicker === 'start' && (
          <View style={styles.pickerBlock}>
            <DateTimePicker
              value={startsAt}
              mode="time"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={handleStartTimeChange}
              {...IOS_PICKER_PROPS}
            />
            {Platform.OS === 'ios' && (
              <Button label="Done" variant="text" onPress={() => setActivePicker(null)} />
            )}
          </View>
        )}
        {activePicker === 'end' && (
          <View style={styles.pickerBlock}>
            <DateTimePicker
              value={endsAt}
              mode="time"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={handleEndTimeChange}
              {...IOS_PICKER_PROPS}
            />
            {Platform.OS === 'ios' && (
              <Button label="Done" variant="text" onPress={() => setActivePicker(null)} />
            )}
          </View>
        )}
      </SectionCard>

      <Button label={submitLabel} onPress={handleSubmit} loading={isSubmitting} />
      {onDelete && (
        <Button label="Delete" variant="destructive" onPress={handleDeletePress} loading={isDeleting} />
      )}

      <TaskPickerModal
        visible={isTaskPickerVisible}
        token={token}
        currentTask={taskSnapshot}
        onSelect={handleSelectTask}
        onClose={() => setIsTaskPickerVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: space.sm,
  },
  card: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    gap: space.xs,
  },
  cardHeading: {
    fontSize: typeTokens.body.fontSize,
    lineHeight: 20,
    fontWeight: '700',
    color: color.text.primary,
    marginBottom: 2,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: touchTarget.min,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: color.border.divider,
    backgroundColor: color.background.card,
    paddingHorizontal: space.sm,
  },
  fieldRowPressed: {
    opacity: 0.7,
  },
  fieldIconBadge: {
    width: 32,
    height: 32,
    borderRadius: radius.control,
    backgroundColor: color.accent.lavender,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldLabel: {
    fontSize: typeTokens.caption.fontSize,
    lineHeight: typeTokens.caption.lineHeight,
    fontWeight: '600',
    color: color.text.secondary,
  },
  fieldValue: {
    flex: 1,
    textAlign: 'right',
    fontSize: typeTokens.body.fontSize,
    lineHeight: 20,
    fontWeight: '600',
    color: color.text.primary,
  },
  durationLabel: {
    fontSize: typeTokens.caption.fontSize,
    lineHeight: typeTokens.caption.lineHeight,
    fontWeight: '600',
    color: color.text.secondary,
    marginTop: 2,
  },
  durationRow: {
    flexDirection: 'row',
    gap: space.xs,
  },
  durationButton: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: color.primary.violet,
    backgroundColor: color.background.card,
  },
  durationButtonSelected: {
    backgroundColor: color.primary.violet,
  },
  durationButtonLabel: {
    fontSize: typeTokens.label.fontSize,
    fontWeight: '600',
    color: color.primary.violet,
  },
  durationButtonLabelSelected: {
    color: color.text.onFill,
  },
  errorText: {
    color: color.risk.high.text,
    fontSize: typeTokens.caption.fontSize,
    lineHeight: typeTokens.caption.lineHeight,
  },
  pickerBlock: {
    gap: space.xs,
    alignItems: 'flex-end',
  },
});
