import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from './themed-text';
import { color, radius, space, subjectColor, type as typeTokens } from '@/design-system/tokens';
import type { Subject } from '@/types/api';

interface SubjectRowProps {
  subject: Subject;
  onEdit: () => void;
  onToggleArchive: () => void;
}

export function SubjectRow({ subject, onEdit, onToggleArchive }: SubjectRowProps) {
  const isArchived = subject.archived_at !== null;

  return (
    <View style={[styles.row, isArchived && styles.rowArchived]}>
      <Pressable
        accessibilityRole="button"
        onPress={onEdit}
        style={({ pressed }) => [styles.main, pressed && styles.pressed]}
      >
        <View style={[styles.swatch, { backgroundColor: subjectColor[subject.color_token] }]} />
        <View style={styles.content}>
          <ThemedText type="default" style={styles.name} numberOfLines={1}>
            {subject.name}
          </ThemedText>
          {isArchived && (
            <ThemedText type="default" style={styles.archivedBadge}>
              Archived
            </ThemedText>
          )}
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={onToggleArchive}
        style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}
      >
        <ThemedText type="default" style={styles.actionLabel}>
          {isArchived ? 'Unarchive' : 'Archive'}
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: color.background.card,
    borderRadius: radius.card,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    gap: space.sm,
  },
  rowArchived: {
    opacity: 0.6,
  },
  main: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  pressed: {
    opacity: 0.7,
  },
  swatch: {
    width: 20,
    height: 20,
    borderRadius: radius.pill,
  },
  content: {
    flex: 1,
    gap: space.xs,
  },
  name: {
    fontSize: typeTokens.body.fontSize,
    fontWeight: '600',
    color: color.text.primary,
  },
  archivedBadge: {
    fontSize: typeTokens.caption.fontSize,
    color: color.text.secondary,
    textTransform: 'uppercase',
  },
  actionButton: {
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  actionLabel: {
    fontSize: typeTokens.label.fontSize,
    color: color.primary.violet,
    fontWeight: '600',
  },
});
