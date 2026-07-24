import { StyleSheet, View } from 'react-native';

import { ThemedText } from './themed-text';
import { color, radius, space, type as typeTokens } from '@/design-system/tokens';

type BannerVariant = 'error' | 'warning' | 'success' | 'info';

interface BannerProps {
  variant: BannerVariant;
  message: string;
}

const VARIANT_GLYPH: Record<BannerVariant, string> = {
  error: '✕',
  warning: '⚠',
  success: '✓',
  info: 'ℹ',
};

const VARIANT_STYLE: Record<BannerVariant, { bg: string; text: string }> = {
  error: { bg: color.risk.high.bg, text: color.risk.high.text },
  warning: { bg: color.risk.moderate.bg, text: color.warning.strong },
  success: { bg: color.risk.low.bg, text: color.success.strong },
  info: { bg: color.info.bg, text: color.info.text },
};

export function Banner({ variant, message }: BannerProps) {
  const tone = VARIANT_STYLE[variant];

  return (
    <View
      style={[styles.container, { backgroundColor: tone.bg }]}
      accessibilityRole="alert"
    >
      <ThemedText type="default" style={[styles.glyph, { color: tone.text }]}>
        {VARIANT_GLYPH[variant]}
      </ThemedText>
      <ThemedText type="default" style={[styles.message, { color: tone.text }]}>
        {message}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    borderRadius: radius.control,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  glyph: {
    fontSize: typeTokens.body.fontSize,
    fontWeight: '700',
  },
  message: {
    flex: 1,
    fontSize: typeTokens.body.fontSize,
    lineHeight: typeTokens.body.lineHeight,
  },
});
