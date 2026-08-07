import { Image } from 'expo-image';
import { Platform, StyleSheet, View } from 'react-native';

import { ThemedText } from './themed-text';
import { color, elevation, shadowStyle } from '@/design-system/tokens';

interface AvatarProps {
  /** Display name or email — whichever the caller has already loaded.
   * Both Today and Profile now read the same `display_name ?? email`
   * fallback from the shared session/profile context, so this always
   * yields identical initials for the same user regardless of screen. */
  label: string;
  size?: number;
  /** Freshly generated signed URL for the user's avatar (never a stored/
   * persisted URL — signed URLs expire). `null`/`undefined` renders the
   * initials fallback below. */
  uri?: string | null;
  /** 'squircle' (default) preserves Today's existing shell exactly.
   * 'circle' is Profile's large photo/initials avatar, matching the
   * approved Profile reference — same clipping applies to both the photo
   * and the initials fallback, since both render inside the same box. */
  shape?: 'squircle' | 'circle';
}

/** Two-word names take first-letter-of-each ("Rejwana Akter" -> "RA");
 * anything else (a single name, an email used as fallback, ...) takes just
 * its first character ("Rejwana" -> "R"), not the first two — a bare
 * `slice(0, 2)` used to grab two characters off single-word input, which
 * read as a typo-looking initial rather than a real initial. */
function getInitials(source: string): string {
  const words = source.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return (words[0]?.[0] ?? '').toUpperCase();
}

/** Crisp white shell lifted by a restrained shadow, with the initials as
 * the sole violet accent inside (no ring/outline, no tinted fill competing
 * with whatever surface it sits on) — or a photo, clipped to the same
 * shell. `shape` controls only the corner radius (`'squircle'`, the
 * default, is a rounded square; `'circle'` is a true circle); everything
 * else about the shell — size, background, shadow — is identical either
 * way, and the photo/initials content clips to whichever shape is chosen
 * via the exact same `boxStyle`. Contrast (initials vs white shell):
 * `primary.violet` 7.1:1, passes AA. */
export function Avatar({ label, size = 40, uri, shape = 'squircle' }: AvatarProps) {
  const initials = getInitials(label);
  const cornerRadius = shape === 'circle' ? size / 2 : size * 0.32;
  const boxStyle = { width: size, height: size, borderRadius: cornerRadius };

  // Two layers, not one: `overflow: hidden` (needed to clip a photo to the
  // squircle) and a shadow cannot live on the same view — RN clips the
  // shadow along with the content. The outer view carries the shadow only;
  // the inner view carries the clip + background + content.
  return (
    <View style={[boxStyle, shadowStyle(elevation.card)]}>
      <View style={[styles.shell, boxStyle]}>
        {uri ? (
          <Image source={{ uri }} style={boxStyle} contentFit="cover" transition={150} />
        ) : (
          // `type="default"` carries a fixed lineHeight:24 from ThemedText's
          // base style; at large avatar sizes the scaled fontSize exceeds
          // that line box and RN clips the glyph against `shell`'s
          // `overflow: hidden`. Overriding lineHeight to track fontSize
          // (not just fontSize alone) is what actually fixes it.
          <ThemedText
            type="default"
            style={[styles.text, { fontSize: size * 0.4, lineHeight: size * 0.4 * 1.2 }]}
          >
            {initials}
          </ThemedText>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: color.background.card,
  },
  text: {
    color: color.primary.violet,
    fontWeight: '700',
    textAlign: 'center',
    // Android pads glyphs with extra vertical metrics space by default,
    // which fights the explicit lineHeight override above and re-offsets
    // the initials from true center.
    includeFontPadding: Platform.OS === 'android' ? false : undefined,
  },
});
