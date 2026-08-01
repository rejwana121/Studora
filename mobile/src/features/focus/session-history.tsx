import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { getProfile } from '@/api/profile';
import { listSessions } from '@/api/sessions';
import { Banner } from '@/components/banner';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { ThemedText } from '@/components/themed-text';
import {
  color,
  radius,
  space,
  subjectColor,
  touchTarget,
  type as typeTokens,
} from '@/design-system/tokens';
import { formatZonedDateTime } from '@/lib/date';
import type { StudySessionRead } from '@/types/api';

const PAGE_LIMIT = 20;
const DEFAULT_VISIBLE_COUNT = 5;

function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

interface SessionHistoryProps {
  token: string;
  /** Bump to force a first-page reload — used when a session is
   * discovered to have finished elsewhere, so the newly-finished
   * session appears without a manual pull-to-refresh. */
  refreshKey: number;
}

/** Rendered inline (plain rows, not a FlatList) because this list is
 * embedded within the Focus screen's single outer ScrollView alongside
 * the session card — a nested FlatList's onEndReached never fires when
 * the FlatList itself isn't the scrolling surface, so pagination here
 * uses an explicit "Load more" control instead (the documented
 * alternative to onEndReached-driven infinite scroll). */
export function SessionHistory({ token, refreshKey }: SessionHistoryProps) {
  const [timezone, setTimezone] = useState<string | null>(null);
  const [isProfileLoading, setIsProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [sessions, setSessions] = useState<StudySessionRead[]>([]);
  const [nextOffset, setNextOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingFirst, setIsLoadingFirst] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  // Purely local disclosure of already-loaded rows — never triggers a
  // fetch. Reset to collapsed whenever the list itself is reset (see
  // resetAndLoadFirstPage), so a refresh always starts short.
  const [isExpanded, setIsExpanded] = useState(false);

  const generationRef = useRef(0);

  const loadProfile = useCallback(() => {
    setIsProfileLoading(true);
    setProfileError(null);
    getProfile(token).then((result) => {
      if (result.ok) {
        setTimezone(result.data.timezone);
        setProfileError(null);
      } else {
        setProfileError(result.error.message);
      }
      setIsProfileLoading(false);
    });
  }, [token]);

  const fetchPage = useCallback(
    (pageOffset: number) => {
      const isFirstPage = pageOffset === 0;
      const generation = generationRef.current;
      if (isFirstPage) setIsLoadingFirst(true);
      else setIsLoadingMore(true);
      setListError(null);

      listSessions(token, { status: 'Finished', limit: PAGE_LIMIT, offset: pageOffset }).then((result) => {
        if (generationRef.current !== generation) return;
        if (!result.ok) {
          setListError(result.error.message);
          if (isFirstPage) setIsLoadingFirst(false);
          else setIsLoadingMore(false);
          return;
        }
        setSessions((prev) => {
          const base = isFirstPage ? [] : prev;
          const existingIds = new Set(base.map((s) => s.id));
          const deduped = result.data.filter((s) => !existingIds.has(s.id));
          return [...base, ...deduped];
        });
        setHasMore(result.data.length === PAGE_LIMIT);
        setNextOffset(pageOffset + result.data.length);
        if (isFirstPage) setIsLoadingFirst(false);
        else setIsLoadingMore(false);
      });
    },
    [token]
  );

  const resetAndLoadFirstPage = useCallback(() => {
    generationRef.current += 1;
    setSessions([]);
    setNextOffset(0);
    setHasMore(true);
    setListError(null);
    setIsExpanded(false);
    fetchPage(0);
  }, [fetchPage]);

  useEffect(() => {
    loadProfile();
    resetAndLoadFirstPage();
    // loadProfile/resetAndLoadFirstPage are stable for a given `token`;
    // `refreshKey` is the deliberate re-run trigger here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, refreshKey]);

  function handleRetry() {
    fetchPage(nextOffset);
  }

  const isFirstPageFailure = Boolean(listError) && nextOffset === 0 && sessions.length === 0;
  const isLaterPageFailure = Boolean(listError) && !isFirstPageFailure;

  // Local-only slice of already-loaded sessions — "View more"/"Show less"
  // never fetches; the server "Load more" pagination below is separate
  // and only offered once the local view is already fully expanded.
  const visibleSessions = isExpanded ? sessions : sessions.slice(0, DEFAULT_VISIBLE_COUNT);
  const hasHiddenLocal = sessions.length > DEFAULT_VISIBLE_COUNT;

  return (
    <View style={styles.container}>
      <ThemedText type="default" style={styles.sectionHeader}>
        History
      </ThemedText>

      {isProfileLoading && <ActivityIndicator color={color.primary.violet} />}

      {!isProfileLoading && profileError && (
        <View style={styles.errorBlock}>
          <Banner variant="error" message={`Timezone unavailable: ${profileError}`} />
          <Button label="Retry" variant="secondary" onPress={loadProfile} />
        </View>
      )}

      {!isProfileLoading && !profileError && timezone && (
        <View style={styles.list}>
          {isLoadingFirst && <ActivityIndicator color={color.primary.violet} />}

          {isFirstPageFailure && listError && (
            <View style={styles.errorBlock}>
              <Banner variant="error" message={listError} />
              <Button label="Retry" variant="secondary" onPress={handleRetry} />
            </View>
          )}

          {!isLoadingFirst && !isFirstPageFailure && sessions.length === 0 && (
            <EmptyState message="No finished sessions yet" />
          )}

          {sessions.length > 0 && (
            <View style={styles.historyGroup}>
              {visibleSessions.map((item, index) => (
                <Fragment key={item.id}>
                  <HistoryRow session={item} timezone={timezone} />
                  {index < visibleSessions.length - 1 && <View style={styles.divider} />}
                </Fragment>
              ))}
            </View>
          )}

          {hasHiddenLocal && (
            <Button
              label={isExpanded ? 'Show less' : 'View more'}
              variant="text"
              onPress={() => setIsExpanded((prev) => !prev)}
            />
          )}

          {isLoadingMore && <ActivityIndicator color={color.primary.violet} style={styles.loadingMore} />}

          {isLaterPageFailure && listError && (
            <View style={styles.errorBlock}>
              <Banner variant="error" message={listError} />
              <Button label="Retry" variant="secondary" onPress={handleRetry} />
            </View>
          )}

          {isExpanded && !isLoadingFirst && !isLoadingMore && !listError && hasMore && sessions.length > 0 && (
            <Button label="Load more" variant="secondary" onPress={() => fetchPage(nextOffset)} />
          )}
        </View>
      )}
    </View>
  );
}

function HistoryRow({ session, timezone }: { session: StudySessionRead; timezone: string }) {
  const dateTime = formatZonedDateTime(new Date(session.started_at), timezone);

  return (
    <View style={styles.row}>
      <View style={styles.rowContent}>
        <ThemedText type="default" style={styles.rowTitle} numberOfLines={1}>
          {session.task ? session.task.title : dateTime}
        </ThemedText>
        {session.task && (
          <View style={styles.metaRow}>
            {session.task.subject && (
              <View style={styles.subjectChip}>
                <View
                  style={[
                    styles.subjectDot,
                    { backgroundColor: subjectColor[session.task.subject.color_token] },
                  ]}
                />
                <ThemedText type="default" style={styles.metaText}>
                  {session.task.subject.name}
                  {session.task.subject.archived ? ' (archived)' : ''}
                </ThemedText>
              </View>
            )}
            <ThemedText type="default" style={styles.metaText}>
              {dateTime}
            </ThemedText>
          </View>
        )}
      </View>
      <ThemedText type="default" style={styles.duration}>
        {formatDuration(session.active_duration_seconds)}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: space.sm,
  },
  sectionHeader: {
    fontSize: typeTokens.label.fontSize,
    fontWeight: '600',
    color: color.text.secondary,
    textTransform: 'uppercase',
  },
  list: {
    gap: space.sm,
  },
  errorBlock: {
    gap: space.sm,
  },
  loadingMore: {
    marginVertical: space.sm,
  },
  historyGroup: {
    backgroundColor: color.background.card,
    borderRadius: radius.card,
    overflow: 'hidden',
  },
  divider: {
    height: 1,
    backgroundColor: color.border.divider,
    marginHorizontal: space.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: touchTarget.min,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
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
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    flexWrap: 'wrap',
  },
  metaText: {
    fontSize: typeTokens.caption.fontSize,
    color: color.text.secondary,
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
  duration: {
    fontSize: typeTokens.body.fontSize,
    fontWeight: '600',
    color: color.text.primary,
  },
});
