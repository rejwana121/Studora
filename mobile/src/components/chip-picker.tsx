import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from './themed-text';
import { color, radius, space, type as typeTokens } from '@/design-system/tokens';

export interface ChipOption {
  value: string;
  label: string;
  dotColor?: string;
}

interface ChipPickerProps {
  label: string;
  options: ChipOption[];
  value: string | null;
  onChange: (value: string) => void;
  error?: string | null;
}

export function ChipPicker({ label, options, value, onChange, error }: ChipPickerProps) {
  return (
    <View style={styles.container}>
      <ThemedText type="default" style={styles.label}>
        {label}
      </ThemedText>
      <View style={styles.row}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => onChange(option.value)}
              style={[styles.chip, selected && styles.chipSelected]}
            >
              {option.dotColor && <View style={[styles.dot, { backgroundColor: option.dotColor }]} />}
              <ThemedText type="default" style={[styles.chipLabel, selected && styles.chipLabelSelected]}>
                {option.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
      {!!error && (
        <ThemedText type="default" style={styles.errorText}>
          {error}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: space.xs,
    alignSelf: 'stretch',
  },
  label: {
    color: color.text.secondary,
    fontSize: typeTokens.label.fontSize,
    lineHeight: typeTokens.label.lineHeight,
    fontWeight: typeTokens.label.fontWeight,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: color.border.divider,
    backgroundColor: color.background.card,
  },
  chipSelected: {
    borderColor: color.primary.violet,
    backgroundColor: color.accent.lavender,
  },
  chipLabel: {
    fontSize: typeTokens.caption.fontSize,
    color: color.text.secondary,
    fontWeight: '600',
  },
  chipLabelSelected: {
    color: color.primary.violet,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
  },
  errorText: {
    color: color.risk.high.text,
    fontSize: typeTokens.caption.fontSize,
    lineHeight: typeTokens.caption.lineHeight,
  },
});
