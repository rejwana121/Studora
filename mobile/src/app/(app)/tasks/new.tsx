import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { createTask } from '@/api/tasks';
import { ThemedText } from '@/components/themed-text';
import { useSession } from '@/features/auth/session-context';
import { useNotificationCoordinator } from '@/features/notifications/notification-coordinator';
import { TaskForm, type TaskFormValues } from '@/features/tasks/task-form';
import { color, space, touchTarget, type as typeTokens } from '@/design-system/tokens';

const SIDE_SLOT_WIDTH = 88;

export default function NewTaskScreen() {
  // A nested SafeAreaProvider, not just SafeAreaView/useSafeAreaInsets
  // directly: this screen is presented via React Navigation's native-stack
  // 'fullScreenModal', a separate native view controller on iOS that the
  // single app-root SafeAreaProvider (the one expo-router injects
  // implicitly — there is no other SafeAreaProvider anywhere in this app)
  // never measures. Without this, useSafeAreaInsets() below silently
  // inherits that stale/zero root-window measurement instead of the
  // modal's own, which is exactly what let the title/Cancel render
  // starting at true y=0 — inside the status bar — despite the header
  // code itself already being structurally correct. Wrapping here forces
  // a fresh, modal-scoped measurement. useSafeAreaInsets() must run in a
  // component BELOW this provider, never in this same one (a hook can't
  // observe a context its own render is still in the middle of creating),
  // hence the separate NewTaskScreenBody component below.
  return (
    <SafeAreaProvider>
      <NewTaskScreenBody />
    </SafeAreaProvider>
  );
}

function NewTaskScreenBody() {
  const { session } = useSession();
  const insets = useSafeAreaInsets();
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
    <View style={styles.root}>
      {/* Light headerSurface background — dark content reads correctly on
       * it. Scoped to this screen only via mount/unmount, same pattern as
       * Focus's own StatusBar override; no global status-bar config touched. */}
      <StatusBar style="dark" />
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
              hitSlop={{ top: 0, bottom: space.sm, left: space.sm, right: space.sm }}
              style={({ pressed }) => [styles.sideSlot, styles.cancelSlot, pressed && styles.pressed]}
            >
              <ThemedText type="default" style={styles.cancelLabel}>
                Cancel
              </ThemedText>
            </Pressable>
            <View style={styles.titleSlot}>
              <ThemedText type="default" style={styles.headerTitle} numberOfLines={1}>
                New Task
              </ThemedText>
            </View>
            <View style={styles.sideSlot} />
          </View>
        </View>

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
            <TaskForm submitLabel="Create Task" onSubmit={handleSubmit} isSubmitting={isSubmitting} />
          </ScrollView>
        </KeyboardAvoidingView>
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
  flex: {
    flex: 1,
  },
  content: {
    padding: space.lg,
    paddingBottom: space.xxl,
  },
});
