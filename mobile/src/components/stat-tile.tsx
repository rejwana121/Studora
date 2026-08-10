import { StyleSheet, View } from 'react-native';

import { Icon } from './icon';
import { ThemedText } from './themed-text';
import { color, radius, space, type as typeTokens } from '@/design-system/tokens';

type StatTileTone = 'violet' | 'attention' | 'neutral';

/** Each tone is a distinct existing pastel token, never a new one:
 * violet = accent.lavender (Active), attention = risk.high.bg (Overdue,
 * the same red-tinted token the app already uses for error banners),
 * neutral = accent.mint (Due soon). Only "attention"'s own text sits in
 * its tone colour (risk.high.text, 5.6:1 on risk.high.bg) — violet/neutral
 * text stays on `text.primary` so contrast never depends on a per-tone
 * text colour that's merely "good enough"; only the icon carries the
 * tone accent for violet/neutral (still ≥3:1, verified for icon use). */
const TONE_STYLE: Record<StatTileTone, { bg: string; iconColor: string }> = {
  violet: { bg: color.accent.lavender, iconColor: color.primary.violet },
  attention: { bg: color.risk.high.bg, iconColor: color.risk.high.text },
  neutral: { bg: color.accent.mint, iconColor: color.secondary.tealStrong },
};

interface StatTileProps {
  icon: React.ComponentProps<typeof Icon>['name'];
  label: string;
  value: number | string;
  tone?: StatTileTone;
}

export function StatTile({ icon, label, value, tone = 'violet' }: StatTileProps) {
  const { bg, iconColor } = TONE_STYLE[tone];
  const textColor = tone === 'attention' ? iconColor : color.text.primary;

  return (
    <View style={[styles.tile, { backgroundColor: bg }]}>
      <View style={styles.iconBadge}>
        <Icon name={icon} size="sm" color={iconColor} />
      </View>
      <ThemedText type="default" style={[styles.value, { color: textColor }]}>
        {value}
      </ThemedText>
      <ThemedText type="default" style={[styles.label, { color: textColor }]} numberOfLines={1}>
        {label}
      </ThemedText>
    </View>
  );
}

export function StatRow({ children }: { children: React.ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: space.sm,
  },
  tile: {
    flex: 1,
    minHeight: 68,
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 2,
    borderRadius: radius.control,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  // Translucent white on every tone's own pastel bg — gives the icon a
  // distinct "badge" instead of floating bare, without inventing a new
  // colour token per tone.
  iconBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  value: {
    fontSize: typeTokens.heading.fontSize,
    lineHeight: typeTokens.heading.lineHeight,
    fontWeight: '700',
  },
  label: {
    fontSize: typeTokens.caption.fontSize,
    lineHeight: typeTokens.caption.lineHeight,
  },
});
