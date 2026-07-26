import { StyleSheet, View } from 'react-native';

import { Button } from './button';
import { ThemedText } from './themed-text';
import { color, space, type as typeTokens } from '@/design-system/tokens';

interface EmptyStateProps {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ message, actionLabel, onAction }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <ThemedText type="default" style={styles.message}>
        {message}
      </ThemedText>
      {actionLabel && onAction && <Button label={actionLabel} onPress={onAction} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    paddingVertical: space.xl,
  },
  message: {
    fontSize: typeTokens.body.fontSize,
    lineHeight: typeTokens.body.lineHeight,
    color: color.text.secondary,
    textAlign: 'center',
  },
});
