import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { getTask, updateTask } from '@/api/tasks';
import { Banner } from '@/components/banner';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { useSession } from '@/features/auth/session-context';
import { useNotificationCoordinator } from '@/features/notifications/notification-coordinator';
import { TaskForm, type TaskFormValues } from '@/features/tasks/task-form';
import { color, space, touchTarget, type as typeTokens } from '@/design-system/tokens';
import type { Task } from '@/types/api';

export default function EditTaskScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const { requestDeadlineReconcile, requestWorkloadCheck } = useNotificationCoordinator();
  const [task, setTask] = useState<Task | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!session || !id) return;
    let isMounted = true;
    setIsLoading(true);
    getTask(session.access_token, id).then((result) => {
      if (!isMounted) return;
      if (result.ok) {
        setTask(result.data);
        setLoadError(null);
      } else {
        setLoadError(result.error.message);
      }
      setIsLoading(false);
    });
    return () => {
      isMounted = false;
    };
  }, [session, id]);

  async function handleSubmit(values: TaskFormValues): Promise<string | null> {
    if (!session || !task) return 'Not signed in';
    setIsSubmitting(true);
    const result = await updateTask(session.access_token, task.id, values);
    setIsSubmitting(false);
    if (!result.ok) return result.error.message;
    requestDeadlineReconcile();
    requestWorkloadCheck();
    router.back();
    return null;
  }

  return (
    <Screen>
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.cancelControl, pressed && styles.cancelControlPressed]}
        >
          <ThemedText type="default" style={styles.cancelLabel}>
            Cancel
          </ThemedText>
        </Pressable>
      </View>
      {isLoading && <ActivityIndicator color={color.primary.violet} />}
      {!isLoading && loadError && <Banner variant="error" message={loadError} />}

      {!isLoading && task && (
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="default" style={styles.title}>
            Edit Task
          </ThemedText>
          <TaskForm
            initial={{
              subjectId: task.subject_id,
              title: task.title,
              type: task.type,
              deadline: new Date(task.deadline),
              priority: task.priority,
              estimateHours: task.estimate_hours,
              notes: task.notes,
            }}
            submitLabel="Save Changes"
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
          />
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: space.md,
    paddingBottom: space.xxl,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  cancelControl: {
    minHeight: touchTarget.min,
    justifyContent: 'center',
    paddingHorizontal: space.sm,
    marginLeft: -space.sm,
  },
  cancelControlPressed: {
    opacity: 0.6,
  },
  cancelLabel: {
    color: color.primary.violet,
    fontSize: typeTokens.label.fontSize,
    fontWeight: '600',
  },
  title: {
    fontSize: typeTokens.heading.fontSize,
    lineHeight: typeTokens.heading.lineHeight,
    fontWeight: '700',
    color: color.text.primary,
  },
});
