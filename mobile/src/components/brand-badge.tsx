import { StyleSheet, View } from 'react-native';

import { ThemedText } from './themed-text';
import { color } from '@/design-system/tokens';

type BrandBadgeTone = 'solid' | 'onGradient';

interface BrandBadgeProps {
  size?: number;
  tone?: BrandBadgeTone;
}

/**
 * Temporary text-mark badge ("S") standing in for a real logo/icon asset —
 * plain View + Text, no image asset, so it costs nothing and blocks nothing
 * later when a designed mark replaces it.
 */
export function BrandBadge({ size = 48, tone = 'solid' }: BrandBadgeProps) {
  const isOnGradient = tone === 'onGradient';

  return (
    <View
      style={[
        styles.badge,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: isOnGradient ? 'rgba(255,255,255,0.92)' : color.primary.violet,
        },
      ]}
    >
      <ThemedText
        type="default"
        style={[
          styles.letter,
          { fontSize: size * 0.44, color: isOnGradient ? color.primary.violet : color.text.onFill },
        ]}
      >
        S
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  letter: {
    fontWeight: '700',
  },
});
