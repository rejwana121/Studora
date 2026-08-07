import { Fragment } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { color, radius, space, touchTarget, type as typeTokens } from '@/design-system/tokens';

export interface OptionSheetOption {
  value: string;
  label: string;
  dotColor?: string;
  /** Renders the row in the app's existing destructive tone (coral,
   * matching ChangePhotoSheet's "Remove Photo" row) instead of the normal
   * selection styling — for a menu action like "Delete Task", not an
   * actual selectable value. */
  destructive?: boolean;
}

interface OptionSheetProps {
  visible: boolean;
  title: string;
  options: OptionSheetOption[];
  value: string | null;
  onSelect: (value: string) => void;
  onCancel: () => void;
}

/** Bottom-anchored single-select list — same Modal + backdrop + grabber +
 * bordered-row-group + Cancel structure as `features/profile/change-photo-
 * sheet.tsx` (Profile Checkpoint 2C, already approved/committed), reused
 * here for Tasks' Subject/Type selection instead of a wrapping multi-chip
 * row. Options scroll internally when the list is long (Type has 9
 * values); values passed through untouched — this component never
 * transforms or drops an option. */
export function OptionSheet({ visible, title, options, value, onSelect, onCancel }: OptionSheetProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable
        style={styles.backdrop}
        onPress={onCancel}
        accessibilityRole="button"
        accessibilityLabel="Close"
      >
        <Pressable
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, space.lg) }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.grabber} />
          <ThemedText type="default" style={styles.title}>
            {title}
          </ThemedText>

          <ScrollView style={styles.optionsScroll} showsVerticalScrollIndicator={false}>
            <View style={styles.group}>
              {options.map((option, index) => {
                const selected = option.value === value;
                return (
                  <Fragment key={option.value}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={selected ? `${option.label}, selected` : option.label}
                      onPress={() => onSelect(option.value)}
                      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                    >
                      {option.dotColor && <View style={[styles.dot, { backgroundColor: option.dotColor }]} />}
                      <ThemedText
                        type="default"
                        style={[
                          styles.rowLabel,
                          selected && styles.rowLabelSelected,
                          option.destructive && styles.rowLabelDestructive,
                        ]}
                        numberOfLines={1}
                      >
                        {option.label}
                      </ThemedText>
                      {selected && !option.destructive && (
                        <Icon name="checkmark" size="sm" color={color.primary.violet} />
                      )}
                    </Pressable>
                    {index < options.length - 1 && <View style={styles.divider} />}
                  </Fragment>
                );
              })}
            </View>
          </ScrollView>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            onPress={onCancel}
            style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}
          >
            <ThemedText type="default" style={styles.cancelLabel}>
              Cancel
            </ThemedText>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(27,23,48,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '75%',
    backgroundColor: color.surface.canvas,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    padding: space.lg,
    gap: space.md,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: color.border.divider,
  },
  title: {
    fontSize: typeTokens.subheading.fontSize,
    lineHeight: typeTokens.subheading.lineHeight,
    fontWeight: '700',
    color: color.text.primary,
    textAlign: 'center',
  },
  optionsScroll: {
    flexGrow: 0,
  },
  group: {
    backgroundColor: color.background.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.border.divider,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: touchTarget.min,
    paddingHorizontal: space.md,
  },
  rowPressed: {
    opacity: 0.7,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: radius.pill,
  },
  rowLabel: {
    flex: 1,
    fontSize: typeTokens.body.fontSize,
    color: color.text.primary,
  },
  rowLabelSelected: {
    fontWeight: '700',
    color: color.primary.violet,
  },
  rowLabelDestructive: {
    fontWeight: '600',
    color: color.risk.high.text,
  },
  divider: {
    height: 1,
    backgroundColor: color.border.divider,
    marginHorizontal: space.md,
  },
  cancelButton: {
    minHeight: touchTarget.min,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.border.divider,
    backgroundColor: color.background.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelLabel: {
    fontSize: typeTokens.body.fontSize,
    fontWeight: '600',
    color: color.primary.violet,
  },
  pressed: {
    opacity: 0.7,
  },
});
