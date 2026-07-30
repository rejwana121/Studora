import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { Banner } from '@/components/banner';
import { Button } from '@/components/button';
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

function formatTimer(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

interface SessionCardProps {
  token: string;
  focus: UseFocusSessionResult;
}

export function SessionCard({ token, focus }: SessionCardProps) {
  const [taskId, setTaskId] = useState<string | null>(null);
  const [taskSnapshot, setTaskSnapshot] = useState<PickerTaskSummary | null>(null);
  const [isPickerVisible, setIsPickerVisible] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  async function handleStart() {
    setIsStarting(true);
    const error = await focus.start(taskId);
    setIsStarting(false);
    if (error) {
      setStartError(error);
    } else {
      setStartError(null);
      setTaskId(null);
      setTaskSnapshot(null);
    }
  }

  function handleFinish() {
    Alert.alert('Finish focus session?', 'This ends the session and records its total time.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Finish', style: 'destructive', onPress: () => focus.finish() },
    ]);
  }

  if (focus.phase === 'loading') {
    return (
      <View style={styles.card}>
        <ThemedText type="default" style={styles.subtext}>
          Loading…
        </ThemedText>
      </View>
    );
  }

  if (focus.reconcileError && !focus.session) {
    return (
      <View style={styles.card}>
        <Banner variant="error" message={focus.reconcileError} />
        <Button label="Retry" variant="secondary" onPress={() => focus.reconcile()} />
      </View>
    );
  }

  if (focus.phase === 'no-session') {
    return (
      <View style={styles.card}>
        <ThemedText type="default" style={styles.heading}>
          Start a focus session
        </ThemedText>
        <ThemedText type="default" style={styles.subtext}>
          Optionally link a task, then start the timer.
        </ThemedText>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={taskSnapshot ? `Linked task: ${taskSnapshot.title}` : 'No task linked'}
          onPress={() => setIsPickerVisible(true)}
          style={({ pressed }) => [styles.taskField, pressed && styles.taskFieldPressed]}
        >
          <View style={styles.taskFieldContent}>
            <ThemedText type="default" style={styles.taskFieldTitle} numberOfLines={1}>
              {taskSnapshot ? taskSnapshot.title : 'No task'}
            </ThemedText>
            {taskSnapshot?.subject && (
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
          </View>
          <ThemedText type="default" style={styles.changeLabel}>
            Change
          </ThemedText>
        </Pressable>

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
        />
      </View>
    );
  }

  const { session } = focus;
  if (!session) return null;

  const secondsSinceSyncMs = focus.lastSyncedAtMs !== null ? Date.now() - focus.lastSyncedAtMs : null;
  const isStale = secondsSinceSyncMs !== null && secondsSinceSyncMs > STALE_WARNING_MS;
  const syncCaption =
    secondsSinceSyncMs === null
      ? null
      : isStale
        ? 'Reconnecting…'
        : `Synced ${Math.max(0, Math.floor(secondsSinceSyncMs / 1000))}s ago`;

  const elapsedMinutes = Math.floor(focus.displaySeconds / 60);
  const elapsedSeconds = Math.floor(focus.displaySeconds % 60);

  return (
    <View style={styles.card}>
      <ThemedText type="default" style={styles.statusLabel}>
        {session.status}
      </ThemedText>
      <ThemedText
        type="default"
        style={styles.timer}
        accessibilityLabel={`${elapsedMinutes} minutes ${elapsedSeconds} seconds elapsed, ${session.status}`}
      >
        {formatTimer(focus.displaySeconds)}
      </ThemedText>

      {session.task ? (
        <View style={styles.subjectChip}>
          {session.task.subject && (
            <View
              style={[styles.subjectDot, { backgroundColor: subjectColor[session.task.subject.color_token] }]}
            />
          )}
          <ThemedText type="default" style={styles.metaText}>
            {session.task.title}
            {session.task.subject?.archived ? ' (archived)' : ''}
          </ThemedText>
        </View>
      ) : (
        <ThemedText type="default" style={styles.metaText}>
          Unlinked focus session
        </ThemedText>
      )}

      {syncCaption && (
        <ThemedText type="default" style={[styles.syncCaption, isStale && styles.syncCaptionStale]}>
          {syncCaption}
        </ThemedText>
      )}

      {focus.reconcileError && <Banner variant="error" message={focus.reconcileError} />}
      {focus.mutationError && <Banner variant="error" message={focus.mutationError} />}

      <View style={styles.actions}>
        {session.status === 'Active' ? (
          <Button label="Pause" onPress={() => focus.pause()} loading={focus.isMutating} />
        ) : (
          <Button label="Resume" onPress={() => focus.resume()} loading={focus.isMutating} />
        )}
        <Button label="Finish" variant="secondary" onPress={handleFinish} disabled={focus.isMutating} />
      </View>

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
  card: {
    gap: space.sm,
    backgroundColor: color.background.card,
    borderRadius: radius.card,
    padding: space.md,
  },
  heading: {
    fontSize: typeTokens.subheading.fontSize,
    lineHeight: typeTokens.subheading.lineHeight,
    fontWeight: '600',
    color: color.text.primary,
  },
  subtext: {
    fontSize: typeTokens.body.fontSize,
    color: color.text.secondary,
  },
  taskField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: touchTarget.min,
    borderRadius: radius.control,
    borderWidth: 1.5,
    borderColor: color.border.divider,
    backgroundColor: color.background.main,
    paddingHorizontal: space.md,
  },
  taskFieldPressed: {
    opacity: 0.7,
  },
  taskFieldContent: {
    flex: 1,
    gap: space.xs,
    paddingVertical: space.sm,
  },
  taskFieldTitle: {
    fontSize: typeTokens.body.fontSize,
    color: color.text.primary,
    fontWeight: '600',
  },
  changeLabel: {
    color: color.primary.violet,
    fontSize: typeTokens.label.fontSize,
    fontWeight: '600',
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
  statusLabel: {
    fontSize: typeTokens.label.fontSize,
    fontWeight: '600',
    color: color.text.secondary,
    textTransform: 'uppercase',
  },
  timer: {
    fontSize: typeTokens.display.fontSize,
    lineHeight: typeTokens.display.lineHeight * 1.4,
    fontWeight: '700',
    color: color.primary.violet,
  },
  syncCaption: {
    fontSize: typeTokens.caption.fontSize,
    color: color.text.disabled,
  },
  syncCaptionStale: {
    color: color.warning.strong,
  },
  actions: {
    gap: space.sm,
    marginTop: space.xs,
  },
});
