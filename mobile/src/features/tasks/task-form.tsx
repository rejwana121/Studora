import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { listSubjects } from '@/api/subjects';
import { Banner } from '@/components/banner';
import { Button } from '@/components/button';
import { DeadlinePicker } from '@/components/deadline-picker';
import { Icon } from '@/components/icon';
import { SectionCard } from '@/components/section-card';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { useSession } from '@/features/auth/session-context';
import { OptionSheet, type OptionSheetOption } from '@/features/tasks/option-sheet';
import {
  color,
  priorityBadgeTone,
  radius,
  space,
  subjectColor,
  taskTypeColor,
  taskTypeIcon,
  taskTypeLabel,
  touchTarget,
  type as typeTokens,
} from '@/design-system/tokens';
import type { Subject, TaskPriority, TaskType } from '@/types/api';

const TYPE_VALUES = Object.keys(taskTypeColor) as TaskType[];
const PRIORITY_VALUES: TaskPriority[] = ['Low', 'Medium', 'High'];

const NO_SUBJECT_VALUE = '';

export interface TaskFormValues {
  subject_id: string | null;
  title: string;
  type: TaskType;
  /** ISO 8601, always UTC ("Z"-suffixed) — never a naive/local string. */
  deadline: string;
  priority: TaskPriority;
  estimate_hours: number | null;
  notes: string | null;
}

interface TaskFormInitial {
  subjectId?: string | null;
  title?: string;
  type?: TaskType;
  deadline?: Date;
  priority?: TaskPriority;
  estimateHours?: number | null;
  notes?: string | null;
}

interface TaskFormProps {
  initial?: TaskFormInitial;
  submitLabel: string;
  onSubmit: (values: TaskFormValues) => Promise<string | null>;
  isSubmitting: boolean;
}

function defaultDeadline(): Date {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setSeconds(0, 0);
  return date;
}

export function TaskForm({ initial, submitLabel, onSubmit, isSubmitting }: TaskFormProps) {
  const { session } = useSession();
  const [subjects, setSubjects] = useState<Subject[]>([]);

  const [title, setTitle] = useState(initial?.title ?? '');
  const [subjectId, setSubjectId] = useState(initial?.subjectId ?? NO_SUBJECT_VALUE);
  const [type, setType] = useState<TaskType | null>(initial?.type ?? null);
  const [deadline, setDeadline] = useState<Date>(initial?.deadline ?? defaultDeadline());
  const [priority, setPriority] = useState<TaskPriority | null>(initial?.priority ?? null);
  const [estimateHours, setEstimateHours] = useState(
    initial?.estimateHours != null ? String(initial.estimateHours) : ''
  );
  const [notes, setNotes] = useState(initial?.notes ?? '');

  const [titleError, setTitleError] = useState<string | null>(null);
  const [typeError, setTypeError] = useState<string | null>(null);
  const [priorityError, setPriorityError] = useState<string | null>(null);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const [isSubjectSheetOpen, setIsSubjectSheetOpen] = useState(false);
  const [isTypeSheetOpen, setIsTypeSheetOpen] = useState(false);

  useEffect(() => {
    if (!session) return;
    listSubjects(session.access_token, { includeArchived: true }).then((result) => {
      if (result.ok) setSubjects(result.data);
    });
  }, [session]);

  const subjectOptions: OptionSheetOption[] = [
    { value: NO_SUBJECT_VALUE, label: 'No subject' },
    ...subjects.map((s) => ({
      value: s.id,
      label: s.archived_at ? `${s.name} (archived)` : s.name,
      dotColor: subjectColor[s.color_token],
    })),
  ];
  const typeOptions: OptionSheetOption[] = TYPE_VALUES.map((t) => ({
    value: t,
    label: taskTypeLabel[t],
    dotColor: taskTypeColor[t],
  }));

  const subjectValueLabel =
    subjectId === NO_SUBJECT_VALUE
      ? 'No subject'
      : (subjects.find((s) => s.id === subjectId)?.name ?? 'No subject');
  const typeValueLabel = type ? taskTypeLabel[type] : 'Choose type';

  async function handleSubmit() {
    setServerError(null);
    const trimmedTitle = title.trim();
    const hasTitleError = trimmedTitle.length === 0;
    const hasTypeError = type === null;
    const hasPriorityError = priority === null;

    let parsedEstimate: number | null = null;
    let hasEstimateError = false;
    if (estimateHours.trim().length > 0) {
      const parsed = Number(estimateHours);
      if (!Number.isFinite(parsed) || parsed <= 0) hasEstimateError = true;
      else parsedEstimate = parsed;
    }

    setTitleError(hasTitleError ? 'Title is required' : null);
    setTypeError(hasTypeError ? 'Choose a type' : null);
    setPriorityError(hasPriorityError ? 'Choose a priority' : null);
    setEstimateError(hasEstimateError ? 'Must be a positive number' : null);

    if (hasTitleError || hasTypeError || hasPriorityError || hasEstimateError) return;

    const error = await onSubmit({
      subject_id: subjectId === NO_SUBJECT_VALUE ? null : subjectId,
      title: trimmedTitle,
      type: type as TaskType,
      deadline: deadline.toISOString(),
      priority: priority as TaskPriority,
      estimate_hours: parsedEstimate,
      notes: notes.trim().length > 0 ? notes.trim() : null,
    });
    if (error) setServerError(error);
  }

  return (
    <View style={styles.form}>
      {serverError && <Banner variant="error" message={serverError} />}

      <SectionCard style={styles.section}>
        <SectionHeader icon="document-text-outline" label="Task details" />
        <TextField label="Title" value={title} onChangeText={setTitle} error={titleError} placeholder="Enter task title" />
        <SelectField
          icon="book-outline"
          label="Subject"
          valueLabel={subjectValueLabel}
          onPress={() => setIsSubjectSheetOpen(true)}
        />
      </SectionCard>

      <SectionCard style={styles.section}>
        <SectionHeader icon="calendar-outline" label="Schedule" />
        <DeadlinePicker label="Deadline" value={deadline} onChange={setDeadline} />
      </SectionCard>

      <SectionCard style={styles.section}>
        <SectionHeader icon="list-outline" label="Planning" />
        <SelectField
          icon={type ? taskTypeIcon[type] : 'briefcase-outline'}
          label="Type"
          valueLabel={typeValueLabel}
          onPress={() => setIsTypeSheetOpen(true)}
          error={typeError}
        />

        <View style={styles.fieldGroup}>
          <FieldLabel icon="flag-outline" label="Priority" />
          <View style={styles.prioritySegments}>
            {PRIORITY_VALUES.map((p) => {
              const selected = p === priority;
              const tone = priorityBadgeTone[p];
              return (
                <Pressable
                  key={p}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => setPriority(p)}
                  style={[
                    styles.prioritySegment,
                    selected && { backgroundColor: tone.bg, borderColor: tone.text },
                  ]}
                >
                  <ThemedText
                    type="default"
                    style={[styles.prioritySegmentLabel, selected && { color: tone.text }]}
                  >
                    {p}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
          {!!priorityError && (
            <ThemedText type="default" style={styles.errorText}>
              {priorityError}
            </ThemedText>
          )}
        </View>

        <TextField
          label="Estimate (hours, optional)"
          value={estimateHours}
          onChangeText={setEstimateHours}
          error={estimateError}
          keyboardType="decimal-pad"
          placeholder="e.g. 2"
        />
        <TextField label="Notes (optional)" value={notes} onChangeText={setNotes} multiline placeholder="Add any notes…" />
      </SectionCard>

      <Button label={submitLabel} onPress={handleSubmit} loading={isSubmitting} />

      <OptionSheet
        visible={isSubjectSheetOpen}
        title="Subject"
        options={subjectOptions}
        value={subjectId}
        onSelect={(v) => {
          setSubjectId(v);
          setIsSubjectSheetOpen(false);
        }}
        onCancel={() => setIsSubjectSheetOpen(false)}
      />
      <OptionSheet
        visible={isTypeSheetOpen}
        title="Type"
        options={typeOptions}
        value={type}
        onSelect={(v) => {
          setType(v as TaskType);
          setIsTypeSheetOpen(false);
        }}
        onCancel={() => setIsTypeSheetOpen(false)}
      />
    </View>
  );
}

function SectionHeader({ icon, label }: { icon: React.ComponentProps<typeof Icon>['name']; label: string }) {
  return (
    <View style={styles.sectionHeaderRow}>
      <Icon name={icon} size="sm" color={color.primary.violet} />
      <ThemedText type="default" style={styles.sectionHeaderText}>
        {label}
      </ThemedText>
    </View>
  );
}

function FieldLabel({ icon, label }: { icon: React.ComponentProps<typeof Icon>['name']; label: string }) {
  return (
    <View style={styles.fieldLabelRow}>
      <Icon name={icon} size="sm" color={color.text.secondary} />
      <ThemedText type="default" style={styles.fieldLabelText}>
        {label}
      </ThemedText>
    </View>
  );
}

function SelectField({
  icon,
  label,
  valueLabel,
  onPress,
  error,
}: {
  icon: React.ComponentProps<typeof Icon>['name'];
  label: string;
  valueLabel: string;
  onPress: () => void;
  error?: string | null;
}) {
  return (
    <View style={styles.fieldGroup}>
      <FieldLabel icon={icon} label={label} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${valueLabel}`}
        onPress={onPress}
        style={({ pressed }) => [styles.selectPill, pressed && styles.pressed]}
      >
        <ThemedText type="default" style={styles.selectPillText} numberOfLines={1}>
          {valueLabel}
        </ThemedText>
        <Icon name="chevron-forward" size="sm" color={color.primary.violet} />
      </Pressable>
      {!!error && (
        <ThemedText type="default" style={styles.errorText}>
          {error}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: space.md,
  },
  section: {
    gap: space.md,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  sectionHeaderText: {
    fontSize: typeTokens.subheading.fontSize,
    lineHeight: typeTokens.subheading.lineHeight,
    fontWeight: '700',
    color: color.text.primary,
  },
  fieldGroup: {
    gap: space.xs,
  },
  fieldLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  fieldLabelText: {
    fontSize: typeTokens.label.fontSize,
    lineHeight: typeTokens.label.lineHeight,
    fontWeight: typeTokens.label.fontWeight,
    color: color.text.secondary,
  },
  selectPill: {
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
  selectPillText: {
    flex: 1,
    fontSize: typeTokens.body.fontSize,
    fontWeight: '600',
    color: color.primary.violet,
  },
  pressed: {
    opacity: 0.7,
  },
  prioritySegments: {
    flexDirection: 'row',
    gap: space.xs,
  },
  prioritySegment: {
    flex: 1,
    minHeight: touchTarget.min,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.control,
    borderWidth: 1.5,
    borderColor: color.border.divider,
    backgroundColor: color.background.card,
  },
  prioritySegmentLabel: {
    fontSize: typeTokens.body.fontSize,
    fontWeight: '600',
    color: color.text.secondary,
  },
  errorText: {
    color: color.risk.high.text,
    fontSize: typeTokens.caption.fontSize,
    lineHeight: typeTokens.caption.lineHeight,
  },
});
