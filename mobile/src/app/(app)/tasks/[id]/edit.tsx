import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { getTask, updateTask } from '@/api/tasks';
import { Banner } from '@/components/banner';
import { ThemedText } from '@/components/themed-text';
import { useSession } from '@/features/auth/session-context';
import { useNotificationCoordinator } from '@/features/notifications/notification-coordinator';
import { TaskForm, type TaskFormValues } from '@/features/tasks/task-form';
import { color, space, touchTarget, type as typeTokens } from '@/design-system/tokens';
import type { Task } from '@/types/api';

const SIDE_SLOT_WIDTH = 88;

export default function EditTaskScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const insets = useSafeAreaInsets();
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
    <View style={styles.root}>
      {/* `edges` excludes 'top': the periwinkle `headerSurface` below owns
       * the physical status-bar strip itself (via its own paddingTop:
       * insets.top), so SafeAreaView must not also reserve/paint that
       * region — reserving it twice was the earlier "duplicated inset"
       * bug this avoids. */}
      <SafeAreaView style={styles.outerSafeArea} edges={['left', 'right', 'bottom']}>
        <View style={[styles.headerSurface, { paddingTop: insets.top }]}>
          <View style={styles.navRow}>
            {/* True three-column layout, not absolute positioning: the
             * previous title used `position:'absolute', left:0, right:0`
             * spanning the FULL row width, including the Cancel
             * Pressable's own bounding box underneath it. Even though the
             * title's rendered glyphs were only in the center, its full
             * hit-testable box still sat on top of Cancel in paint order
             * and intercepted touches meant for it. A real flex sibling in
             * a dedicated center slot cannot overlap the side slots at
             * all, which is what actually fixes tappability — not a
             * z-index workaround. */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              onPress={() => router.back()}
              style={({ pressed }) => [styles.sideSlot, styles.cancelSlot, pressed && styles.pressed]}
            >
              <ThemedText type="default" style={styles.cancelLabel}>
                Cancel
              </ThemedText>
            </Pressable>
            <View style={styles.titleSlot}>
              <ThemedText type="default" style={styles.headerTitle} numberOfLines={1}>
                Edit Task
              </ThemedText>
            </View>
            <View style={styles.sideSlot} />
          </View>
        </View>

        {isLoading && <ActivityIndicator style={styles.loading} color={color.primary.violet} />}
        {!isLoading && loadError && (
          <View style={styles.content}>
            <Banner variant="error" message={loadError} />
          </View>
        )}

        {!isLoading && task && (
          <KeyboardAvoidingView
            style={styles.flex}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
          >
            <ScrollView
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
              contentInsetAdjustmentBehavior="never"
            >
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
          </KeyboardAvoidingView>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: color.surface.canvas,
  },
  outerSafeArea: {
    flex: 1,
    backgroundColor: color.surface.canvas,
  },
  headerSurface: {
    backgroundColor: color.surface.headerSoft,
    // paddingTop is set inline (insets.top, exactly). No paddingBottom, no
    // bottom corner radius, no shadow: straight edge, flush with the
    // canvas body starting immediately below it.
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingHorizontal: space.md,
  },
  sideSlot: {
    width: SIDE_SLOT_WIDTH,
    minHeight: touchTarget.min,
    justifyContent: 'center',
  },
  cancelSlot: {
    alignItems: 'flex-start',
  },
  pressed: {
    opacity: 0.6,
  },
  cancelLabel: {
    color: color.primary.violet,
    fontSize: typeTokens.body.fontSize,
    fontWeight: '600',
  },
  titleSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    textAlign: 'center',
    fontSize: typeTokens.heading.fontSize,
    lineHeight: typeTokens.heading.lineHeight,
    fontWeight: '700',
    color: color.text.primary,
  },
  loading: {
    marginTop: space.lg,
  },
  flex: {
    flex: 1,
  },
  content: {
    padding: space.lg,
    paddingBottom: space.xxl,
  },
});
