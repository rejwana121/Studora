import { StyleSheet, View, type ViewProps } from 'react-native';

import { color, elevation, radius, shadowStyle, space } from '@/design-system/tokens';

type SectionCardVariant = 'default' | 'emphasis';

interface SectionCardProps extends ViewProps {
  /** Both variants are white with the *same neutral* `border.divider`
   * ring — purple never appears as a card border, only in the icons/
   * chips/text placed inside one. "default": `elevation.card`, every
   * ordinary section. "emphasis": the stronger `elevation.raised` only —
   * at most one per screen (the hero) — shadow strength is the sole
   * signal that distinguishes it, not colour. */
  variant?: SectionCardVariant;
  /** false: no internal padding, corners clip content — for a grouped
   * list of full-bleed rows that supply their own padding/dividers
   * (mirrors the existing Tasks-list container pattern). Default true. */
  padded?: boolean;
}

/** Shared L1/L2 surface wrapper — always white (`background.card`), never
 * a colour-fill card. A hairline neutral border (the AuthShell card
 * already establishes this precedent) plus a real shadow define the edge,
 * since a white card against a light canvas has very low colour-contrast
 * on its own (~1.05–1.2:1 against either `background.main` or
 * `surface.canvas`). */
export function SectionCard({ variant = 'default', padded = true, style, children, ...rest }: SectionCardProps) {
  return (
    <View
      style={[
        styles.base,
        variant === 'emphasis' ? styles.emphasis : styles.default,
        padded ? styles.padded : styles.unpadded,
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.card,
    backgroundColor: color.background.card,
    borderWidth: 1,
    borderColor: color.border.divider,
  },
  default: {
    ...shadowStyle(elevation.card),
  },
  emphasis: {
    ...shadowStyle(elevation.raised),
  },
  padded: {
    padding: space.md,
    gap: space.sm,
  },
  unpadded: {
    padding: 0,
    overflow: 'hidden',
  },
});
