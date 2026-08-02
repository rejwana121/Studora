import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';

import { listTasks } from '@/api/tasks';
import { Banner } from '@/components/banner';
import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import {
  color,
  radius,
  space,
  subjectColor,
  touchTarget,
  type as typeTokens,
} from '@/design-system/tokens';
import type { TaskPriority, TaskStatus, TaskSubjectSnapshot, TaskType } from '@/types/api';

export interface PickerTaskSummary {
  id: string;
  title: string;
  type: TaskType;
  status: TaskStatus;
  priority: TaskPriority;
  subject: TaskSubjectSnapshot | null;
}

interface TaskPickerModalProps {
  visible: boolean;
  token: string;
  currentTask: PickerTaskSummary | null;
  onSelect: (task: PickerTaskSummary | null) => void;
  onClose: () => void;
}

const DEBOUNCE_MS = 300;
const PAGE_LIMIT = 20;

function isDeemphasized(status: TaskStatus): boolean {
  return status === 'Completed' || status === 'Cancelled';
}

export function TaskPickerModal({ visible, token, currentTask, onSelect, onClose }: TaskPickerModalProps) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<PickerTaskSummary[]>([]);
  const [nextOffset, setNextOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingFirst, setIsLoadingFirst] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Bumped on every first-page (re)fetch — search change or modal reopen.
  // A page response is applied only if this still matches the value
  // captured when that page's request was sent, so a slow response for
  // an abandoned search term (or a page fetched before the term changed)
  // can never overwrite newer results.
  const generationRef = useRef(0);
  const currentTaskId = currentTask?.id ?? null;

  const fetchPage = useCallback(
    (pageOffset: number) => {
      const isFirstPage = pageOffset === 0;
      const generation = generationRef.current;
      if (isFirstPage) setIsLoadingFirst(true);
      else setIsLoadingMore(true);
      setError(null);

      listTasks(token, {
        search: search.trim().length > 0 ? search.trim() : undefined,
        sort: 'deadline_asc',
        limit: PAGE_LIMIT,
        offset: pageOffset,
      }).then((result) => {
        if (generationRef.current !== generation) return; // stale — a newer search/reset superseded this

        if (!result.ok) {
          setError(result.error.message);
          if (isFirstPage) setIsLoadingFirst(false);
          else setIsLoadingMore(false);
          return;
        }

        setResults((prev) => {
          const base = isFirstPage ? [] : prev;
          const existingIds = new Set(base.map((t) => t.id));
          const deduped = result.data.filter((t) => t.id !== currentTaskId && !existingIds.has(t.id));
          return [...base, ...deduped];
        });
        setHasMore(result.data.length === PAGE_LIMIT);
        setNextOffset(pageOffset + result.data.length);
        if (isFirstPage) setIsLoadingFirst(false);
        else setIsLoadingMore(false);
      });
    },
    [token, search, currentTaskId]
  );

  // Debounced reset-and-refetch whenever the modal opens or the search
  // term settles. Bumping generation here invalidates any in-flight
  // request from the previous term/session before the new one is sent.
  useEffect(() => {
    if (!visible) return;
    const handle = setTimeout(() => {
      generationRef.current += 1;
      setResults([]);
      setNextOffset(0);
      setHasMore(true);
      setError(null);
      fetchPage(0);
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [visible, fetchPage]);

  function handleLoadMore() {
    if (isLoadingFirst || isLoadingMore || !hasMore || error) return;
    fetchPage(nextOffset);
  }

  function handleRetry() {
    // nextOffset is only ever advanced after a successful page, so
    // retrying it re-requests exactly the page that failed — offset 0
    // (nothing loaded yet) or a later page, with every prior
    // successfully-loaded page still intact in `results`.
    fetchPage(nextOffset);
  }

  function handleSelect(task: PickerTaskSummary | null) {
    onSelect(task);
    onClose();
  }

  function renderTaskRow(task: PickerTaskSummary, isCurrent: boolean) {
    const deemphasized = isDeemphasized(task.status);
    return (
      <Pressable
        key={task.id}
        accessibilityRole="button"
        accessibilityLabel={`${task.title}${task.subject?.archived ? ', archived subject' : ''}${
          deemphasized ? `, ${task.status}` : ''
        }${isCurrent ? ', selected' : ''}`}
        accessibilityState={{ selected: isCurrent }}
        onPress={() => handleSelect(task)}
        style={({ pressed }) => [styles.row, isCurrent && styles.rowSelected, pressed && styles.rowPressed]}
      >
        <View style={styles.rowContent}>
          <ThemedText
            type="default"
            style={[styles.rowTitle, deemphasized && styles.rowTitleDeemphasized]}
            numberOfLines={2}
          >
            {task.title}
          </ThemedText>
          {task.subject && (
            <View style={styles.subjectChip}>
              <View
                style={[styles.subjectDot, { backgroundColor: subjectColor[task.subject.color_token] }]}
              />
              <ThemedText type="default" style={styles.metaText} numberOfLines={1}>
                {task.subject.name}
                {task.subject.archived ? ' (archived)' : ''}
              </ThemedText>
            </View>
          )}
          {deemphasized && (
            <ThemedText type="default" style={styles.metaText} numberOfLines={1}>
              {task.status}
            </ThemedText>
          )}
        </View>
        {isCurrent && (
          <ThemedText type="default" style={styles.selectedCheckmark} accessibilityElementsHidden>
            ✓
          </ThemedText>
        )}
      </Pressable>
    );
  }

  const isFirstPageFailure = Boolean(error) && nextOffset === 0 && results.length === 0;
  const isLaterPageFailure = Boolean(error) && !isFirstPageFailure;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            onPress={onClose}
            style={({ pressed }) => [styles.cancelControl, pressed && styles.cancelControlPressed]}
          >
            <ThemedText type="default" style={styles.cancelLabel}>
              Cancel
            </ThemedText>
          </Pressable>
        </View>

        <ThemedText type="default" style={styles.title}>
          Link a Task
        </ThemedText>

        <TextField label="Search" value={search} onChangeText={setSearch} placeholder="Search tasks" />

        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.4}
          ListHeaderComponent={
            <View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={currentTask === null ? 'No task, selected' : 'No task'}
                accessibilityState={{ selected: currentTask === null }}
                onPress={() => handleSelect(null)}
                style={({ pressed }) => [
                  styles.row,
                  currentTask === null && styles.rowSelected,
                  pressed && styles.rowPressed,
                ]}
              >
                <ThemedText type="default" style={styles.rowTitle} numberOfLines={1}>
                  No task
                </ThemedText>
                {currentTask === null && (
                  <ThemedText type="default" style={styles.selectedCheckmark} accessibilityElementsHidden>
                    ✓
                  </ThemedText>
                )}
              </Pressable>
              <View style={styles.divider} />
              {currentTask && renderTaskRow(currentTask, true)}
              {currentTask && <View style={styles.divider} />}
              {isLoadingFirst && (
                <ActivityIndicator color={color.primary.violet} style={styles.loadingSpacer} />
              )}
              {isFirstPageFailure && error && (
                <View style={styles.errorBlock}>
                  <Banner variant="error" message={error} />
                  <Button label="Retry" variant="secondary" onPress={handleRetry} />
                </View>
              )}
              {!isLoadingFirst && !error && results.length === 0 && (
                <ThemedText type="default" style={styles.emptyText}>
                  No tasks match
                </ThemedText>
              )}
            </View>
          }
          renderItem={({ item }) => renderTaskRow(item, false)}
          ItemSeparatorComponent={() => <View style={styles.divider} />}
          ListFooterComponent={
            <View>
              {(isLoadingMore || isLaterPageFailure) && <View style={styles.divider} />}
              {isLoadingMore ? (
                <ActivityIndicator color={color.primary.violet} style={styles.loadingSpacer} />
              ) : isLaterPageFailure && error ? (
                <View style={styles.errorBlock}>
                  <Banner variant="error" message={error} />
                  <Button label="Retry" variant="secondary" onPress={handleRetry} />
                </View>
              ) : null}
            </View>
          }
          contentContainerStyle={styles.list}
        />
        <View style={styles.footerSpacer} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: color.background.main,
    padding: space.lg,
    gap: space.md,
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
  list: {
    backgroundColor: color.background.card,
    borderRadius: radius.card,
    overflow: 'hidden',
  },
  footerSpacer: {
    height: space.xxl,
    backgroundColor: color.background.main,
  },
  loadingSpacer: {
    marginVertical: space.md,
  },
  errorBlock: {
    gap: space.sm,
    marginVertical: space.sm,
    paddingHorizontal: space.md,
  },
  emptyText: {
    fontSize: typeTokens.body.fontSize,
    color: color.text.secondary,
    textAlign: 'center',
    paddingVertical: space.md,
    paddingHorizontal: space.md,
  },
  divider: {
    height: 1,
    backgroundColor: color.border.divider,
    marginHorizontal: space.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    minHeight: touchTarget.min,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  rowSelected: {
    backgroundColor: color.accent.lavender,
  },
  rowPressed: {
    opacity: 0.7,
  },
  rowContent: {
    flex: 1,
    gap: space.xs,
  },
  rowTitle: {
    fontSize: typeTokens.body.fontSize,
    fontWeight: '600',
    color: color.text.primary,
  },
  rowTitleDeemphasized: {
    color: color.text.secondary,
    textDecorationLine: 'line-through',
  },
  subjectChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  subjectDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
  },
  metaText: {
    fontSize: typeTokens.caption.fontSize,
    color: color.text.secondary,
  },
  selectedCheckmark: {
    fontSize: typeTokens.body.fontSize,
    fontWeight: '700',
    color: color.primary.violet,
  },
});
