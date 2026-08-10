import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { Banner } from '@/components/banner';
import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { listTasks } from '@/api/tasks';
import {
  color,
  priorityBadgeTone,
  radius,
  space,
  subjectColor,
  taskTypeIcon,
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
  /** Already present on every row `listTasks`/a study block's task snapshot
   * returns — just not previously surfaced here. Used by the Focus variant's
   * "real deadline ... when already available" requirement; the default
   * variant still ignores it, unchanged. */
  deadline: string;
}

interface TaskPickerModalProps {
  visible: boolean;
  token: string;
  currentTask: PickerTaskSummary | null;
  onSelect: (task: PickerTaskSummary | null) => void;
  onClose: () => void;
  /** 'default' (omit this prop): the original Planner/Tasks appearance and
   * behavior, byte-for-byte unchanged. 'focus': the compact, card-based
   * presentation approved for the Focus "Choose a task" screen only — same
   * underlying fetch/search/pagination/select-and-close logic, different
   * rendering only. */
  variant?: 'default' | 'focus';
}

const DEBOUNCE_MS = 300;
const PAGE_LIMIT = 20;

function isDeemphasized(status: TaskStatus): boolean {
  return status === 'Completed' || status === 'Cancelled';
}

/** Short "Due Mon D" label — mirrors the existing convention in
 * components/task-row.tsx's own (private, unexported) formatDueBadge, kept
 * as a small local duplicate here rather than an import across feature
 * boundaries, consistent with this app's existing per-file formatter
 * pattern (e.g. session-card.tsx / session-history.tsx's formatDuration). */
function formatDueBadge(iso: string): string {
  const date = new Date(iso);
  return `Due ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

export function TaskPickerModal({
  visible,
  token,
  currentTask,
  onSelect,
  onClose,
  variant = 'default',
}: TaskPickerModalProps) {
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

  // ── Default (Planner/Tasks) row renderer — byte-identical to before. ──────
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

  // ── Focus variant ──────────────────────────────────────────────────────────
  if (variant === 'focus') {
    // Completed tasks are filtered from this list — the shared /tasks
    // endpoint's `status` filter only accepts one exact value (no
    // "not equal"/exclusion filter, see TaskListQuery), so "everything
    // except Completed" can't be requested server-side. Filtering the
    // already-fetched page client-side doesn't break pagination — offset/
    // hasMore still track the real server page — it just means a rendered
    // batch can show fewer than PAGE_LIMIT cards when Completed tasks are
    // interspersed, a cosmetic tradeoff, not a broken load-more. No task is
    // ever deleted or modified by this filter.
    const focusResults = results.filter((task) => task.status !== 'Completed');
    const isSearching = search.trim().length > 0;
    const isEmpty = !isLoadingFirst && !isFirstPageFailure && focusResults.length === 0;

    const renderFocusTaskCard = (task: PickerTaskSummary, isCurrent: boolean) => (
      <Pressable
        key={task.id}
        accessibilityRole="button"
        accessibilityLabel={`${task.title}${task.subject?.archived ? ', archived subject' : ''}${
          isCurrent ? ', selected' : ''
        }`}
        accessibilityState={{ selected: isCurrent }}
        onPress={() => handleSelect(task)}
        style={({ pressed }) => [
          styles.focusCard,
          isCurrent && styles.focusCardSelected,
          pressed && styles.focusCardPressed,
        ]}
      >
        <View style={styles.focusCardIconBadge}>
          <Icon name={taskTypeIcon[task.type]} size="sm" color={color.primary.violet} />
        </View>
        <View style={styles.focusCardTextCol}>
          <ThemedText type="default" style={styles.focusCardTitle} numberOfLines={2}>
            {task.title}
          </ThemedText>
          <View style={styles.focusCardMetaRow}>
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
            {task.deadline && (
              <ThemedText type="default" style={styles.metaText} numberOfLines={1}>
                {formatDueBadge(task.deadline)}
              </ThemedText>
            )}
            <View style={[styles.priorityBadge, { backgroundColor: priorityBadgeTone[task.priority].bg }]}>
              <ThemedText
                type="default"
                style={[styles.priorityBadgeText, { color: priorityBadgeTone[task.priority].text }]}
              >
                {task.priority}
              </ThemedText>
            </View>
          </View>
        </View>
        <Icon
          name={isCurrent ? 'checkmark-circle' : 'ellipse-outline'}
          size="md"
          color={isCurrent ? color.primary.violet : color.border.divider}
        />
      </Pressable>
    );

    return (
      <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
        {/* RN's <Modal presentationStyle="fullScreen"> is a genuinely
            separate native view controller on iOS — not part of the root
            window's view hierarchy. This app has exactly one
            SafeAreaProvider, the one expo-router injects implicitly at the
            true app root, and it only ever measures that root window. A
            SafeAreaView inside this Modal was therefore reading a stale
            (often zero) inset from that root measurement — despite already
            being structurally correct (edges={['top','left','right']}, no
            manual paddingTop anywhere) — which is exactly what pushed the
            header above the visible viewport and under the status bar.
            Nesting a fresh SafeAreaProvider here forces a real
            measurement scoped to this Modal's own native view. */}
        <SafeAreaProvider>
          <StatusBar style="dark" />
          {/* The one component that owns the top inset — no insets.top
              reuse, no negative margins, no absolute top positioning
              anywhere below. edges deliberately omits 'bottom': the
              FlatList's own paddingBottom already clears the home
              indicator. */}
          <SafeAreaView style={styles.focusSafeArea} edges={['top', 'left', 'right']}>
            {/* Compact professional header surface — continuous background
                from the safe-area inset through this fixed-height row below
                it, no seam. */}
            <View style={styles.focusHeaderRow}>
              <View style={styles.focusHeaderSide}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Back"
                  onPress={onClose}
                  hitSlop={{ top: 0, bottom: space.xs, left: space.xs, right: space.xs }}
                  style={({ pressed }) => [styles.focusBackButton, pressed && styles.focusHeaderSidePressed]}
                >
                  <Icon name="chevron-back" size="md" color={color.primary.violet} />
                </Pressable>
              </View>
              {/* pointerEvents="none": this sits between the back button and
                  the balancing spacer in the same row — never overlaps
                  either — but is set explicitly so it can never intercept a
                  tap on the back button regardless of future layout changes. */}
              <View style={styles.focusHeaderCenter} pointerEvents="none">
                <ThemedText type="default" style={styles.focusHeaderTitle}>
                  Choose a task
                </ThemedText>
                <ThemedText type="default" style={styles.focusHeaderSubtitle}>
                  Select what you want to focus on.
                </ThemedText>
              </View>
              {/* Empty spacer matching the left slot's own width — this is
                  what keeps the title truly centered on the physical screen
                  rather than centered-within-the-remaining-space. */}
              <View style={styles.focusHeaderSide} />
            </View>

            <View style={styles.focusBody}>
            <TextField
              label="Search"
              icon="search-outline"
              value={search}
              onChangeText={setSearch}
              placeholder="Search tasks"
            />

            <FlatList
              data={focusResults}
              keyExtractor={(item) => item.id}
              onEndReached={handleLoadMore}
              onEndReachedThreshold={0.4}
              ListHeaderComponent={
                <View style={styles.focusListHeader}>
                  {/* General Focus — not a real task, so it gets its own
                      dedicated render rather than reusing
                      renderFocusTaskCard's real-task-only fields. */}
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{ checked: currentTask === null }}
                    accessibilityLabel={currentTask === null ? 'General Focus, selected' : 'General Focus'}
                    onPress={() => handleSelect(null)}
                    style={({ pressed }) => [
                      styles.focusCard,
                      currentTask === null && styles.focusCardSelected,
                      pressed && styles.focusCardPressed,
                    ]}
                  >
                    <View style={styles.focusCardIconBadge}>
                      <Icon
                        name={currentTask === null ? 'radio-button-on' : 'radio-button-off-outline'}
                        size="sm"
                        color={color.primary.violet}
                      />
                    </View>
                    <View style={styles.focusCardTextCol}>
                      <ThemedText type="default" style={styles.focusCardTitle}>
                        General Focus
                      </ThemedText>
                      <ThemedText type="default" style={styles.metaText}>
                        Start without linking a task
                      </ThemedText>
                    </View>
                    {currentTask === null && (
                      <Icon name="checkmark-circle" size="md" color={color.primary.violet} />
                    )}
                  </Pressable>

                  {currentTask && currentTask.status !== 'Completed' && renderFocusTaskCard(currentTask, true)}

                  {isLoadingFirst && (
                    <ActivityIndicator color={color.primary.violet} style={styles.focusLoadingSpacer} />
                  )}

                  {isFirstPageFailure && error && (
                    <View style={styles.errorBlock}>
                      <Banner variant="error" message={error} />
                      <Button label="Retry" variant="secondary" onPress={handleRetry} />
                    </View>
                  )}

                  {isEmpty && isSearching && (
                    <View style={styles.focusEmptyState}>
                      <Icon name="search-outline" size="lg" color={color.text.disabled} />
                      <ThemedText type="default" style={styles.focusEmptyText}>
                        No tasks match &ldquo;{search.trim()}&rdquo;
                      </ThemedText>
                    </View>
                  )}

                  {isEmpty && !isSearching && !isFirstPageFailure && (
                    <View style={styles.focusEmptyState}>
                      <Icon name="clipboard-outline" size="lg" color={color.text.disabled} />
                      <ThemedText type="default" style={styles.focusEmptyText}>
                        No tasks yet
                      </ThemedText>
                    </View>
                  )}
                </View>
              }
              renderItem={({ item }) => renderFocusTaskCard(item, false)}
              ItemSeparatorComponent={() => <View style={styles.focusCardGap} />}
              ListFooterComponent={
                <View>
                  {isLoadingMore && (
                    <ActivityIndicator color={color.primary.violet} style={styles.focusLoadingSpacer} />
                  )}
                  {isLaterPageFailure && error && (
                    <View style={styles.errorBlock}>
                      <Banner variant="error" message={error} />
                      <Button label="Retry" variant="secondary" onPress={handleRetry} />
                    </View>
                  )}
                </View>
              }
              contentContainerStyle={styles.focusList}
            />
          </View>
          </SafeAreaView>
        </SafeAreaProvider>
      </Modal>
    );
  }

  // ── Default (Planner/Tasks) — unchanged from before. ───────────────────────
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

  // ══════════════════════════════════════════════════════════════════════════
  // Focus variant only — everything below is additive, never read by the
  // default (Planner/Tasks) render path above.
  // ══════════════════════════════════════════════════════════════════════════
  focusSafeArea: {
    flex: 1,
    // Near-white, not the lavender background.main wash the default
    // variant uses — same continuous tone through the safe-area inset and
    // the header row below, so there's no seam/gap at the top.
    backgroundColor: color.surface.canvas,
  },
  // No padding of any kind (never insets.top) — sits directly below the
  // SafeAreaView's own top inset, which is the sole thing reserving that
  // space. minHeight, not a fixed height: the row is at least 64dp but can
  // grow if platform font scaling ever needs more.
  focusHeaderRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: color.border.divider,
  },
  // Three-column layout: this fixed 64-wide slot (left: the real back
  // button, right: an empty balancing spacer) is what keeps the center
  // title/subtitle truly centered on the physical screen — not the back
  // button's own size, which is smaller and centered within this slot.
  focusHeaderSide: {
    width: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The real tappable back control: a fixed 48×48 layout box (well above
  // the 44×44 minimum touch target on its own, no hitSlop required to
  // clear it) — a circular white surface with a subtle border so it reads
  // as a clearly tappable control against the header instead of a bare
  // icon. Never absolutely positioned against the physical screen top —
  // it's a normal flex child of focusHeaderSide, which itself is a normal
  // flex child of focusHeaderRow, which only ever starts below
  // SafeAreaView's own top inset.
  focusBackButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.background.card,
    borderWidth: 1,
    borderColor: color.border.divider,
  },
  focusHeaderSidePressed: {
    opacity: 0.6,
  },
  focusHeaderCenter: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  focusHeaderTitle: {
    fontSize: typeTokens.subheading.fontSize,
    lineHeight: typeTokens.subheading.lineHeight,
    fontWeight: '700',
    color: color.text.primary,
  },
  focusHeaderSubtitle: {
    fontSize: typeTokens.caption.fontSize,
    lineHeight: typeTokens.caption.lineHeight,
    color: color.text.secondary,
  },
  focusBody: {
    flex: 1,
    gap: space.sm,
    padding: space.lg,
  },
  focusList: {
    paddingBottom: space.xxl,
  },
  focusListHeader: {
    gap: space.xs,
  },
  focusCardGap: {
    height: space.xs,
  },
  focusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: touchTarget.min,
    backgroundColor: color.background.card,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: color.border.divider,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
  },
  focusCardSelected: {
    borderColor: color.primary.violet,
    borderWidth: 1.5,
  },
  focusCardPressed: {
    opacity: 0.85,
  },
  focusCardIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: color.accent.lavender,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  focusCardTextCol: {
    flex: 1,
    gap: 3,
  },
  focusCardTitle: {
    fontSize: typeTokens.body.fontSize,
    fontWeight: '600',
    color: color.text.primary,
  },
  focusCardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    flexWrap: 'wrap',
  },
  priorityBadge: {
    borderRadius: radius.pill,
    paddingHorizontal: space.xs,
    paddingVertical: 1,
  },
  priorityBadgeText: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '600',
  },
  focusLoadingSpacer: {
    marginVertical: space.md,
  },
  focusEmptyState: {
    alignItems: 'center',
    gap: space.xs,
    paddingVertical: space.xl,
  },
  focusEmptyText: {
    fontSize: typeTokens.body.fontSize,
    color: color.text.secondary,
    textAlign: 'center',
  },
});
