import { StyleSheet, View } from 'react-native';

import { ThemedText } from './themed-text';
import { color, elevation, shadowStyle } from '@/design-system/tokens';

interface AvatarProps {
  /** Display name or email — whichever the caller has already loaded.
   * Today has no `display_name` (Profile is not fetched there), so it
   * passes the session email; this yields the same initials Profile's own
   * email-only fallback already produces for the same user. */
  label: string;
  size?: number;
}

/** Same 2-word-first-letters / first-two-characters algorithm as
 * `profile.tsx`'s `getInitials` — duplicated here deliberately (Profile
 * is out of scope for this checkpoint) rather than extracted, so the two
 * screens stay in sync without editing Profile now. */
function getInitials(source: string): string {
  const words = source.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

/** Compact premium "squircle" — a rounded square, not a circle — crisp
 * white shell lifted by a restrained shadow, with the initials as the
 * sole violet accent inside (no ring/outline, no tinted fill competing
 * with whatever surface it sits on). The shell (size/shape/background/
 * shadow) and the content (currently initials text) are deliberately
 * separate: a real profile photo can later replace the `ThemedText` with
 * an `Image` inside this same shell, at the same size, with no layout
 * change at any call site. Contrast (initials vs white shell):
 * `primary.violet` 7.1:1, passes AA. */
export function Avatar({ label, size = 40 }: AvatarProps) {
  const initials = getInitials(label);
  const cornerRadius = size * 0.32; // squircle, not size / 2 (a circle)

  return (
    <View style={[styles.shell, { width: size, height: size, borderRadius: cornerRadius }]}>
      <ThemedText type="default" style={[styles.text, { fontSize: size * 0.4 }]}>
        {initials}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.background.card,
    ...shadowStyle(elevation.card),
  },
  text: {
    color: color.primary.violet,
    fontWeight: '700',
  },
});
