import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { createStudyBlock } from '@/api/study-blocks';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { useSession } from '@/features/auth/session-context';
import { StudyBlockForm, type StudyBlockFormValues } from '@/features/planner/study-block-form';
import { color, space, touchTarget, type as typeTokens } from '@/design-system/tokens';

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
    router.back();
    return null;
  }

  if (!session) return null;

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
          New Study Block
        </ThemedText>
        <StudyBlockForm
          token={session.access_token}
          initial={{ taskId: null, taskSnapshot: null, startsAt: defaults.startsAt, endsAt: defaults.endsAt }}
          submitLabel="Create Study Block"
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
        />
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
