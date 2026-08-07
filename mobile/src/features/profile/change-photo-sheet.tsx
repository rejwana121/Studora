import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { color, radius, space, touchTarget, type as typeTokens } from '@/design-system/tokens';

interface ChangePhotoSheetProps {
  visible: boolean;
  /** Hides "Remove Photo" when there's nothing to remove. */
  hasPhoto: boolean;
  /** Disables every row (upload/remove in flight) — prevents duplicate taps. */
  isBusy: boolean;
  onChooseFromLibrary: () => void;
  onTakePhoto: () => void;
  onRemovePhoto: () => void;
  onCancel: () => void;
}

/** Bottom-anchored action sheet — this project's Modal usage so far is
 * either a centered fade card (BreakPromptModal) or a fullscreen slide
 * (TaskPickerModal); neither fits a compact 3-4-row photo-action menu, so
 * this introduces the bottom-sheet variant, built from the same Modal +
 * design-token primitives as those two rather than a new dependency. */
export function ChangePhotoSheet({
  visible,
  hasPhoto,
  isBusy,
  onChooseFromLibrary,
  onTakePhoto,
  onRemovePhoto,
  onCancel,
}: ChangePhotoSheetProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable
        style={styles.backdrop}
        onPress={isBusy ? undefined : onCancel}
        accessibilityRole="button"
        accessibilityLabel="Close"
      >
        <Pressable
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, space.lg) }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.grabber} />
          <ThemedText type="default" style={styles.title}>
            Profile photo
          </ThemedText>

          <View style={styles.group}>
            <SheetRow
              icon="image-outline"
              label="Choose from Photos"
              onPress={onChooseFromLibrary}
              disabled={isBusy}
            />
            <View style={styles.divider} />
            <SheetRow icon="camera-outline" label="Take a Photo" onPress={onTakePhoto} disabled={isBusy} />
            {hasPhoto && (
              <>
                <View style={styles.divider} />
                <SheetRow
                  icon="trash-outline"
                  label="Remove Photo"
                  onPress={onRemovePhoto}
                  disabled={isBusy}
                  destructive
                />
              </>
            )}
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            onPress={onCancel}
            disabled={isBusy}
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

function SheetRow({
  icon,
  label,
  onPress,
  disabled,
  destructive,
}: {
  icon: React.ComponentProps<typeof Icon>['name'];
  label: string;
  onPress: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  const tint = destructive ? color.risk.high.text : color.primary.violet;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.row, pressed && !disabled && styles.pressed, disabled && styles.rowDisabled]}
    >
      <Icon name={icon} size="md" color={tint} />
      <ThemedText type="default" style={[styles.rowLabel, { color: tint }]}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(27,23,48,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
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
    minHeight: 54,
    paddingHorizontal: space.md,
  },
  rowDisabled: {
    opacity: 0.5,
  },
  rowLabel: {
    fontSize: typeTokens.body.fontSize,
    fontWeight: '500',
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
