import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { createSubject } from '@/api/subjects';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { useSession } from '@/features/auth/session-context';
import { SubjectForm } from '@/features/subjects/subject-form';
import { color, space, touchTarget, type as typeTokens } from '@/design-system/tokens';
import type { SubjectCreate } from '@/types/api';

export default function NewSubjectScreen() {
  const { session } = useSession();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(values: SubjectCreate): Promise<string | null> {
    if (!session) return 'Not signed in';
    setIsSubmitting(true);
    const result = await createSubject(session.access_token, values);
    setIsSubmitting(false);
    if (!result.ok) return result.error.message;
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
      <ThemedText type="default" style={styles.title}>
        New Subject
      </ThemedText>
      <SubjectForm submitLabel="Create Subject" onSubmit={handleSubmit} isSubmitting={isSubmitting} />
    </Screen>
  );
}

const styles = StyleSheet.create({
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
