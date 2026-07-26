import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { listSubjects, updateSubject } from '@/api/subjects';
import { Banner } from '@/components/banner';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { useSession } from '@/features/auth/session-context';
import { SubjectForm } from '@/features/subjects/subject-form';
import { color, space, touchTarget, type as typeTokens } from '@/design-system/tokens';
import type { Subject, SubjectUpdate } from '@/types/api';

export default function EditSubjectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const [subject, setSubject] = useState<Subject | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!session) return;
    let isMounted = true;
    setIsLoading(true);

    // Always resolved from a fresh fetch, never from route params — route
    // params could carry stale name/color_token if the subject was edited
    // elsewhere since this screen was linked to.
    listSubjects(session.access_token, { includeArchived: true }).then((result) => {
      if (!isMounted) return;
      if (!result.ok) {
        setLoadError(result.error.message);
      } else {
        const found = result.data.find((s) => s.id === id);
        setSubject(found ?? null);
        if (!found) setLoadError('Subject not found');
      }
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
    };
  }, [session, id]);

  async function handleSubmit(values: SubjectUpdate): Promise<string | null> {
    if (!session || !subject) return 'Not signed in';
    setIsSubmitting(true);
    const result = await updateSubject(session.access_token, subject.id, values);
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
        Edit Subject
      </ThemedText>

      {isLoading && <ActivityIndicator color={color.primary.violet} />}
      {!isLoading && loadError && <Banner variant="error" message={loadError} />}

      {!isLoading && subject && (
        <SubjectForm
          initialName={subject.name}
          initialColorToken={subject.color_token}
          submitLabel="Save Changes"
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
        />
      )}
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
