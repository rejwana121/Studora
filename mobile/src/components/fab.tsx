import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from './themed-text';
import { color, elevation, radius, shadowStyle, space } from '@/design-system/tokens';

interface FabProps {
  onPress: () => void;
  accessibilityLabel: string;
  /** Distance from the screen's bottom edge. Defaults to `space.lg` — the
   * exact value every existing caller (Subjects, Planner) already got
   * implicitly, so omitting this prop is byte-for-byte unchanged. Tasks
   * passes a safe-area-inset-aware value instead, so the FAB never sits
   * flush against a gesture-nav bar. */
  bottomOffset?: number;
}

/** Floating "+" action button — bottom-right, per the Tasks/Subjects
 * wireframes' "[+] Add ..." floating action. */
export function Fab({ onPress, accessibilityLabel, bottomOffset = space.lg }: FabProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [styles.fab, { bottom: bottomOffset }, pressed && styles.pressed]}
    >
      <ThemedText type="default" style={styles.icon}>
        +
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: space.lg,
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: color.primary.violet,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadowStyle(elevation.raised),
  },
  pressed: {
    opacity: 0.85,
  },
  icon: {
    color: color.text.onFill,
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '600',
  },
});
