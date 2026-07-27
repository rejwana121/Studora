import { useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';

import { Banner } from '@/components/banner';
import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { color, radius, space, type as typeTokens } from '@/design-system/tokens';
import type { BreakOutcome } from './use-focus-session';

const TAKE_BREAK_CHOICES = [10, 15] as const;

interface BreakPromptModalProps {
  visible: boolean;
  isMutating: boolean;
  onTakeBreak: (durationMinutes: number) => Promise<BreakOutcome>;
  onSnooze: () => Promise<BreakOutcome>;
  onDismiss: () => Promise<BreakOutcome>;
}

/** The only exits from this modal are the three server actions below —
 * there is deliberately no generic close/cancel control. `onRequestClose`
 * (Android back button) is a required prop but is a no-op here, and
 * this uses a plain (non-`pageSheet`) RN core `Modal`, which has no
 * iOS swipe-to-dismiss gesture — so as long as no backdrop-tap handler
 * is added, the only way out is Take Break / Snooze / Dismiss actually
 * succeeding (or the session's own state changing elsewhere, which the
 * parent reflects by no longer rendering `visible`). */
export function BreakPromptModal({ visible, isMutating, onTakeBreak, onSnooze, onDismiss }: BreakPromptModalProps) {
  const [retryError, setRetryError] = useState<string | null>(null);

  function handleOutcome(outcome: BreakOutcome) {
    if (outcome === 'retry-eligible') {
      setRetryError('That didn’t go through — please try again.');
      return;
    }
    // 'ok' / 'resolved-no-retry' / 'superseded': the session's own state
    // (applied by the hook already) is authoritative now — clear any
    // stale retry message. The modal closes naturally via the parent no
    // longer considering the session break-eligible.
    setRetryError(null);
  }

  async function handleTakeBreak(minutes: number) {
    handleOutcome(await onTakeBreak(minutes));
  }

  async function handleSnooze() {
    handleOutcome(await onSnooze());
  }

  async function handleDismiss() {
    handleOutcome(await onDismiss());
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <ThemedText type="default" style={styles.title}>
            Time for a break?
          </ThemedText>
          <ThemedText type="default" style={styles.body}>
            You&apos;ve been studying continuously for a while.
          </ThemedText>

          {retryError && <Banner variant="error" message={retryError} />}

          <View style={styles.section}>
            <ThemedText type="default" style={styles.sectionLabel}>
              Take Break
            </ThemedText>
            <View style={styles.row}>
              {TAKE_BREAK_CHOICES.map((minutes) => (
                <View key={minutes} style={styles.rowItem}>
                  <Button
                    label={`${minutes} min`}
                    variant="primary"
                    onPress={() => handleTakeBreak(minutes)}
                    disabled={isMutating}
                  />
                </View>
              ))}
            </View>
          </View>

          <Button label="Snooze" variant="secondary" onPress={handleSnooze} disabled={isMutating} />
          <Button label="Dismiss" variant="text" onPress={handleDismiss} disabled={isMutating} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(27,23,48,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.lg,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: color.background.card,
    borderRadius: radius.card,
    padding: space.lg,
    gap: space.sm,
  },
  title: {
    fontSize: typeTokens.heading.fontSize,
    lineHeight: typeTokens.heading.lineHeight,
    fontWeight: '700',
    color: color.text.primary,
  },
  body: {
    fontSize: typeTokens.body.fontSize,
    color: color.text.secondary,
  },
  section: {
    gap: space.xs,
    marginTop: space.xs,
  },
  sectionLabel: {
    fontSize: typeTokens.label.fontSize,
    fontWeight: '600',
    color: color.text.secondary,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    gap: space.sm,
  },
  rowItem: {
    flex: 1,
  },
});
