import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { getDay } from '@/api/planner';
import { deleteStudyBlock, updateStudyBlock } from '@/api/study-blocks';
import { Banner } from '@/components/banner';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { useSession } from '@/features/auth/session-context';
import { StudyBlockForm, type StudyBlockFormValues } from '@/features/planner/study-block-form';
import { color, space, touchTarget, type as typeTokens } from '@/design-system/tokens';
import type { StudyBlockRead } from '@/types/api';

export default function EditStudyBlockScreen() {
  const { id, date } = useLocalSearchParams<{ id: string; date: string }>();
  const { session } = useSession();
  const [block, setBlock] = useState<StudyBlockRead | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fresh fetch on every mount — never trusts a block object passed
  // through route params or whatever the agenda screen had cached at tap
  // time. There is no GET /study-blocks/{id}; GET /planner/day for the
  // date this row was rendered under is guaranteed (by the backend's own
  // half-open-overlap query) to include it if it still exists there.
  // NOTE: this closes the stale-at-load gap only. A second device can
  // still change or delete this row between this fetch and this screen's
  // submit — there is no ETag/version concurrency protection.
  const load = useCallback(() => {
    if (!session || !id || !date) return;
    setIsLoading(true);
    setNotFound(false);
    setLoadError(null);
    getDay(session.access_token, date).then((result) => {
      if (!result.ok) {
        setLoadError(result.error.message);
        setIsLoading(false);
        return;
      }
      const found = result.data.study_blocks.find((b) => b.id === id) ?? null;
      if (!found) setNotFound(true);
      setBlock(found);
      setIsLoading(false);
    });
  }, [session, id, date]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSubmit(values: StudyBlockFormValues): Promise<string | null> {
    if (!session || !block) return 'Not signed in';

    const changes: { task_id?: string | null; starts_at?: string; ends_at?: string } = {};
    if (values.task_id !== block.task_id) changes.task_id = values.task_id;
    if (new Date(values.starts_at).getTime() !== new Date(block.starts_at).getTime()) {
      changes.starts_at = values.starts_at;
    }
    if (new Date(values.ends_at).getTime() !== new Date(block.ends_at).getTime()) {
      changes.ends_at = values.ends_at;
    }

    if (Object.keys(changes).length === 0) {
      router.back();
      return null;
    }

    setIsSubmitting(true);
    const result = await updateStudyBlock(session.access_token, block.id, changes);
    setIsSubmitting(false);
    if (!result.ok) return result.error.message;
    router.back();
    return null;
  }

  async function handleDelete() {
    if (!session || !block) return;
    setIsDeleting(true);
    const result = await deleteStudyBlock(session.access_token, block.id);
    setIsDeleting(false);
    if (result.ok) router.back();
    else Alert.alert('Could not delete study block', result.error.message);
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

      {!isLoading && !loadError && notFound && (
        <Banner
          variant="error"
          message="This study block could not be found — it may have been changed elsewhere."
        />
      )}

      {!isLoading && !loadError && !notFound && block && session && (
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="default" style={styles.title}>
            Edit Study Block
          </ThemedText>
          <StudyBlockForm
            token={session.access_token}
            initial={{
              taskId: block.task_id,
              taskSnapshot: block.task,
              startsAt: new Date(block.starts_at),
              endsAt: new Date(block.ends_at),
            }}
            submitLabel="Save Changes"
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
            onDelete={handleDelete}
            isDeleting={isDeleting}
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
