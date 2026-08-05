import { Ionicons } from '@expo/vector-icons';

type IconSize = 'sm' | 'md' | 'lg';

const SIZE_MAP: Record<IconSize, number> = { sm: 16, md: 20, lg: 24 };

interface IconProps {
  name: keyof typeof Ionicons.glyphMap;
  size?: IconSize;
  /** Required (no silent default) — every caller must pass a design-token
   * colour rather than letting an implicit default drift from the system. */
  color: string;
}

/** Thin wrapper over the project's existing Ionicons dependency (already
 * used for the tab bar, back-chevrons and subtask checkboxes) — the
 * single icon system for Studora 2.0, replacing ad hoc glyph characters
 * baked into ThemedText. */
export function Icon({ name, size = 'md', color }: IconProps) {
  return <Ionicons name={name} size={SIZE_MAP[size]} color={color} />;
}
