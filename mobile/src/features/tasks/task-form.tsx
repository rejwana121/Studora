import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { listSubjects } from '@/api/subjects';
import { Banner } from '@/components/banner';
import { Button } from '@/components/button';
import { ChipPicker, type ChipOption } from '@/components/chip-picker';
import { DeadlinePicker } from '@/components/deadline-picker';
import { TextField } from '@/components/text-field';
import { useSession } from '@/features/auth/session-context';
import { priorityColor, space, subjectColor, taskTypeColor, taskTypeLabel } from '@/design-system/tokens';
import type { Subject, TaskPriority, TaskType } from '@/types/api';

const TYPE_OPTIONS: ChipOption[] = (Object.keys(taskTypeColor) as TaskType[]).map((type) => ({
  value: type,
  label: taskTypeLabel[type],
  dotColor: taskTypeColor[type],
}));

const PRIORITY_OPTIONS: ChipOption[] = (Object.keys(priorityColor) as TaskPriority[]).map((priority) => ({
  value: priority,
  label: priority,
  dotColor: priorityColor[priority],
}));

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

  useEffect(() => {
    if (!session) return;
    listSubjects(session.access_token, { includeArchived: true }).then((result) => {
      if (result.ok) setSubjects(result.data);
    });
  }, [session]);

  const subjectOptions: ChipOption[] = [
    { value: NO_SUBJECT_VALUE, label: 'No subject' },
    ...subjects.map((s) => ({
      value: s.id,
      label: s.archived_at ? `${s.name} (archived)` : s.name,
      dotColor: subjectColor[s.color_token],
    })),
  ];

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
      <TextField label="Title" value={title} onChangeText={setTitle} error={titleError} />
      <ChipPicker label="Subject" options={subjectOptions} value={subjectId} onChange={setSubjectId} />
      <ChipPicker label="Type" options={TYPE_OPTIONS} value={type} onChange={(v) => setType(v as TaskType)} error={typeError} />
      <DeadlinePicker label="Deadline" value={deadline} onChange={setDeadline} />
      <ChipPicker
        label="Priority"
        options={PRIORITY_OPTIONS}
        value={priority}
        onChange={(v) => setPriority(v as TaskPriority)}
        error={priorityError}
      />
      <TextField
        label="Estimate (hours, optional)"
        value={estimateHours}
        onChangeText={setEstimateHours}
        error={estimateError}
        keyboardType="decimal-pad"
      />
      <TextField label="Notes (optional)" value={notes} onChangeText={setNotes} multiline />
      <Button label={submitLabel} onPress={handleSubmit} loading={isSubmitting} />
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: space.md,
  },
});
