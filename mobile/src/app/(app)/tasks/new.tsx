import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { createTask } from '@/api/tasks';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { useSession } from '@/features/auth/session-context';
import { useNotificationCoordinator } from '@/features/notifications/notification-coordinator';
import { TaskForm, type TaskFormValues } from '@/features/tasks/task-form';
import { color, space, touchTarget, type as typeTokens } from '@/design-system/tokens';

export default function NewTaskScreen() {
  const { session } = useSession();
  const { requestDeadlineReconcile, requestWorkloadCheck } = useNotificationCoordinator();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(values: TaskFormValues): Promise<string | null> {
    if (!session) return 'Not signed in';
    setIsSubmitting(true);
    const result = await createTask(session.access_token, values);
    setIsSubmitting(false);
    if (!result.ok) return result.error.message;
    requestDeadlineReconcile();
    requestWorkloadCheck();
    router.back();
    return null;
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
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
        <ThemedText type="default" style={styles.title}>
          New Task
        </ThemedText>
        <TaskForm submitLabel="Create Task" onSubmit={handleSubmit} isSubmitting={isSubmitting} />
      </ScrollView>
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
