import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, View } from 'react-native';

import { listSubjects, updateSubject } from '@/api/subjects';
import { Banner } from '@/components/banner';
import { EmptyState } from '@/components/empty-state';
import { Fab } from '@/components/fab';
import { Screen } from '@/components/screen';
import { SubjectRow } from '@/components/subject-row';
import { ThemedText } from '@/components/themed-text';
import { useSession } from '@/features/auth/session-context';
import { color, space, type as typeTokens } from '@/design-system/tokens';
import type { Subject } from '@/types/api';

export default function SubjectsScreen() {
  const { session } = useSession();
  const [subjects, setSubjects] = useState<Subject[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(() => {
    if (!session) return;
    setIsLoading(true);
    listSubjects(session.access_token, { includeArchived: true }).then((result) => {
      if (result.ok) {
        setSubjects(result.data);
        setLoadError(null);
      } else {
        setLoadError(result.error.message);
      }
      setIsLoading(false);
    });
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function applyArchiveChange(subject: Subject, archived: boolean) {
    if (!session) return;
    const result = await updateSubject(session.access_token, subject.id, { archived });
    if (result.ok) load();
    else Alert.alert('Could not update subject', result.error.message);
  }

  function handleToggleArchive(subject: Subject) {
    const isArchived = subject.archived_at !== null;
    if (isArchived) {
      applyArchiveChange(subject, false);
      return;
    }
    Alert.alert('Archive subject?', `"${subject.name}" will be hidden from active lists.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Archive', style: 'destructive', onPress: () => applyArchiveChange(subject, true) },
    ]);
  }

  const active = subjects?.filter((s) => s.archived_at === null) ?? [];
  const archived = subjects?.filter((s) => s.archived_at !== null) ?? [];

  return (
    <Screen style={styles.screen}>
      <ThemedText type="default" style={styles.title}>
        Subjects
      </ThemedText>

      {isLoading && <ActivityIndicator color={color.primary.violet} />}
      {!isLoading && loadError && <Banner variant="error" message={loadError} />}

      {!isLoading && !loadError && subjects && subjects.length === 0 && (
        <EmptyState
          message="No subjects yet"
          actionLabel="Add your first subject"
          onAction={() => router.push('/subjects/new' as Href)}
        />
      )}

      {!isLoading && !loadError && subjects && subjects.length > 0 && (
        <FlatList
          data={[
            { key: 'active-header', type: 'header' as const, label: 'Active' },
            ...active.map((s) => ({ key: s.id, type: 'row' as const, subject: s })),
            ...(archived.length > 0
              ? [{ key: 'archived-header', type: 'header' as const, label: 'Archived' }]
              : []),
            ...archived.map((s) => ({ key: s.id, type: 'row' as const, subject: s })),
          ]}
          renderItem={({ item }) =>
            item.type === 'header' ? (
              <ThemedText type="default" style={styles.sectionHeader}>
                {item.label}
              </ThemedText>
            ) : (
              <SubjectRow
                subject={item.subject}
                onEdit={() => router.push(`/subjects/${item.subject.id}/edit` as Href)}
                onToggleArchive={() => handleToggleArchive(item.subject)}
              />
            )
          }
          ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
          style={styles.listFlex}
          contentContainerStyle={styles.list}
        />
      )}

      <Fab accessibilityLabel="Add subject" onPress={() => router.push('/subjects/new' as Href)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    position: 'relative',
  },
  title: {
    fontSize: typeTokens.display.fontSize,
    lineHeight: typeTokens.display.lineHeight,
    fontWeight: '700',
    color: color.primary.violet,
  },
  sectionHeader: {
    fontSize: typeTokens.label.fontSize,
    fontWeight: '600',
    color: color.text.secondary,
    textTransform: 'uppercase',
    marginTop: space.sm,
    marginBottom: space.xs,
  },
  listFlex: {
    flex: 1,
  },
  list: {
    paddingBottom: space.xxl,
  },
});
