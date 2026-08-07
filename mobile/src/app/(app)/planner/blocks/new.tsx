import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { createStudyBlock } from '@/api/study-blocks';
import { ThemedText } from '@/components/themed-text';
import { useSession } from '@/features/auth/session-context';
import { useNotificationCoordinator } from '@/features/notifications/notification-coordinator';
import { StudyBlockForm, type StudyBlockFormValues } from '@/features/planner/study-block-form';
import { color, space, type as typeTokens } from '@/design-system/tokens';

/** Seeds the create form's start/end in device-local time — the same
 * frame of reference the native DateTimePicker widget itself operates
 * in (via DeadlinePicker). This is independent of Profile.timezone-based
 * calendar bucketing (§ lib/date.ts); the timezone-alignment gate on the
 * Planner tab guarantees device time === Profile.timezone before this
 * screen is reachable, so the two frames agree by the time the user
 * gets here. */
function applyDateParts(dateString: string, hour: number, minute: number): Date {
  const [y, m, d] = dateString.split('-').map(Number);
  const dt = new Date();
  dt.setFullYear(y, m - 1, d);
  dt.setHours(hour, minute, 0, 0);
  return dt;
}

function computeDefaultStart(selectedDate: string): Date {
  const now = new Date();
  const todayDeviceLocal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`;

  if (selectedDate !== todayDeviceLocal) return applyDateParts(selectedDate, 9, 0);

  const nextHour = new Date(now);
  nextHour.setMinutes(0, 0, 0);
  nextHour.setHours(nextHour.getHours() + 1);
  // Rounding up crossed into the next calendar day — that no longer
  // belongs to the selected date, so fall back to the fixed default
  // rather than silently offering a start time one day off.
  if (nextHour.getDate() !== now.getDate()) return applyDateParts(selectedDate, 9, 0);
  return nextHour;
}

export default function NewStudyBlockScreen() {
  const { date } = useLocalSearchParams<{ date: string }>();
  const { session } = useSession();
  const { requestWorkloadCheck } = useNotificationCoordinator();
  const insets = useSafeAreaInsets();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [defaults] = useState(() => {
    const startsAt = computeDefaultStart(date);
    const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
    return { startsAt, endsAt };
  });

  async function handleSubmit(values: StudyBlockFormValues): Promise<string | null> {
    if (!session) return 'Not signed in';
    setIsSubmitting(true);
    const result = await createStudyBlock(session.access_token, values);
    setIsSubmitting(false);
    if (!result.ok) return result.error.message;
    requestWorkloadCheck();
    router.back();
    return null;
  }

  if (!session) return null;

  return (
    // Same continuous-periwinkle-through-status-bar shell as Today/Tasks
    // (`edges` excludes 'top'; `headerSurface` absorbs `insets.top` into
    // its own paddingTop) — replacing the plain `<Screen>` (flat
    // `background.main`, no header surface) this screen used before, per
    // "full-screen Studora presentation, not an iOS gray page-sheet."
    <SafeAreaView style={styles.outerSafeArea} edges={['left', 'right', 'bottom']}>
      <View style={[styles.headerSurface, { paddingTop: insets.top + space.xs }]}>
        <View style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
            onPress={() => router.back()}
            style={({ pressed }) => [styles.cancelControl, pressed && styles.cancelControlPressed]}
          >
            <ThemedText type="default" style={styles.cancelLabel}>
              Cancel
            </ThemedText>
          </Pressable>
          <ThemedText type="default" style={styles.title} numberOfLines={1}>
            New Study Block
          </ThemedText>
          <View style={styles.topBarSpacer} />
        </View>
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.content}>
        <StudyBlockForm
          token={session.access_token}
          initial={{ taskId: null, taskSnapshot: null, startsAt: defaults.startsAt, endsAt: defaults.endsAt }}
          submitLabel="Add Study Block"
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  outerSafeArea: {
    flex: 1,
    backgroundColor: color.surface.canvas,
  },
  headerSurface: {
    backgroundColor: color.surface.headerSoft,
    paddingHorizontal: space.lg,
    paddingBottom: space.xs,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 36,
  },
  // Fixed (not `touchTarget.min`-driven) width, kept in sync with
  // `topBarSpacer` below — the real 44pt touch target comes from
  // `hitSlop` on the Pressable instead, so the row itself stays compact
  // without shrinking the tappable area.
  cancelControl: {
    width: 64,
    justifyContent: 'center',
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
    flex: 1,
    textAlign: 'center',
    fontSize: typeTokens.subheading.fontSize,
    lineHeight: typeTokens.subheading.lineHeight,
    fontWeight: '700',
    color: color.text.primary,
  },
  // Mirrors `cancelControl`'s fixed width so `title` (flex: 1, centered
  // text) is centered against the row's true midpoint, not just the
  // space left after a left-only control.
  topBarSpacer: {
    width: 64,
  },
  body: {
    flex: 1,
  },
  content: {
    padding: space.lg,
    gap: space.sm,
    paddingBottom: space.xxl,
  },
});
