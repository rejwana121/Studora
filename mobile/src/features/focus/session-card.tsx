import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { Banner } from '@/components/banner';
import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { TaskPickerModal, type PickerTaskSummary } from '@/features/tasks/task-picker';
import {
  color,
  radius,
  space,
  subjectColor,
  touchTarget,
  type as typeTokens,
} from '@/design-system/tokens';

import { BreakPromptModal } from './break-prompt-modal';
import { STALE_WARNING_MS, type UseFocusSessionResult } from './use-focus-session';

// Idle: a compact decorative ring per the approved reference (132–140dp).
const IDLE_RING_SIZE = 136;
// Active/Paused: the sole hero element floating on canvas (no card around
// it) — modestly larger than idle's, still clearly more compact than the
// original 168dp-in-a-giant-card treatment.
const ACTIVE_RING_SIZE = 172;
// Complete: a small checkmark ring, not a timer.
const COMPLETE_RING_SIZE = 88;

function formatTimer(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** The one truthful duration formatter used everywhere a completed
 *  duration is shown (this file and session-history.tsx) — never forces a
 *  minimum of 1 minute. 0s → "0m", 1–59s → "Ns", 60s+ → "Xm"/"Xh Ym".
 *  Duplicated (not imported) rather than shared: both files must stay
 *  self-contained per this correction's file scope. */
function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  if (s === 0) return '0m';
  if (s < 60) return `${s}s`;
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

/** Formats session.started_at as just a clock time ("3:45 PM") using an
 *  explicit IANA timezone — never device-local. Only called when timezone
 *  is known. */
function formatTimeOnly(startedAt: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(startedAt));
}

interface SessionCardProps {
  token: string;
  focus: UseFocusSessionResult;
  /** IANA timezone forwarded from focus.tsx for started_at formatting.
   *  null while the profile fetch is in-flight; caption is hidden until
   *  it resolves to avoid showing device-local time. */
  timezone: string | null;
  /** True when a same-device finish was just confirmed — shows the
   *  Session Complete panel instead of the idle card. */
  showComplete: boolean;
  /** Called by the Done button; resets showComplete to false in the parent. */
  onDismissComplete: () => void;
}

export function SessionCard({ token, focus, timezone, showComplete, onDismissComplete }: SessionCardProps) {
  const [taskId, setTaskId] = useState<string | null>(null);
  const [taskSnapshot, setTaskSnapshot] = useState<PickerTaskSummary | null>(null);
  const [isPickerVisible, setIsPickerVisible] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  async function handleStart() {
    setIsStarting(true);
    const error = await focus.start(taskId, taskSnapshot?.status ?? null);
    setIsStarting(false);
    if (error) {
      setStartError(error);
    } else {
      setStartError(null);
      setTaskId(null);
      setTaskSnapshot(null);
    }
  }

  // Exact finish confirmation preserved from the original file — also the
  // handler for the Active/Paused header's X button, so both entry points
  // share the identical confirm-then-finish flow (never a silent finish).
  function handleFinish() {
    Alert.alert('Finish focus session?', 'This ends the session and records its total time.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Finish', onPress: () => focus.finish() },
    ]);
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  if (focus.phase === 'loading') {
    return (
      <View style={styles.idleCard}>
        <ThemedText type="default" style={styles.loadingText}>
          Loading…
        </ThemedText>
      </View>
    );
  }

  // ── Reconcile error (no session to display) ───────────────────────────────
  if (focus.reconcileError && !focus.session) {
    return (
      <View style={styles.idleCard}>
        <Banner variant="error" message={focus.reconcileError} />
        <Button label="Retry" variant="secondary" onPress={() => focus.reconcile()} />
      </View>
    );
  }

  // ── Session Complete ──────────────────────────────────────────────────────
  // Guarded by both showComplete (parent signal) and phase === 'no-session'
  // so it never renders while a session is still active or loading.
  // lastFinishedSession is the finish API's own response row (see
  // use-focus-session.ts) — the authoritative, server-computed final
  // duration, not a previously-synced/stale one. Session count is
  // deliberately never shown here — it isn't part of the completed-session
  // response, unlike the Today summary in Idle.
  const finished = focus.lastFinishedSession;
  if (showComplete && focus.phase === 'no-session' && finished !== null) {
    // The one truthful duration, used identically in both places below —
    // this is what keeps the headline sentence and the Focus time row (and
    // the newest Recent Sessions row, sourced from the same server value)
    // in agreement.
    const focusedDuration = formatDuration(finished.active_duration_seconds);
    return (
      <View style={styles.completeContainer}>
        {/* Top completion surface — edge-to-edge and squared at the top so
            it reads as a band belonging to the screen, not a floating
            rounded card; rounds into the white card below instead. */}
        <View style={styles.completeMintSurface}>
          <View style={styles.completeRingOuter}>
            <View style={styles.completeRing}>
              <Icon name="checkmark" size="lg" color={color.secondary.teal} />
            </View>
          </View>

          <ThemedText type="default" style={styles.completeHeading}>
            Session complete
          </ThemedText>
          <ThemedText type="default" style={styles.completeSub}>
            Great work — you focused for {focusedDuration}.
          </ThemedText>

          {/* Purely decorative, non-interactive — no assets/dependencies. */}
          <View style={styles.decorativeDotsRow}>
            <View style={styles.decorativeDot} />
            <View style={[styles.decorativeDot, styles.decorativeDotMid]} />
            <View style={styles.decorativeDot} />
          </View>
        </View>

        {/* Compact white summary card — real data only. */}
        <View style={styles.statBox}>
          <View style={styles.statRow}>
            <Icon name="time-outline" size="sm" color={color.text.secondary} />
            <ThemedText type="default" style={styles.statLabel}>
              Focus time
            </ThemedText>
            <ThemedText type="default" style={styles.statValue}>
              {focusedDuration}
            </ThemedText>
          </View>
          {finished.task && (
            <>
              <View style={styles.statDivider} />
              <View style={styles.statRow}>
                <Icon name="document-text-outline" size="sm" color={color.text.secondary} />
                <ThemedText type="default" style={styles.statLabel}>
                  Linked task
                </ThemedText>
                <ThemedText type="default" style={styles.statValue} numberOfLines={1}>
                  {finished.task.title}
                </ThemedText>
              </View>
            </>
          )}
        </View>

        <Button label="Done" onPress={onDismissComplete} />
      </View>
    );
  }

  // ── Idle (no session) ─────────────────────────────────────────────────────
  if (focus.phase === 'no-session') {
    return (
      <View style={styles.idleCard}>
        {/* Decorative ring — framing device only; no arc, no fill, no
            percentage implied. Idle border is divider-grey so the ring
            reads as a neutral placeholder, not an active indicator.
            Explicit lineHeight on the timer text below — its previous
            absence was what caused "00:00" to clip vertically. */}
        <View style={styles.ringOuter}>
          <View style={[styles.ring, styles.ringIdle]}>
            {/* formatTimer(0) → "00:00" — correct: displaySeconds = 0
                whenever there is no active session (see applySnapshot). */}
            <ThemedText
              type="default"
              style={styles.timerDisplay}
              accessibilityLabel="No active session"
            >
              {formatTimer(focus.displaySeconds)}
            </ThemedText>
            <ThemedText type="default" style={styles.timerSub}>
              Ready to focus
            </ThemedText>
          </View>
        </View>

        <View style={styles.divider} />

        {/* Compact grouped selector — General Focus / Choose a task read
            as one unit rather than two loose rows. */}
        <View style={styles.modeGroup}>
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ checked: taskSnapshot === null }}
            accessibilityLabel="General Focus"
            onPress={() => {
              setTaskId(null);
              setTaskSnapshot(null);
            }}
            style={({ pressed }) => [styles.modeRow, pressed && styles.modeRowPressed]}
          >
            <Icon
              name={taskSnapshot === null ? 'radio-button-on' : 'radio-button-off-outline'}
              size="sm"
              color={taskSnapshot === null ? color.primary.violet : color.text.secondary}
            />
            <ThemedText
              type="default"
              style={[styles.modeLabel, taskSnapshot === null && styles.modeLabelActive]}
            >
              General Focus
            </ThemedText>
          </Pressable>

          <View style={styles.modeGroupDivider} />

          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ checked: taskSnapshot !== null }}
            accessibilityLabel={taskSnapshot ? `Task: ${taskSnapshot.title}` : 'Choose a task'}
            onPress={() => setIsPickerVisible(true)}
            style={({ pressed }) => [styles.modeRow, pressed && styles.modeRowPressed]}
          >
            <Icon
              name={taskSnapshot !== null ? 'radio-button-on' : 'radio-button-off-outline'}
              size="sm"
              color={taskSnapshot !== null ? color.primary.violet : color.text.secondary}
            />
            <View style={styles.modeRowContent}>
              {taskSnapshot ? (
                <>
                  <ThemedText
                    type="default"
                    style={[styles.modeLabel, styles.modeLabelActive]}
                    numberOfLines={1}
                  >
                    {taskSnapshot.title}
                  </ThemedText>
                  {taskSnapshot.subject && (
                    <View style={styles.subjectChip}>
                      <View
                        style={[
                          styles.subjectDot,
                          { backgroundColor: subjectColor[taskSnapshot.subject.color_token] },
                        ]}
                      />
                      <ThemedText type="default" style={styles.metaText}>
                        {taskSnapshot.subject.name}
                        {taskSnapshot.subject.archived ? ' (archived)' : ''}
                      </ThemedText>
                    </View>
                  )}
                </>
              ) : (
                <ThemedText type="default" style={styles.modeLabel}>
                  Choose a task
                </ThemedText>
              )}
            </View>
            <Icon name="chevron-forward-outline" size="sm" color={color.text.secondary} />
          </Pressable>
        </View>

        {startError && <Banner variant="error" message={startError} />}

        <Button label="Start Focus" onPress={handleStart} loading={isStarting} />

        <TaskPickerModal
          visible={isPickerVisible}
          token={token}
          currentTask={taskSnapshot}
          onSelect={(task) => {
            setTaskId(task ? task.id : null);
            setTaskSnapshot(task);
          }}
          onClose={() => setIsPickerVisible(false)}
          variant="focus"
        />
      </View>
    );
  }

  // ── Active / Paused ───────────────────────────────────────────────────────
  const { session } = focus;
  if (!session) return null;

  const isActive = session.status === 'Active';
  const elapsedMinutes = Math.floor(focus.displaySeconds / 60);
  const elapsedSeconds = Math.floor(focus.displaySeconds % 60);

  const secondsSinceSyncMs = focus.lastSyncedAtMs !== null ? Date.now() - focus.lastSyncedAtMs : null;
  const isStale = secondsSinceSyncMs !== null && secondsSinceSyncMs > STALE_WARNING_MS;
  const syncCaption =
    secondsSinceSyncMs === null
      ? null
      : isStale
        ? 'Reconnecting…'
        : `Synced ${Math.max(0, Math.floor(secondsSinceSyncMs / 1000))}s ago`;

  const sessionTitle = session.task
    ? `${session.task.title}${session.task.subject?.archived ? ' (archived)' : ''}`
    : 'General Focus';
  // Only shown once the profile timezone has resolved — never falls back
  // to device-local time.
  const startedTime = session && timezone ? formatTimeOnly(session.started_at, timezone) : null;
  // Started time + sync status combined into one secondary line inside the
  // compact details card below, instead of started-at and sync living as
  // two separate floating captions elsewhere on the screen.
  const detailsSecondary = [startedTime ? `Started ${startedTime}` : null, syncCaption]
    .filter((part): part is string => part !== null)
    .join(' · ');

  return (
    // No outer card — the ring sits directly on the screen's canvas
    // background instead of inside a large white card, per the approved
    // reference. Idle/Active/Complete deliberately no longer share the
    // same outer layout.
    <View style={styles.sessionContainer}>
      <View style={styles.sessionHeaderRow}>
        <View style={styles.sessionHeaderSpacer} />
        <ThemedText type="default" style={styles.sessionHeader}>
          Focus session
        </ThemedText>
        {/* Real, accessible action — invokes the exact same finish
            confirmation as the Finish button below. Never a silent
            destructive action. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Finish focus session"
          hitSlop={space.sm}
          onPress={handleFinish}
          style={({ pressed }) => [styles.sessionCloseButton, pressed && styles.sessionClosePressed]}
        >
          <Icon name="close" size="sm" color={color.text.secondary} />
        </Pressable>
      </View>

      <View style={styles.activeRingOuter}>
        <View style={[styles.ring, isActive ? styles.ringActive : styles.ringPaused]}>
          <ThemedText
            type="default"
            style={styles.timerDisplayLarge}
            accessibilityLabel={`${elapsedMinutes} minutes ${elapsedSeconds} seconds elapsed, ${session.status}`}
          >
            {formatTimer(focus.displaySeconds)}
          </ThemedText>
        </View>
      </View>

      {/* Status pill */}
      <View style={styles.pillOuter}>
        <View style={[styles.statusPill, isActive ? styles.statusPillActive : styles.statusPillPaused]}>
          <View style={[styles.statusDot, isActive ? styles.statusDotActive : styles.statusDotPaused]} />
          <ThemedText
            type="default"
            style={[styles.statusText, isActive ? styles.statusTextActive : styles.statusTextPaused]}
          >
            {isActive ? 'Focus in progress' : 'Paused'}
          </ThemedText>
        </View>
      </View>

      {focus.reconcileError && <Banner variant="error" message={focus.reconcileError} />}
      {focus.mutationError && <Banner variant="error" message={focus.mutationError} />}

      {/* Compact details card — real data only (linked task/General Focus,
          real started-at time, and sync status folded into one secondary
          line instead of scattered floating captions). No fake "Session
          goal" text. */}
      <View style={styles.detailsCard}>
        <View style={styles.detailsIconBadge}>
          <Icon name="document-text-outline" size="sm" color={color.primary.violet} />
        </View>
        <View style={styles.detailsTextCol}>
          <ThemedText type="default" style={styles.detailsPrimary} numberOfLines={1}>
            {sessionTitle}
          </ThemedText>
          {detailsSecondary && (
            <ThemedText
              type="default"
              style={[styles.detailsSecondary, isStale && styles.syncCaptionStale]}
              numberOfLines={1}
            >
              {detailsSecondary}
            </ThemedText>
          )}
        </View>
      </View>

      {/* Clean text labels — no emoji characters. */}
      <View style={styles.actions}>
        {isActive ? (
          <Button label="Pause" onPress={() => focus.pause()} loading={focus.isMutating} />
        ) : (
          <Button label="Resume" onPress={() => focus.resume()} loading={focus.isMutating} />
        )}
        <Button label="Finish" variant="secondary" onPress={handleFinish} disabled={focus.isMutating} />
      </View>

      {/* Break prompt modal — unchanged from original */}
      <BreakPromptModal
        visible={session.status === 'Active' && session.break_eligible}
        isMutating={focus.isMutating}
        onTakeBreak={focus.takeBreak}
        onSnooze={focus.snooze}
        onDismiss={focus.dismiss}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // ── Idle / Loading / Reconcile-error card ──────────────────────────────────
  idleCard: {
    gap: space.sm,
    backgroundColor: color.background.card,
    borderRadius: radius.card,
    padding: space.md,
    borderWidth: 1,
    borderColor: color.border.divider,
  },
  loadingText: {
    fontSize: typeTokens.body.fontSize,
    color: color.text.secondary,
    textAlign: 'center',
    paddingVertical: space.md,
  },

  // ── Active/Paused: no card — ring and content sit directly on canvas ──────
  sessionContainer: {
    gap: space.sm,
    alignItems: 'center',
  },
  sessionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  sessionHeaderSpacer: {
    width: 28,
  },
  sessionHeader: {
    flex: 1,
    fontSize: typeTokens.label.fontSize,
    fontWeight: '600',
    color: color.text.secondary,
    textAlign: 'center',
  },
  sessionCloseButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sessionClosePressed: {
    opacity: 0.6,
  },

  // ── Ring ─────────────────────────────────────────────────────────────────
  ringOuter: {
    alignItems: 'center',
    paddingVertical: space.sm,
  },
  // Active/Paused only — a touch more vertical room than idle's ringOuter
  // so the larger hero ring stays balanced rather than cramped.
  activeRingOuter: {
    alignItems: 'center',
    paddingVertical: space.md,
  },
  ring: {
    width: IDLE_RING_SIZE,
    height: IDLE_RING_SIZE,
    borderRadius: IDLE_RING_SIZE / 2,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  ringIdle: {
    borderColor: color.border.divider,
  },
  ringActive: {
    width: ACTIVE_RING_SIZE,
    height: ACTIVE_RING_SIZE,
    borderRadius: ACTIVE_RING_SIZE / 2,
    borderColor: color.primary.violet,
  },
  ringPaused: {
    width: ACTIVE_RING_SIZE,
    height: ACTIVE_RING_SIZE,
    borderRadius: ACTIVE_RING_SIZE / 2,
    borderColor: color.border.divider,
  },

  // ── Timer text — explicit lineHeight on both so the digits never clip
  //    vertically inside the ring (the previous bug had no lineHeight at
  //    all, leaving RN's default too tight for bold numerals). ──────────────
  timerDisplay: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '700',
    color: color.text.primary,
    letterSpacing: -0.5,
  },
  timerDisplayLarge: {
    fontSize: 40,
    lineHeight: 46,
    fontWeight: '700',
    color: color.text.primary,
    letterSpacing: -0.5,
  },
  timerSub: {
    fontSize: typeTokens.caption.fontSize,
    lineHeight: typeTokens.caption.lineHeight,
    color: color.text.secondary,
  },

  // ── Divider ───────────────────────────────────────────────────────────────
  divider: {
    height: 1,
    backgroundColor: color.border.divider,
    marginVertical: space.xs,
  },

  // ── Mode selector (idle) — visually grouped as one compact unit ───────────
  modeGroup: {
    backgroundColor: color.surface.canvas,
    borderRadius: radius.control,
    overflow: 'hidden',
  },
  modeGroupDivider: {
    height: 1,
    backgroundColor: color.border.divider,
    marginHorizontal: space.sm,
  },
  modeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: touchTarget.min,
    paddingHorizontal: space.sm,
  },
  modeRowPressed: {
    opacity: 0.7,
  },
  modeRowContent: {
    flex: 1,
    gap: 2,
  },
  modeLabel: {
    fontSize: typeTokens.caption.fontSize,
    color: color.text.secondary,
  },
  modeLabelActive: {
    color: color.text.primary,
    fontWeight: '600',
  },

  // ── Subject chip (idle task row) ──────────────────────────────────────────
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

  // ── Status pill (active/paused) ───────────────────────────────────────────
  pillOuter: {
    alignItems: 'center',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  statusPillActive: {
    backgroundColor: color.info.bg,
  },
  statusPillPaused: {
    backgroundColor: color.background.main,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
  },
  statusDotActive: {
    backgroundColor: color.secondary.teal,
  },
  statusDotPaused: {
    backgroundColor: color.text.disabled,
  },
  statusText: {
    fontSize: typeTokens.caption.fontSize,
    fontWeight: '600',
  },
  statusTextActive: {
    color: color.info.text,
  },
  statusTextPaused: {
    color: color.text.secondary,
  },

  // ── Sync staleness override — applied to detailsSecondary text ────────────
  syncCaptionStale: {
    color: color.warning.strong,
  },

  // ── Session details card (active/paused) — compact icon-badge row, not
  //    a settings table: one row, task/General Focus as the primary line,
  //    started time + sync status folded into one secondary line. ───────────
  detailsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    alignSelf: 'stretch',
    backgroundColor: color.background.card,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: color.border.divider,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
    minHeight: touchTarget.min,
  },
  detailsIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: color.accent.lavender,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  detailsTextCol: {
    flex: 1,
    gap: 2,
  },
  detailsPrimary: {
    fontSize: typeTokens.body.fontSize,
    fontWeight: '600',
    color: color.text.primary,
  },
  detailsSecondary: {
    fontSize: typeTokens.caption.fontSize,
    color: color.text.secondary,
  },

  // ── Action buttons ────────────────────────────────────────────────────────
  actions: {
    gap: space.sm,
    marginTop: 0,
    alignSelf: 'stretch',
  },

  // ── Session Complete ─────────────────────────────────────────────────────
  completeContainer: {
    gap: space.xs,
  },
  // A top completion surface, not a floating card: edge-to-edge (cancels
  // focus.tsx's horizontal content padding), squared top corners so it
  // reads as a band belonging to the screen, rounding only at the bottom
  // where it meets the white summary card below.
  completeMintSurface: {
    gap: space.xs,
    backgroundColor: color.accent.mint,
    marginHorizontal: -space.lg,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: radius.card,
    borderBottomRightRadius: radius.card,
  },
  completeRingOuter: {
    alignItems: 'center',
    paddingVertical: space.xs,
  },
  completeRing: {
    width: COMPLETE_RING_SIZE,
    height: COMPLETE_RING_SIZE,
    borderRadius: COMPLETE_RING_SIZE / 2,
    borderWidth: 3,
    borderColor: color.secondary.teal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completeHeading: {
    fontSize: typeTokens.subheading.fontSize,
    lineHeight: typeTokens.subheading.lineHeight,
    fontWeight: '700',
    color: color.text.primary,
    textAlign: 'center',
  },
  completeSub: {
    fontSize: typeTokens.caption.fontSize,
    lineHeight: typeTokens.caption.lineHeight,
    color: color.text.secondary,
    textAlign: 'center',
  },
  // Purely decorative, non-interactive — plain Views, no assets/deps.
  decorativeDotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: space.xs,
    paddingTop: space.xs,
  },
  decorativeDot: {
    width: 5,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: color.secondary.teal,
    opacity: 0.35,
  },
  decorativeDotMid: {
    width: 7,
    height: 7,
    borderRadius: radius.pill,
    opacity: 0.55,
  },
  statBox: {
    backgroundColor: color.background.card,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: color.border.divider,
    overflow: 'hidden',
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
    minHeight: touchTarget.min,
  },
  statLabel: {
    flex: 1,
    fontSize: typeTokens.caption.fontSize,
    color: color.text.secondary,
  },
  statValue: {
    fontSize: typeTokens.body.fontSize,
    fontWeight: '600',
    color: color.text.primary,
    flexShrink: 1,
  },
  statDivider: {
    height: 1,
    backgroundColor: color.border.divider,
    marginHorizontal: space.sm,
  },
});
