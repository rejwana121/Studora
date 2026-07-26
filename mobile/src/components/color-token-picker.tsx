import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from './themed-text';
import { color, radius, space, subjectColor, touchTarget, type as typeTokens } from '@/design-system/tokens';
import type { SubjectColorToken } from '@/types/api';

const TOKENS = Object.keys(subjectColor) as SubjectColorToken[];

interface ColorTokenPickerProps {
  label: string;
  value: SubjectColorToken | null;
  onChange: (token: SubjectColorToken) => void;
}

export function ColorTokenPicker({ label, value, onChange }: ColorTokenPickerProps) {
  return (
    <View style={styles.container}>
      <ThemedText type="default" style={styles.label}>
        {label}
      </ThemedText>
      <View style={styles.row}>
        {TOKENS.map((token) => {
          const selected = token === value;
          return (
            <Pressable
              key={token}
              accessibilityRole="button"
              accessibilityLabel={token}
              accessibilityState={{ selected }}
              onPress={() => onChange(token)}
              style={[
                styles.swatch,
                { backgroundColor: subjectColor[token] },
                selected && styles.selected,
              ]}
            />
          );
        })}
      </View>
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
    gap: space.sm,
  },
  swatch: {
    width: touchTarget.min,
    height: touchTarget.min,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selected: {
    borderColor: color.text.primary,
  },
});
