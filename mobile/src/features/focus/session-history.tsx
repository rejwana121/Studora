import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';

import { deleteSession, listSessions } from '@/api/sessions';
import { Banner } from '@/components/banner';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { OptionSheet } from '@/features/tasks/option-sheet';
import {
  color,
  radius,
  space,
  touchTarget,
  type as typeTokens,
} from '@/design-system/tokens';
import { toZonedDateString } from '@/lib/date';
import type { StudySessionRead } from '@/types/api';

const PAGE_LIMIT = 20;
const DEFAULT_VISIBLE_COUNT = 5;

/** The one truthful duration formatter used everywhere a duration is
 *  shown (this file and session-card.tsx) — never forces a minimum of 1
 *  minute. 0s → "0m" (accurate for "no activity"), 1–59s → "Ns" (never a
 *  misleading "0m" for a real short session), 60s+ → "Xm"/"Xh Ym". */
function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  if (s === 0) return '0m';
  if (s < 60) return `${s}s`;
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

/** Formats session.started_at as a calendar-meaningful relative date+time in
 *  the user's explicit IANA timezone. Uses the raw started_at value and
 *  timezone — never a pre-formatted display string — so comparisons with
 *  today/yesterday are computed correctly, not by parsing locale output. */
function formatRelativeDate(startedAt: string, timezone: string): string {
  const sessionDate = new Date(startedAt);
  const now = new Date();

  const todayStr = toZonedDateString(now, timezone);
  const yesterdayStr = toZonedDateString(new Date(now.getTime() - 86_400_000), timezone);
  const sessionDateStr = toZonedDateString(sessionDate, timezone);

  const timeStr = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(sessionDate);

  if (sessionDateStr === todayStr) return `Today ${timeStr}`;
  if (sessionDateStr === yesterdayStr) return `Yesterday ${timeStr}`;

  // Older dates: "5 Aug 4:00 PM" style matching the reference.
  const dateStr = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    month: 'short',
    day: 'numeric',
  }).format(sessionDate);
  return `${dateStr} ${timeStr}`;
}

/** Which of the three Focus states is currently showing — drives which of
 *  "Today summary" / nothing / "Recent sessions" this renders. Passed down
 *  from focus.tsx's own phase/showComplete state so the two screens never
 *  disagree about what's currently on screen. */
export type SessionHistoryMode = 'idle' | 'in-session' | 'complete';

interface SessionHistoryProps {
  token: string;
  /** Bump to force a first-page reload — used when a session is
   * discovered to have finished elsewhere, so the newly-finished
   * session appears without a manual pull-to-refresh. */
  refreshKey: number;
  /** IANA timezone forwarded from focus.tsx's SessionContext profile —
   *  this component fetches no profile of its own. null while the
   *  profile hasn't resolved yet; date-relative text stays hidden until
   *  it does, matching SessionCard's own contract. */
  timezone: string | null;
  mode: SessionHistoryMode;
}

/** Rendered inline (plain rows, not a FlatList) because this list is
 * embedded within the Focus screen's single outer ScrollView alongside
 * the session card — a nested FlatList's onEndReached never fires when
 * the FlatList itself isn't the scrolling surface, so pagination here
 * uses an explicit "Load more" control instead (the documented
 * alternative to onEndReached-driven infinite scroll). */
export function SessionHistory({ token, refreshKey, timezone, mode }: SessionHistoryProps) {
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

  // ── Remove-from-history (Recent Sessions only) ─────────────────────────────
  // Which session's "..." menu is currently open — null when closed. Only
  // ever a Finished session's id: the sheet/button are only ever rendered
  // on Recent Sessions rows, and that list is already fetched with
  // `status: 'Finished'` above, so an Active/Paused session can never
  // reach this state in the first place.
  const [sheetSessionId, setSheetSessionId] = useState<string | null>(null);
  // Non-null while that session's DELETE request is in flight — disables
  // just that row's "..." button so a second tap can't fire a duplicate
  // request; other rows stay interactive.
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const generationRef = useRef(0);

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

  // Runs regardless of `mode` — the fetch is not gated on what's currently
  // rendered, so data is already fresh by the time the user returns to
  // Idle or lands on Complete. This is the one and only listSessions
  // request in the Focus screen; both the Today summary (idle) and Recent
  // sessions (complete) below read from this same `sessions` state.
  useEffect(() => {
    resetAndLoadFirstPage();
    // resetAndLoadFirstPage is stable for a given `token`; `refreshKey` is
    // the deliberate re-run trigger here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, refreshKey]);

  function handleRetry() {
    fetchPage(nextOffset);
  }

  function handleOpenMenu(sessionId: string) {
    setDeleteError(null);
    setSheetSessionId(sessionId);
  }

  function handleSheetSelect(value: string) {
    const sessionId = sheetSessionId;
    setSheetSessionId(null);
    if (value !== 'remove' || !sessionId) return;
    Alert.alert(
      'Remove session?',
      'This session will be permanently removed from your focus history.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => void handleConfirmRemove(sessionId) },
      ]
    );
  }

  async function handleConfirmRemove(sessionId: string) {
    if (deletingSessionId) return; // duplicate-tap guard
    setDeletingSessionId(sessionId);
    setDeleteError(null);
    const result = await deleteSession(token, sessionId);
    setDeletingSessionId(null);
    // Only an actual successful response (result.ok, driven by the real
    // HTTP status from `request()`) counts as deletion success — never
    // assumed, never optimistic.
    if (result.ok) {
      // Instant local removal first — Today's focused time/session count
      // and the idle Last-session card are both derived from this same
      // `sessions` array (see todaySummary above and sessions[0] below),
      // so they recalculate immediately with no extra request/flicker.
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      // Then a silent background reconciliation against the server's own
      // first page — belt-and-suspenders against the removed row ever
      // being able to reappear from stale pagination bookkeeping (it
      // can't, in this design: nextOffset/hasMore already track the
      // server's cursor independently of the local array's length, not
      // the local array itself), and the authoritative source of truth
      // for what "Recent sessions" should show going forward. Never
      // toggles isLoadingFirst/isLoadingMore — no visible flash on top of
      // the already-instant local removal above. Best-effort: a failure
      // here doesn't undo the already-confirmed, already-shown removal.
      reconcileFirstPage();
    } else {
      // Row stays visible — never pretend the removal succeeded.
      setDeleteError(result.error.message);
    }
  }

  const reconcileFirstPage = useCallback(() => {
    const generation = ++generationRef.current;
    listSessions(token, { status: 'Finished', limit: PAGE_LIMIT, offset: 0 }).then((result) => {
      if (generationRef.current !== generation) return; // superseded by a newer fetch/reconcile
      if (!result.ok) return; // best-effort — the row is already correctly removed locally
      setSessions(result.data);
      setHasMore(result.data.length === PAGE_LIMIT);
      setNextOffset(result.data.length);
    });
  }, [token]);

  // ── Today summary (idle + in-session) — derived from the already-fetched
  //    `sessions` page(s), never a second request. ───────────────────────────
  const todaySummary = useMemo(() => {
    if (!timezone) return null;
    const todayStr = toZonedDateString(new Date(), timezone);
    const todaySessions = sessions.filter((s) => toZonedDateString(new Date(s.started_at), timezone) === todayStr);
    const totalSeconds = todaySessions.reduce((sum, s) => sum + s.active_duration_seconds, 0);
    return { count: todaySessions.length, totalSeconds };
  }, [sessions, timezone]);

  // Shared by both the idle and in-session renders below so the card is
  // never duplicated — same real data, same markup, wherever it appears.
  function renderTodayCard() {
    if (!timezone || !todaySummary) return null;
    return (
      <View style={styles.todayCard}>
        <View style={styles.todayIconCircle}>
          <Icon name="calendar-outline" size="sm" color={color.primary.violet} />
        </View>
        <View style={styles.todayFocusedCol}>
          <ThemedText type="default" style={styles.todayTitle}>
            Today
          </ThemedText>
          <ThemedText type="default" style={styles.todayFocusedValue}>
            {formatDuration(todaySummary.totalSeconds)} focused
          </ThemedText>
        </View>

        <View style={styles.todayVerticalDivider} />

        <View style={styles.todaySessionsCol}>
          <ThemedText type="default" style={styles.todayStatValue}>
            {todaySummary.count}
          </ThemedText>
          <ThemedText type="default" style={styles.todayStatLabel}>
            {todaySummary.count === 1 ? 'session' : 'sessions'}
          </ThemedText>
        </View>
      </View>
    );
  }

  // In-session: the real Today progress summary instead of rendering
  // nothing — fills what was previously empty space below Pause/Resume/
  // Finish. No fake session goal/target/progress — same real data as Idle.
  if (mode === 'in-session') {
    return (
      <View style={styles.container}>
        {!timezone && <ActivityIndicator color={color.primary.violet} />}
        {renderTodayCard()}
      </View>
    );
  }

  const isFirstPageFailure = Boolean(listError) && nextOffset === 0 && sessions.length === 0;
  const isLaterPageFailure = Boolean(listError) && !isFirstPageFailure;

  // Local-only slice of already-loaded sessions — "View more"/"Show less"
  // never fetches; the server "Load more" pagination below is separate
  // and only offered once the local view is already fully expanded.
  const visibleSessions = isExpanded ? sessions : sessions.slice(0, DEFAULT_VISIBLE_COUNT);
  const hasHiddenLocal = sessions.length > DEFAULT_VISIBLE_COUNT;

  if (mode === 'idle') {
    // The already-fetched first history item — sessions is fetched
    // newest-first (see fetchPage/the existing "Recent sessions" list,
    // which already relies on this same ordering), so sessions[0] is the
    // real last completed session. Omitted entirely when none exists —
    // never a fabricated placeholder.
    const lastSession = sessions[0] ?? null;
    return (
      <View style={styles.container}>
        {!timezone && <ActivityIndicator color={color.primary.violet} />}
        {renderTodayCard()}
        {timezone && lastSession && (
          <View style={styles.lastSessionCard}>
            <View style={styles.lastSessionIconCircle}>
              <Icon name="time-outline" size="sm" color={color.secondary.teal} />
            </View>
            <View style={styles.todayFocusedCol}>
              <ThemedText type="default" style={styles.todayTitle}>
                Last session
              </ThemedText>
              <ThemedText type="default" style={styles.todayFocusedValue} numberOfLines={1}>
                {lastSession.task ? lastSession.task.title : 'General Focus'}
              </ThemedText>
              <ThemedText type="default" style={styles.lastSessionMeta} numberOfLines={1}>
                {formatRelativeDate(lastSession.started_at, timezone)} ·{' '}
                {formatDuration(lastSession.active_duration_seconds)}
              </ThemedText>
            </View>
          </View>
        )}
      </View>
    );
  }

  // ── mode === 'complete': compact Recent sessions — unchanged pagination
  //    and error handling. ────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <ThemedText type="default" style={styles.sectionHeader}>
        Recent sessions
      </ThemedText>

      {deleteError && <Banner variant="error" message={deleteError} />}

      {!timezone && <ActivityIndicator color={color.primary.violet} />}

      {timezone && (
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
            <View style={styles.cardsList}>
              {visibleSessions.map((item) => (
                <HistoryRow
                  key={item.id}
                  session={item}
                  timezone={timezone}
                  onOpenMenu={handleOpenMenu}
                  isDeleting={deletingSessionId === item.id}
                />
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

      {/* Cancel is built into OptionSheet itself — never a separate "Keep"
          option; every session is already kept by default. */}
      <OptionSheet
        visible={sheetSessionId !== null}
        title="Session options"
        options={[{ value: 'remove', label: 'Remove from history', destructive: true }]}
        value={null}
        onSelect={handleSheetSelect}
        onCancel={() => setSheetSessionId(null)}
      />
    </View>
  );
}

function HistoryRow({
  session,
  timezone,
  onOpenMenu,
  isDeleting,
}: {
  session: StudySessionRead;
  timezone: string;
  onOpenMenu: (sessionId: string) => void;
  isDeleting: boolean;
}) {
  // Relative date computed from raw started_at + explicit timezone — never
  // from an already-localised display string.
  const relativeDate = formatRelativeDate(session.started_at, timezone);
  const title = session.task ? session.task.title : 'General Focus';

  return (
    <View style={styles.sessionRowCard}>
      {/* Icon circle */}
      <View style={styles.iconCircle}>
        <Icon name="calendar-outline" size="sm" color={color.primary.violet} />
      </View>

      {/* Date + title */}
      <View style={styles.rowContent}>
        <ThemedText type="default" style={styles.historyDate}>
          {relativeDate}
        </ThemedText>
        <ThemedText type="default" style={styles.rowTitle} numberOfLines={1}>
          {title}
        </ThemedText>
      </View>

      {/* Duration + Completed badge — its own column, never crowded by
          the menu button below, which gets its own fixed-width slot. */}
      <View style={styles.rightCol}>
        <ThemedText type="default" style={styles.duration}>
          {formatDuration(session.active_duration_seconds)}
        </ThemedText>
        <View style={styles.completedBadge}>
          <ThemedText type="default" style={styles.completedBadgeText}>
            Completed
          </ThemedText>
        </View>
      </View>

      {/* Fixed 44×44 touch target — only ever shown on a Finished session
          (this row only renders inside Recent Sessions, already fetched
          with status: 'Finished'), so Active/Paused sessions can never
          reach this control. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Session options"
        onPress={() => onOpenMenu(session.id)}
        disabled={isDeleting}
        hitSlop={space.xs}
        style={({ pressed }) => [styles.menuButton, pressed && !isDeleting && styles.menuButtonPressed]}
      >
        {isDeleting ? (
          <ActivityIndicator size="small" color={color.text.secondary} />
        ) : (
          <Icon name="ellipsis-vertical" size="sm" color={color.text.secondary} />
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: space.sm,
  },
  // Sentence case, never uppercase — deliberately no textTransform.
  sectionHeader: {
    fontSize: typeTokens.label.fontSize,
    fontWeight: '600',
    color: color.text.primary,
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

  // ── Today summary (idle) — compact horizontal composition: calendar
  //    icon + "Today / real focused time" on the left, a divider, then
  //    real session count on the right — one polished white card. ──────────
  todayCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: color.background.card,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: color.border.divider,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
    minHeight: touchTarget.min,
  },
  todayIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: color.accent.lavender,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  todayFocusedCol: {
    flex: 1,
    gap: 2,
  },
  todayTitle: {
    fontSize: typeTokens.caption.fontSize,
    color: color.text.secondary,
  },
  todayFocusedValue: {
    fontSize: typeTokens.body.fontSize,
    fontWeight: '700',
    color: color.text.primary,
  },
  todayVerticalDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: color.border.divider,
  },
  todaySessionsCol: {
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: space.xs,
  },
  todayStatLabel: {
    fontSize: typeTokens.caption.fontSize,
    color: color.text.secondary,
  },
  todayStatValue: {
    fontSize: typeTokens.body.fontSize,
    fontWeight: '700',
    color: color.text.primary,
  },

  // ── Last session (idle only) — one compact reference-like white card
  //    below Today, shown only when a real completed session exists. ────────
  lastSessionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: color.background.card,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: color.border.divider,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
    minHeight: touchTarget.min,
  },
  lastSessionIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: color.accent.mint,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  lastSessionMeta: {
    fontSize: typeTokens.caption.fontSize,
    color: color.text.secondary,
  },

  // ── Recent sessions (complete) — separate compact cards with small
  //    gaps, not one dense shared table. ──────────────────────────────────────
  cardsList: {
    gap: space.sm,
  },
  sessionRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: touchTarget.min,
    backgroundColor: color.background.card,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: color.border.divider,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },

  // ── Left icon circle ──────────────────────────────────────────────────────
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: color.accent.lavender,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  // ── Centre: date + title ──────────────────────────────────────────────────
  rowContent: {
    flex: 1,
    gap: 2,
  },
  historyDate: {
    fontSize: typeTokens.caption.fontSize,
    lineHeight: typeTokens.caption.lineHeight,
    color: color.text.secondary,
  },
  rowTitle: {
    fontSize: typeTokens.caption.fontSize,
    fontWeight: '600',
    color: color.text.primary,
  },

  // ── Right: duration + Completed badge ─────────────────────────────────────
  rightCol: {
    alignItems: 'flex-end',
    gap: 2,
    flexShrink: 0,
  },
  duration: {
    fontSize: typeTokens.caption.fontSize,
    fontWeight: '600',
    color: color.text.primary,
  },
  completedBadge: {
    backgroundColor: color.risk.low.bg,
    borderRadius: radius.pill,
    paddingHorizontal: space.xs,
    paddingVertical: 1,
  },
  completedBadgeText: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '600',
    color: color.success.strong,
  },

  // ── Session options ("...") — its own fixed 44×44 slot, never crowding
  //    duration/Completed badge, which keep their own column to its left. ───
  menuButton: {
    width: touchTarget.min,
    height: touchTarget.min,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  menuButtonPressed: {
    opacity: 0.6,
  },
});
